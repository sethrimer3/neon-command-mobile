import Peer, { DataConnection } from 'peerjs';
import { RealtimeKVStore } from './realtimeStore';

// Timeout for peer-to-peer requests
const P2P_REQUEST_TIMEOUT_MS = 5000;

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

  constructor() {
    // Initialization happens in connect() method
  }

  /**
   * Initialize as host - creates a peer ID that others can connect to
   */
  async initAsHost(): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        // Create peer with a random ID
        this.peer = new Peer();
        this.isHostPlayer = true;

        this.peer.on('open', (id) => {
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
          console.error('Peer error:', err);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Initialize as guest - connects to host's peer ID
   */
  async initAsGuest(hostPeerId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.peer = new Peer();
        this.isHostPlayer = false;

        this.peer.on('open', (id) => {
          this.peerId = id;
          console.log('LAN Guest initialized with peer ID:', id);
          
          // Connect to host
          const conn = this.peer!.connect(hostPeerId, { reliable: true });
          this.connection = conn;
          
          this.setupConnectionHandlers(conn);
          
          conn.on('open', () => {
            this.connected = true;
            console.log('Connected to host:', hostPeerId);
            resolve();
          });
        });

        this.peer.on('error', (err) => {
          console.error('Peer error:', err);
          reject(err);
        });
      } catch (err) {
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
        let timeoutId: NodeJS.Timeout;
        
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
        let timeoutId: NodeJS.Timeout;
        
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
}
