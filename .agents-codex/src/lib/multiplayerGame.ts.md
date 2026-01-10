# multiplayerGame.ts

## Purpose
Coordinates multiplayer command synchronization in the game loop, including sending player actions to the backend and applying opponent commands locally.

## Dependencies
### Imports
- `./types` - Game state types and gameplay constants
- `./multiplayer` - Multiplayer manager and command types
- `./simulation` - Unit spawning helper

### Used By
- `src/App.tsx` - Initializes and updates multiplayer sync during the main loop
- `src/lib/input.ts` - Sends player commands over multiplayer

## Key Components

### MultiplayerSync
- **lastCommandCheck**: Timestamp of the last polling attempt
- **lastCommandSeq**: Sequence number of the last command processed
- **commandBuffer**: Reserved buffer for potential batching

### initializeMultiplayerSync()
- **Purpose:** Initialize multiplayer sync state at match start.
- **Notes:** Starts with sequence 0 and current timestamp.

### send*Command helpers
- **Purpose:** Wrap common gameplay commands into multiplayer payloads.
- **Notes:** Keeps input handlers clean and consistently structured.

### applyOpponentCommands()
- **Purpose:** Applies incoming commands to local game state.
- **Notes:** Validates unit types and uses guards for base ownership.

### updateMultiplayerSync()
- **Purpose:** Polls for new commands, filters out local commands, and applies opponent actions.
- **Notes:** Uses sequence-based polling to limit payload size and updates network status telemetry.

## Terminology
- **Command Stream:** Sequential command log stored in the backend for polling.
- **Sequence Number:** Monotonic ID used to request only new commands.

## Implementation Notes

### Critical Details
- Polling interval is throttled to 100ms.
- Network status flags are updated on success/failure to drive UI feedback.
- Command application is wrapped in try/catch to avoid breaking the game loop.

### Known Issues
- No retry backoff if polling fails repeatedly.
- `commandBuffer` is reserved but not yet used for batching.

## Future Changes

### Planned
- None currently scheduled.

### Needed
- Consider realtime subscriptions to avoid polling.
- Add reconciliation logic if command sequences are skipped.

## Change History
- **2025-03-24**: Added sequence-based polling for multiplayer commands.

## Watch Out For
- Keep command schemas in sync with input serialization.
- Ensure command filtering excludes local player actions.
- Update unit validation when new unit types are introduced.
