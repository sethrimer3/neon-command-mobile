import Peer, { DataConnection } from 'peerjs';
import { RealtimeKVStore } from './realtimeStore';

// Timeout for peer-to-peer requests
const P2P_REQUEST_TIMEOUT_MS = 5000;

// Prefix for game host peer IDs to enable discovery
const GAME_HOST_PREFIX = 'solrts-host-';

export interface LANGameInfo {
  peerId: string;
  hostName: string;
  mapId: string;
  created: number;
}

/**
 * LAN multiplayer adapter using WebRTC for direct peer-to-peer connections.
 * This allows players to play together on the same local network without requiring
 * a backend server like Spark or Supabase.
 */
export class LANKVStore implements RealtimeKVStore {
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private isHostPlayer: boolean = false;
  private localData: Map<string, any> = new Map();
  private remoteData: Map<string, any> = new Map();
  private peerId: string | null = null;
  private connected: boolean = false;
  private messageHandlers: Set<(data: any) => void> = new Set();
  private hostName: string = '';
  private mapId: string = '';

  constructor() {
    // Initialization happens in connect() method
  }

  /**
   * Initialize as host - creates a peer ID that others can connect to
   * @param hostName - Name of the host for display in game list
   * @param mapId - Map being used for the game
   */
  async initAsHost(hostName: string = 'Host', mapId: string = 'open'): Promise<string> {
    this.hostName = hostName;
    this.mapId = mapId;
    
    return new Promise((resolve, reject) => {
      // Set a timeout in case PeerJS hangs
      const timeout = setTimeout(() => {
        if (!this.connected) {
          const error = new Error('Connection to PeerJS server timed out. Please check your internet connection.');
          console.error('PeerJS initialization timeout');
          reject(error);
        }
      }, 15000); // 15 second timeout

      try {
        // Generate a unique game host ID with prefix for discovery
        const uniqueId = GAME_HOST_PREFIX + Math.random().toString(36).substring(2, 15);
        
        // Create peer with configuration for better reliability
        this.peer = new Peer(uniqueId, {
          debug: 2, // Enable verbose logging for debugging
          config: {
            iceServers: [
              // Google's public STUN servers
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' },
              { urls: 'stun:stun4.l.google.com:19302' },
            ],
          },
        });
        this.isHostPlayer = true;

        this.peer.on('open', (id) => {
          clearTimeout(timeout);
          this.peerId = id;
          this.connected = true;
          console.log('LAN Host initialized with peer ID:', id);
          resolve(id);
        });

        this.peer.on('connection', (conn) => {
          console.log('Guest connected:', conn.peer);
          this.connection = conn;
          this.setupConnectionHandlers(conn);
        });

        this.peer.on('error', (err) => {
          clearTimeout(timeout);
          console.error('Peer error:', err);
          reject(err);
        });

        this.peer.on('disconnected', () => {
          console.warn('Peer disconnected from server');
        });
      } catch (err) {
        clearTimeout(timeout);
        console.error('Failed to create peer:', err);
        reject(err);
      }
    });
  }

  /**
   * Initialize as guest - connects to host's peer ID
   */
  async initAsGuest(hostPeerId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Set a timeout in case connection hangs
      const timeout = setTimeout(() => {
        if (!this.connected) {
          const error = new Error('Connection to host timed out. Please verify the Peer ID and try again.');
          console.error('Guest connection timeout');
          reject(error);
        }
      }, 15000); // 15 second timeout

      try {
        this.peer = new Peer({
          debug: 2, // Enable verbose logging for debugging
          config: {
            iceServers: [
              // Google's public STUN servers
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' },
              { urls: 'stun:stun4.l.google.com:19302' },
            ],
          },
        });
        this.isHostPlayer = false;

        this.peer.on('open', (id) => {
          this.peerId = id;
          console.log('LAN Guest initialized with peer ID:', id);
          
          // Connect to host
          const conn = this.peer!.connect(hostPeerId, { reliable: true });
          this.connection = conn;
          
          this.setupConnectionHandlers(conn);
          
          conn.on('open', () => {
            clearTimeout(timeout);
            this.connected = true;
            console.log('Connected to host:', hostPeerId);
            resolve();
          });

          conn.on('error', (err) => {
            clearTimeout(timeout);
            console.error('Connection error:', err);
            reject(err);
          });
        });

        this.peer.on('error', (err) => {
          clearTimeout(timeout);
          console.error('Peer error:', err);
          reject(err);
        });

        this.peer.on('disconnected', () => {
          console.warn('Peer disconnected from server');
        });
      } catch (err) {
        clearTimeout(timeout);
        console.error('Failed to create peer:', err);
        reject(err);
      }
    });
  }

  private setupConnectionHandlers(conn: DataConnection) {
    conn.on('data', (data: any) => {
      if (data.type === 'set') {
        // Store data received from peer
        this.remoteData.set(data.key, data.value);
      } else if (data.type === 'delete') {
        this.remoteData.delete(data.key);
      } else if (data.type === 'get') {
        // Respond to get request (host only)
        if (this.isHostPlayer) {
          const value = this.localData.get(data.key) || this.remoteData.get(data.key);
          conn.send({
            type: 'get-response',
            key: data.key,
            value: value || null,
            requestId: data.requestId,
          });
        }
      } else if (data.type === 'get-response') {
        // Handle get response
        this.messageHandlers.forEach(handler => handler(data));
      } else if (data.type === 'list') {
        // Respond to list request (host only)
        if (this.isHostPlayer) {
          const keys = this.getAllKeys().filter(k => k.startsWith(data.prefix));
          conn.send({
            type: 'list-response',
            keys: keys,
            requestId: data.requestId,
          });
        }
      } else if (data.type === 'list-response') {
        // Handle list response
        this.messageHandlers.forEach(handler => handler(data));
      } else if (data.type === 'game-info-request') {
        // Respond to game info request (host only)
        if (this.isHostPlayer) {
          conn.send({
            type: 'game-info-response',
            gameInfo: {
              peerId: this.peerId,
              hostName: this.hostName,
              mapId: this.mapId,
              created: Date.now(),
            },
            requestId: data.requestId,
          });
        }
      } else if (data.type === 'game-info-response') {
        // Handle game info response
        this.messageHandlers.forEach(handler => handler(data));
      }
    });

    conn.on('close', () => {
      console.log('Connection closed');
      this.connected = false;
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
    });
  }

  private getAllKeys(): string[] {
    const allKeys = new Set([
      ...Array.from(this.localData.keys()),
      ...Array.from(this.remoteData.keys()),
    ]);
    return Array.from(allKeys);
  }

  isAvailable(): boolean {
    return this.connected && this.connection !== null;
  }

  async get<T>(key: string): Promise<T | null> {
    // Check local data first
    if (this.localData.has(key)) {
      return this.localData.get(key) as T;
    }

    // Check remote data cache
    if (this.remoteData.has(key)) {
      return this.remoteData.get(key) as T;
    }

    // If we're the guest, request from host
    if (!this.isHostPlayer && this.connection?.open) {
      return new Promise((resolve) => {
        const requestId = Math.random().toString(36).substring(7);
        let timeoutId: ReturnType<typeof setTimeout>;
        
        const handler = (data: any) => {
          if (data.type === 'get-response' && data.requestId === requestId) {
            this.messageHandlers.delete(handler);
            clearTimeout(timeoutId);
            resolve(data.value as T);
          }
        };

        this.messageHandlers.add(handler);
        
        this.connection!.send({
          type: 'get',
          key: key,
          requestId: requestId,
        });

        // Timeout after P2P_REQUEST_TIMEOUT_MS
        timeoutId = setTimeout(() => {
          this.messageHandlers.delete(handler);
          resolve(null);
        }, P2P_REQUEST_TIMEOUT_MS);
      });
    }

    return null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    // Store locally
    this.localData.set(key, value);

    // Send to peer if connected
    if (this.connection?.open) {
      this.connection.send({
        type: 'set',
        key: key,
        value: value,
      });
    }
  }

  async delete(key: string): Promise<void> {
    // Delete locally
    this.localData.delete(key);
    this.remoteData.delete(key);

    // Send delete to peer if connected
    if (this.connection?.open) {
      this.connection.send({
        type: 'delete',
        key: key,
      });
    }
  }

  async list(prefix: string): Promise<string[]> {
    // Get local keys
    const localKeys = this.getAllKeys().filter(k => k.startsWith(prefix));

    // If we're the guest, also request from host
    if (!this.isHostPlayer && this.connection?.open) {
      return new Promise((resolve) => {
        const requestId = Math.random().toString(36).substring(7);
        let timeoutId: ReturnType<typeof setTimeout>;
        
        const handler = (data: any) => {
          if (data.type === 'list-response' && data.requestId === requestId) {
            this.messageHandlers.delete(handler);
            clearTimeout(timeoutId);
            // Combine and deduplicate
            const allKeys = new Set([...localKeys, ...data.keys]);
            resolve(Array.from(allKeys));
          }
        };

        this.messageHandlers.add(handler);
        
        this.connection!.send({
          type: 'list',
          prefix: prefix,
          requestId: requestId,
        });

        // Timeout after P2P_REQUEST_TIMEOUT_MS
        timeoutId = setTimeout(() => {
          this.messageHandlers.delete(handler);
          resolve(localKeys);
        }, P2P_REQUEST_TIMEOUT_MS);
      });
    }

    return localKeys;
  }

  /**
   * Disconnect and cleanup resources
   */
  disconnect() {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.connected = false;
    this.peerId = null;
    this.localData.clear();
    this.remoteData.clear();
    this.messageHandlers.clear();
  }

  /**
   * Get the peer ID for sharing with others
   */
  getPeerId(): string | null {
    return this.peerId;
  }

  /**
   * Check if this is the host
   */
  isHost(): boolean {
    return this.isHostPlayer;
  }

  /**
   * List all available games on the network
   * This is a static method that creates a temporary peer to query available hosts
   */
  static async listAvailableGames(): Promise<LANGameInfo[]> {
    return new Promise((resolve) => {
      const games: LANGameInfo[] = [];
      let tempPeer: Peer | null = null;
      
      // Set a timeout for the discovery process
      const timeout = setTimeout(() => {
        if (tempPeer) {
          tempPeer.destroy();
        }
        console.log('Game discovery completed, found', games.length, 'games');
        resolve(games);
      }, 5000); // 5 second timeout for discovery

      try {
        // Create a temporary peer for discovery
        tempPeer = new Peer({
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
            ],
          },
        });

        tempPeer.on('open', () => {
          console.log('Discovery peer opened, listing all peers...');
          
          // List all peers on the server
          tempPeer!.listAllPeers((peerIds: string[]) => {
            console.log('Found', peerIds.length, 'total peers');
            
            // Filter for game host peers
            const hostPeerIds = peerIds.filter(id => id.startsWith(GAME_HOST_PREFIX));
            console.log('Found', hostPeerIds.length, 'game hosts');
            
            if (hostPeerIds.length === 0) {
              clearTimeout(timeout);
              tempPeer?.destroy();
              resolve(games);
              return;
            }

            let responsesReceived = 0;
            const expectedResponses = hostPeerIds.length;

            // Query each host for game info
            hostPeerIds.forEach(hostPeerId => {
              const conn = tempPeer!.connect(hostPeerId, { reliable: true });
              
              const requestTimeout = setTimeout(() => {
                conn.close();
                responsesReceived++;
                if (responsesReceived >= expectedResponses) {
                  clearTimeout(timeout);
                  tempPeer?.destroy();
                  resolve(games);
                }
              }, 3000); // 3 second timeout per host

              conn.on('open', () => {
                const requestId = Math.random().toString(36).substring(7);
                
                conn.on('data', (data: any) => {
                  if (data.type === 'game-info-response' && data.requestId === requestId) {
                    clearTimeout(requestTimeout);
                    games.push(data.gameInfo);
                    conn.close();
                    responsesReceived++;
                    
                    if (responsesReceived >= expectedResponses) {
                      clearTimeout(timeout);
                      tempPeer?.destroy();
                      resolve(games);
                    }
                  }
                });

                // Request game info
                conn.send({
                  type: 'game-info-request',
                  requestId: requestId,
                });
              });

              conn.on('error', () => {
                clearTimeout(requestTimeout);
                responsesReceived++;
                if (responsesReceived >= expectedResponses) {
                  clearTimeout(timeout);
                  tempPeer?.destroy();
                  resolve(games);
                }
              });
            });
          });
        });

        tempPeer.on('error', (err) => {
          console.error('Discovery peer error:', err);
          clearTimeout(timeout);
          if (tempPeer) {
            tempPeer.destroy();
          }
          resolve(games);
        });
      } catch (err) {
        console.error('Failed to create discovery peer:', err);
        clearTimeout(timeout);
        resolve(games);
      }
    });
  }
}
