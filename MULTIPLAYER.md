# Multiplayer System

## Overview

The Speed of Light RTS game features multiple multiplayer modes allowing players to compete against each other:
- **Online Multiplayer**: Play against opponents over the internet using Spark KV or Supabase
- **LAN Multiplayer**: Play directly with someone on the same local network using WebRTC peer-to-peer connections

The system is built with a flexible backend abstraction that supports Spark KV, Supabase, and peer-to-peer connections.

## Features

### Lobby System
- **Create Game**: Host creates a lobby with custom settings (map, units, colors)
- **Join Game**: Guest joins using a Game ID
- **Matchmaking**: Automatic opponent finding and game creation
- **Lobby Display**: Shows host and guest information with colors

### Real-time Synchronization
- **Command Synchronization**: All player actions (unit spawning, movement, abilities, base commands) are synchronized
- **Network Status**: Live connection status and latency display
- **100ms Polling**: Commands are fetched and applied every 100ms for responsive gameplay
- **Local Prediction**: Player's own commands apply immediately for smooth feedback

### Supported Commands
1. **Spawn**: Unit spawning with rally points
2. **Move**: Unit movement and patrol commands
3. **Ability**: Unit abilities (directional drag input)
4. **Base Move**: Base repositioning
5. **Base Laser**: Base laser ability

## Backend Support

### Spark KV (Default - Local Development)
- Automatically used when running in Spark environment
- No configuration needed
- Best for local testing and development

### Supabase (Production)
To use Supabase backend, set environment variables:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_SUPABASE_KV_TABLE=multiplayer_kv  # optional, defaults to 'multiplayer_kv'
```

#### Supabase Setup from Scratch
Follow these steps if you are creating a brand new Supabase project for multiplayer:

1. **Create a Supabase project**
   - Go to https://supabase.com and create a new project.
   - Wait for the database to finish provisioning.
   - Open **Project Settings → API** and copy:
     - **Project URL** → `VITE_SUPABASE_URL`
     - **anon public key** → `VITE_SUPABASE_ANON_KEY`

2. **Create the multiplayer table**
   - Open **SQL Editor** in Supabase.
   - Run the schema below (the table name must match `VITE_SUPABASE_KV_TABLE`):

   ```sql
   CREATE TABLE multiplayer_kv (
     key TEXT PRIMARY KEY,
     value JSONB NOT NULL,
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );

   CREATE INDEX idx_multiplayer_kv_key_prefix ON multiplayer_kv (key text_pattern_ops);
   ```

3. **Allow the anon key to read/write**
   - The game uses the anon key for read/write access in the browser.
   - For a quick start you can **disable RLS** on the table, or add explicit policies:

   ```sql
   ALTER TABLE multiplayer_kv ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Allow anon read" ON multiplayer_kv
     FOR SELECT USING (true);

   CREATE POLICY "Allow anon insert" ON multiplayer_kv
     FOR INSERT WITH CHECK (true);

   CREATE POLICY "Allow anon update" ON multiplayer_kv
     FOR UPDATE USING (true) WITH CHECK (true);

   CREATE POLICY "Allow anon delete" ON multiplayer_kv
     FOR DELETE USING (true);
   ```

   - **Note:** For production, replace these open policies with authenticated access.

4. **Configure your local environment**
   - Create a `.env.local` file (or your preferred env file) and set the variables:

   ```bash
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_SUPABASE_KV_TABLE=multiplayer_kv
   ```

5. **Run the game and verify**
   - Start the app and open the Multiplayer screen.
   - If you can create/join lobbies without the Spark runtime, Supabase is working.
   - Check **Table Editor → multiplayer_kv** to confirm data is being written.

#### Supabase Table Schema
Create a table named `multiplayer_kv` with the following structure:

```sql
CREATE TABLE multiplayer_kv (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for prefix searches
CREATE INDEX idx_multiplayer_kv_key_prefix ON multiplayer_kv (key text_pattern_ops);
```

### LAN Multiplayer (Peer-to-Peer)
LAN multiplayer uses WebRTC for direct peer-to-peer connections without requiring a backend server. This mode is ideal for:
- Playing on the same local network
- Playing without internet connection
- Low-latency gameplay with nearby players
- No backend configuration required

#### How to Use LAN Multiplayer

1. **Host a Game**:
   - From the main menu, select "Online Multiplayer" → "LAN Multiplayer" → "Host Game"
   - Your unique Peer ID will be displayed
   - Share this Peer ID with the other player (via text message, QR code, etc.)
   - Wait for the guest to connect
   - Once connected, start the game from the lobby

2. **Join a Game**:
   - From the main menu, select "Online Multiplayer" → "LAN Multiplayer"
   - Enter the host's Peer ID
   - Click "Connect to Host"
   - Wait for the host to start the game

#### Technical Details
- Uses PeerJS library for WebRTC connections
- Implements the same `RealtimeKVStore` interface as online backends
- Data is synchronized directly between peers with no server intermediary
- Host maintains the authoritative game state
- Both players can be on the same network or use STUN/TURN servers for NAT traversal
- Connection typically works best when both players are on the same WiFi or within a few network hops

#### Troubleshooting LAN Connections
- **Connection fails**: Ensure both devices are on the same network or have internet access for STUN servers
- **Slow connection**: Check network quality and reduce distance between devices
- **Disconnection during game**: WebRTC requires stable connection; if one player's connection drops, the game will end
- **Cannot connect to peer ID**: Double-check that the Peer ID was copied correctly (it's case-sensitive)

## How It Works

### Game Flow
1. **Lobby Creation**
   - Host creates a game with settings
   - Lobby added to multiplayer:lobbies list
   - Host receives unique Game ID

2. **Opponent Joining**
   - Guest uses Game ID to join or matchmaking finds a lobby
   - Lobby status updates to 'ready'
   - Both players see opponent information

3. **Game Start**
   - Host clicks "Start Game" (or auto-starts in matchmaking)
   - Lobby status changes to 'playing'
   - Both players transition to countdown screen
   - Game begins after 3-second countdown

4. **Gameplay**
   - All player inputs send commands to backend
   - Game loop fetches opponent commands every 100ms
   - Commands applied to game state for opponent units
   - Network status displays connection and latency

5. **Game End**
   - Victory/defeat/surrender triggers endGame()
   - Lobby status set to 'finished'
   - Opponent notified of game end
   - Statistics saved (MMR tracked for online games)

### Command Synchronization

#### Sending Commands
Input handlers in `input.ts` send commands via the multiplayer manager:
- Unit spawning → `sendSpawnCommand()`
- Unit movement → `sendMoveCommand()`
- Unit abilities → `sendAbilityCommand()`
- Base movement → `sendBaseMoveCommand()`
- Base laser → `sendBaseLaserCommand()`

#### Receiving Commands
Game loop in `App.tsx` calls `updateMultiplayerSync()` which:
1. Fetches new commands since last check
2. Filters out own commands (already applied locally)
3. Applies opponent commands to game state
4. Updates network status with latency

#### Command Application
`applyOpponentCommands()` in `multiplayerGame.ts`:
- Validates commands before applying
- Applies effects to opponent's units/bases
- Handles all command types with proper game logic
- Uses same constants as local execution for consistency

## Technical Details

### Files
- `src/lib/multiplayer.ts` - Core multiplayer manager and lobby system
- `src/lib/realtimeStore.ts` - Backend abstraction (Spark/Supabase)
- `src/lib/lanStore.ts` - LAN/WebRTC peer-to-peer store adapter
- `src/lib/multiplayerGame.ts` - Command sync and game integration
- `src/components/MultiplayerLobbyScreen.tsx` - Lobby UI
- `src/components/OnlineModeScreen.tsx` - Online mode selection
- `src/components/LANModeScreen.tsx` - LAN mode host/join UI

### Key Data Structures

#### LobbyData
```typescript
{
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
```

#### GameCommand
```typescript
{
  playerId: string;
  timestamp: number;
  commands: Array<{
    type: 'spawn' | 'move' | 'ability' | 'baseMove' | 'baseLaser';
    // ... command-specific fields
  }>;
}
```

### Performance Considerations
- Commands stored with timestamp keys for efficient querying
- Lobby list pruned of expired entries (5-minute timeout)
- 100ms polling balances responsiveness and backend load
- Local prediction eliminates input lag for own commands

## Troubleshooting

### Online Multiplayer

#### "Multiplayer requires Spark runtime or Supabase credentials"
- Ensure you're either running in Spark or have set Supabase environment variables
- Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set correctly

#### Spark KV 404 on GitHub Pages
- GitHub Pages does not host the Spark runtime, so `/_spark/kv/...` will return 404s.
- Configure Supabase credentials and rebuild so the app prefers Supabase instead of Spark.
- Verify the Supabase table and RLS policies allow anon read/write.

#### "Failed to join game"
- Game may already be full (has both host and guest)
- Game may have already started or finished
- Check network connection

#### "Disconnected" shown during game
- Backend may be unreachable
- Check network connection
- Verify Supabase credentials if using Supabase

#### Commands not syncing
- Check browser console for errors
- Verify backend is reachable
- Ensure both players are in the same game ID

### LAN Multiplayer

#### Cannot connect to peer
- Verify the Peer ID was entered correctly (case-sensitive)
- Ensure both devices have network connectivity
- Check that WebRTC is not blocked by firewall
- Try using a different network

#### Connection is slow or laggy
- Both players should be on the same local network for best performance
- Reduce distance between devices if using WiFi
- Check for network interference or congestion

#### Connection drops during game
- WebRTC requires stable connection throughout the game
- Check WiFi signal strength
- Ensure no other bandwidth-heavy applications are running
- Consider using wired ethernet connection if possible

## Future Enhancements
- [ ] Reconnection handling for dropped connections
- [ ] Game state snapshots for late-joiners
- [ ] Spectator mode
- [ ] Replay system using command history
- [ ] MMR-based matchmaking
- [ ] Chat system
- [ ] Tournament brackets
- [ ] Custom game rules/modifiers
