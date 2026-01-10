# multiplayer.ts

## Purpose
Manages online multiplayer functionality including lobby creation, matchmaking, game synchronization, and command transmission. Uses a realtime KV store abstraction (Spark or Supabase) for multiplayer state management.

## Dependencies
### Imports
- `./types` - Game state types and command structures
- `./realtimeStore` - Realtime KV store abstraction and backend selection

### Used By
- `App.tsx` - Multiplayer game coordination
- `OnlineModeScreen.tsx` - Lobby browser
- `MultiplayerLobbyScreen.tsx` - Lobby management UI

## Key Components

### Types

#### MultiplayerState
- **gameId**: Unique game identifier
- **hostId/guestId**: Player identifiers
- **hostReady/guestReady**: Ready status flags
- **gameStarted**: Game in progress
- **turnNumber**: Synchronization counter
- **lastUpdate**: Timestamp for timeout detection

#### GameCommand
Represents player actions to be synchronized:
- **playerId**: Command issuer
- **timestamp**: When command was issued
- **commands**: Array of action objects (spawn, move, ability, etc.)

#### LobbyData
Public lobby information:
- Player info (names, colors, IDs)
- **status**: 'waiting', 'ready', 'playing', 'finished'
- Game settings (map, enabled units)
- **created**: Timestamp for lobby expiration

### Constants
- **GAME_UPDATE_INTERVAL**: `100`ms - Sync frequency
- **LOBBY_TIMEOUT**: `300000`ms (5 minutes) - Lobby expiration

### MultiplayerManager Class

#### Constructor(playerId: string, store?: RealtimeKVStore)
- **Purpose:** Initialize manager with player ID and a realtime store
- **Notes:** Store injection enables swapping backends without touching game logic

#### createGame(...): Promise<string>
- **Purpose:** Host creates new multiplayer lobby
- **Parameters:** Host name, color, map ID, enabled units
- **Returns:** Game ID
- **Notes:** 
  - Creates lobby in KV store
  - Adds to lobby list
  - Sets host flag

#### joinGame(gameId, guestName, guestColor): Promise<boolean>
- **Purpose:** Join existing lobby as guest
- **Returns:** Success status
- **Notes:** Updates lobby with guest info

#### startGameCountdown(): Promise<void>
- **Purpose:** Begin game start sequence
- **Notes:** Both players must be ready

#### sendCommand(command: GameCommand): Promise<void>
- **Purpose:** Queue command for transmission
- **Notes:** Commands batched and sent periodically

#### getCommands(since: number): Promise<GameCommand[]>
- **Purpose:** Fetch opponent commands issued after a timestamp.
- **Notes:** Uses store `listEntries` to batch fetch command payloads and avoid per-key network calls.

#### getGameState(): Promise<MultiplayerState | null>
- **Purpose:** Fetch current multiplayer state
- **Notes:** Returns null if game doesn't exist

#### syncGameState(localState: GameState): Promise<void>
- **Purpose:** Synchronize local game state with opponent
- **Notes:** 
  - Sends commands to opponent
  - Receives and applies opponent commands
  - Maintains turn-based consistency

#### leaveGame(): Promise<void>
- **Purpose:** Exit multiplayer game
- **Notes:** Cleans up lobby and state

### Helper Functions

#### addToLobbyList/removeFromLobbyList
- **Purpose:** Manage global lobby list
- **Notes:** Used for matchmaking browser

#### cleanupOldLobbies
- **Purpose:** Remove expired lobbies
- **Notes:** Prevents stale lobby accumulation

## Terminology
- **Host**: Player who created the lobby (player 0)
- **Guest**: Player who joined the lobby (player 1)
- **Lobby**: Pre-game waiting room
- **KV Store**: Key-value storage system (Spark KV)
- **Sync**: Keeping both players' game states consistent
- **Command Queue**: Batched actions awaiting transmission
- **Turn Number**: Counter for synchronization ordering

## Implementation Notes

### Critical Details
- Uses a realtime KV store abstraction for distributed state storage (Spark or Supabase)
- Commands batched to reduce network calls
- Command retrieval reads key/value entries in one pass to reduce Supabase request volume
- Turn-based synchronization prevents desync
- Lobby list maintained separately for browsing
- Lobbies expire after 5 minutes of inactivity
- Both players must be ready before game starts
- Host is always player 0, guest is player 1

### Synchronization Strategy
1. Each player maintains local game state
2. Actions recorded as commands
3. Commands sent to shared KV storage
4. Both players apply all commands in turn order
5. Turn number increments ensure consistency

### Network Optimization
- 100ms update interval balances responsiveness and bandwidth
- Command batching reduces API calls
- Lobby list cached to minimize reads

### Known Issues
- No reconnection support if connection lost
- Limited error handling for network failures
- Turn-based sync may feel laggy for fast actions
- `commandQueue` is defined but not currently used for batching

## Future Changes

### Planned
- None currently scheduled

### Needed
- Reconnection support
- Better error handling and retry logic
- Paid provider adapter that can replace Supabase without changing game logic
- Spectator mode
- Replays
- Ranked matchmaking
- ELO/MMR system integration
- Chat system
- Game invitations
- Friend list
- Tournament brackets
- Optimistic prediction for lower latency feel

## Change History
- Initial creation with basic lobby system
- Added command synchronization
- Implemented lobby browser and matchmaking
- **2026-01-01**: Replaced direct Spark KV usage with realtime store abstraction for Supabase support
- **2025-03-24**: Switched command fetches to batch list entries instead of per-key reads

## Watch Out For
- KV store operations are async - always await
- Host must be player 0, guest player 1 for consistency
- Turn number critical for command ordering
- Commands must be deterministic for sync
- Lobby timeout prevents infinite old lobbies
- Game ID collisions theoretically possible (very rare)
- Network latency affects gameplay responsiveness
- Both players must have same game version
- Command format must match exactly between players
- Empty command batches still trigger sync
- Lobby list can grow large - pagination may be needed
