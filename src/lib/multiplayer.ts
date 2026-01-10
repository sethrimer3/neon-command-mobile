import { GameState, CommandNode, Unit, Base } from './types';
import { RealtimeKVStore, createRealtimeStore } from './realtimeStore';

export interface MultiplayerState {
  gameId: string;
  hostId: string;
  guestId: string | null;
  hostReady: boolean;
  guestReady: boolean;
  gameStarted: boolean;
  turnNumber: number;
  lastUpdate: number;
}

export interface GameCommand {
  playerId: string;
  timestamp: number;
  commands: Array<{
    type: 'spawn' | 'move' | 'ability' | 'baseMove' | 'baseLaser' | 'select';
    unitIds?: string[];
    baseId?: string;
    position?: { x: number; y: number };
    direction?: { x: number; y: number };
    spawnType?: string;
  }>;
}

export interface LobbyData {
  gameId: string;
  hostId: string;
  hostName: string;
  hostColor: string;
  guestId: string | null;
  guestName: string | null;
  guestColor: string | null;
  status: 'waiting' | 'ready' | 'playing' | 'finished';
  created: number;
  mapId: string;
  enabledUnits: string[];
}

const GAME_UPDATE_INTERVAL = 100;
const LOBBY_TIMEOUT = 300000;

export class MultiplayerManager {
  private gameId: string | null = null;
  private playerId: string;
  private isHost: boolean = false;
  private updateInterval: number | null = null;
  private commandQueue: GameCommand[] = [];
  private lastSyncTime: number = 0;
  // Store abstracts the realtime backend (Spark, Supabase, or future paid providers).
  private store: RealtimeKVStore;

  /**
   * Initializes the multiplayer manager with a backend store for persistence.
   * @param playerId - Unique player identifier for commands and lobby ownership.
   * @param store - Optional realtime store to ease swapping services later.
   */
  constructor(playerId: string, store: RealtimeKVStore = createRealtimeStore()) {
    this.playerId = playerId;
    this.store = store;
  }

  async createGame(hostName: string, hostColor: string, mapId: string, enabledUnits: string[]): Promise<string> {
    // Require a configured backend to avoid creating lobbies that cannot sync.
    if (!this.store.isAvailable()) {
      throw new Error('Multiplayer requires Spark runtime or Supabase credentials (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).');
    }
    
    const gameId = `game_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    const lobby: LobbyData = {
      gameId,
      hostId: this.playerId,
      hostName,
      hostColor,
      guestId: null,
      guestName: null,
      guestColor: null,
      status: 'waiting',
      created: Date.now(),
      mapId,
      enabledUnits,
    };

    await this.store.set(`lobby:${gameId}`, lobby);
    await this.addToLobbyList(gameId);
    
    this.gameId = gameId;
    this.isHost = true;
    
    return gameId;
  }

  async joinGame(gameId: string, guestName: string, guestColor: string): Promise<boolean> {
    if (!this.store.isAvailable()) {
      return false;
    }
    
    const lobby = await this.store.get<LobbyData>(`lobby:${gameId}`);
    
    if (!lobby || lobby.guestId !== null || lobby.status !== 'waiting') {
      return false;
    }

    lobby.guestId = this.playerId;
    lobby.guestName = guestName;
    lobby.guestColor = guestColor;
    lobby.status = 'ready';

    await this.store.set(`lobby:${gameId}`, lobby);
    
    this.gameId = gameId;
    this.isHost = false;
    
    return true;
  }

  async startGame(): Promise<void> {
    if (!this.store.isAvailable() || !this.gameId || !this.isHost) return;

    const lobby = await this.store.get<LobbyData>(`lobby:${this.gameId}`);
    if (!lobby || !lobby.guestId) return;

    lobby.status = 'playing';
    await this.store.set(`lobby:${this.gameId}`, lobby);

    const multiplayerState: MultiplayerState = {
      gameId: this.gameId,
      hostId: lobby.hostId,
      guestId: lobby.guestId,
      hostReady: true,
      guestReady: true,
      gameStarted: true,
      turnNumber: 0,
      lastUpdate: Date.now(),
    };

    await this.store.set(`game:${this.gameId}:state`, multiplayerState);
  }

  async getLobby(gameId: string): Promise<LobbyData | null> {
    if (!this.store.isAvailable()) return null;
    return await this.store.get<LobbyData>(`lobby:${gameId}`) || null;
  }

  async getAvailableLobbies(): Promise<LobbyData[]> {
    if (!this.store.isAvailable()) return [];
    
    const lobbyListKey = 'multiplayer:lobbies';
    const lobbyIds = await this.store.get<string[]>(lobbyListKey) || [];
    
    const lobbies: LobbyData[] = [];
    const now = Date.now();
    const validLobbyIds: string[] = [];

    for (const gameId of lobbyIds) {
      const lobby = await this.store.get<LobbyData>(`lobby:${gameId}`);
      
      if (lobby && lobby.status === 'waiting' && (now - lobby.created) < LOBBY_TIMEOUT) {
        lobbies.push(lobby);
        validLobbyIds.push(gameId);
      }
    }

    await this.store.set(lobbyListKey, validLobbyIds);
    
    return lobbies;
  }

  async sendCommand(command: Omit<GameCommand, 'playerId' | 'timestamp'>): Promise<void> {
    if (!this.store.isAvailable() || !this.gameId) return;

    const fullCommand: GameCommand = {
      ...command,
      playerId: this.playerId,
      timestamp: Date.now(),
    };

    const commandKey = `game:${this.gameId}:commands:${fullCommand.timestamp}`;
    await this.store.set(commandKey, fullCommand);
  }

  async getCommands(since: number): Promise<GameCommand[]> {
    if (!this.store.isAvailable() || !this.gameId) return [];

    const commands: GameCommand[] = [];
    const prefix = `game:${this.gameId}:commands:`;
    const entries = await this.store.listEntries<GameCommand>(prefix);

    // Filter entries by timestamp suffix to avoid replaying old commands.
    for (const entry of entries) {
      const timestamp = parseInt(entry.key.split(':').pop() || '0');
      if (timestamp > since && entry.value) {
        commands.push(entry.value);
      }
    }

    return commands.sort((a, b) => a.timestamp - b.timestamp);
  }

  async syncGameState(gameState: Partial<GameState>): Promise<void> {
    if (!this.store.isAvailable() || !this.gameId || !this.isHost) return;

    const now = Date.now();
    if (now - this.lastSyncTime < GAME_UPDATE_INTERVAL) return;

    const syncData = {
      units: gameState.units,
      bases: gameState.bases,
      players: gameState.players,
      elapsedTime: gameState.elapsedTime,
      winner: gameState.winner,
      timestamp: now,
    };

    await this.store.set(`game:${this.gameId}:sync`, syncData);
    this.lastSyncTime = now;
  }

  async getGameState(): Promise<any | null> {
    if (!this.store.isAvailable() || !this.gameId) return null;
    return await this.store.get(`game:${this.gameId}:sync`) || null;
  }

  async leaveGame(): Promise<void> {
    if (!this.store.isAvailable() || !this.gameId) return;

    const lobby = await this.store.get<LobbyData>(`lobby:${this.gameId}`);
    if (lobby) {
      if (this.isHost) {
        lobby.status = 'finished';
      } else {
        lobby.guestId = null;
        lobby.guestName = null;
        lobby.guestColor = null;
        lobby.status = 'waiting';
      }
      await this.store.set(`lobby:${this.gameId}`, lobby);
    }

    this.gameId = null;
    this.isHost = false;
  }

  async endGame(): Promise<void> {
    if (!this.store.isAvailable() || !this.gameId) return;

    const lobby = await this.store.get<LobbyData>(`lobby:${this.gameId}`);
    if (lobby) {
      lobby.status = 'finished';
      await this.store.set(`lobby:${this.gameId}`, lobby);
    }

    await this.removeFromLobbyList(this.gameId);
    
    this.gameId = null;
    this.isHost = false;
  }

  private async addToLobbyList(gameId: string): Promise<void> {
    if (!this.store.isAvailable()) return;
    
    const lobbyListKey = 'multiplayer:lobbies';
    const lobbies = await this.store.get<string[]>(lobbyListKey) || [];
    if (!lobbies.includes(gameId)) {
      lobbies.push(gameId);
      await this.store.set(lobbyListKey, lobbies);
    }
  }

  private async removeFromLobbyList(gameId: string): Promise<void> {
    if (!this.store.isAvailable()) return;
    
    const lobbyListKey = 'multiplayer:lobbies';
    const lobbies = await this.store.get<string[]>(lobbyListKey) || [];
    const filtered = lobbies.filter(id => id !== gameId);
    await this.store.set(lobbyListKey, filtered);
  }

  getPlayerId(): string {
    return this.playerId;
  }

  getGameId(): string | null {
    return this.gameId;
  }

  getIsHost(): boolean {
    return this.isHost;
  }
}
