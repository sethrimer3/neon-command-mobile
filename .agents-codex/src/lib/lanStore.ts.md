# lanStore.ts

## Purpose
Implements a LAN multiplayer adapter using PeerJS and WebRTC, exposing a KV-style API for multiplayer state without requiring a backend server.

## Dependencies
### Imports
- `peerjs` - WebRTC signaling and data channels
- `./realtimeStore` - Realtime KV store interface

### Used By
- `src/App.tsx` - LAN multiplayer store initialization
- `src/components/LANModeScreen.tsx` - LAN lobby discovery

## Key Components

### LANKVStore
- **Purpose:** Provides KV operations over a peer-to-peer connection.
- **Notes:** Maintains local and remote maps and syncs data via PeerJS messages.

### initAsHost / initAsGuest
- **Purpose:** Establish host and guest peer connections.
- **Notes:** Uses a timeout to fail fast if PeerJS cannot connect.

### listEntries
- **Purpose:** Return key/value entries that match a prefix.
- **Notes:** Combines local cache with optional host response for guests.

### appendCommand / listCommandsSince
- **Purpose:** Maintain a bounded command log in the shared KV map.
- **Notes:** Keeps LAN polling sequential and lightweight.

### listAvailableGames
- **Purpose:** Discover LAN hosts by scanning PeerJS IDs.
- **Notes:** Uses a temporary peer and per-host timeouts to collect game info.

## Terminology
- **Host:** Player that creates the PeerJS room and answers requests.
- **Guest:** Player that connects to a host peer ID.
- **Command Log:** Shared log of multiplayer commands keyed by stream.

## Implementation Notes

### Critical Details
- Uses both local and remote maps to cache data from the peer.
- Guest read operations can request data from the host if not cached.
- Command logs are capped to avoid unbounded memory growth.

### Known Issues
- No persistence across reconnects; data lives only in memory.
- Listing keys requires a host request for full coverage when guest only has partial cache.

## Future Changes

### Planned
- None currently scheduled.

### Needed
- Add reconnection handling to restore KV data after drops.
- Evaluate a more robust discovery mechanism for large LANs.

## Change History
- **2025-03-24**: Added command log support and listEntries parity with the realtime store interface.

## Watch Out For
- Keep PeerJS configuration updated for STUN/TURN reliability.
- Ensure list message handling stays aligned with `listEntries` behavior.
- Avoid large payloads over the data channel to prevent latency spikes.
