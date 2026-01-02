# App.tsx

## Purpose
Main application component that orchestrates the entire game. Manages game state, rendering loop, UI navigation, multiplayer coordination, settings persistence, and statistics tracking. This is the central hub that connects all game systems.

## Dependencies
### Imports
- `react` - Component lifecycle and state management
- `./hooks/useKV` - Local storage-backed useKV for persistent storage
- `./lib/*` - All game logic modules
- `./components/*` - UI components and screens
- `@phosphor-icons/react` - Icon library
- `sonner` - Toast notifications
- `./lib/realtimeStore` - Multiplayer realtime backend selection

### Used By
- `main.tsx` - Entry point renders this component

## Key Components

### State Management

#### Refs
- **canvasRef**: Reference to game canvas element
- **gameStateRef**: Current game state (mutable for performance)
- **animationFrameRef**: RequestAnimationFrame ID
- **lastTimeRef**: Previous frame timestamp for delta time
- **multiplayerManagerRef**: Multiplayer connection manager

#### React State
- **renderTrigger**: Forces re-render when needed
- **multiplayerLobbies**: Available online games
- **currentLobby**: Active multiplayer lobby
- **userId**: Player identifier

#### Persistent State (useKV)
- **playerColor/enemyColor**: Player color preferences
- **enabledUnits**: Unit roster selection
- **unitSlots**: Unit spawn shortcuts (left/up/down/right)
- **selectedMap**: Current map choice
- **playerStatistics**: Match history and stats
- **soundEnabled**: Audio on/off
- **sfxVolume/musicVolume**: Audio levels
- **showNumericHP**: Display numeric health values

### Functions

#### createInitialState(): GameState
- **Purpose:** Initialize empty game state
- **Returns:** Default GameState object
- **Notes:** Called once at component mount

#### startGame(vsMode, timeLimit?)
- **Purpose:** Begin new match
- **Parameters:** Game mode ('ai', 'player', 'online'), optional time limit
- **Notes:** 
  - Initializes bases at valid positions
  - Sets up player resources
  - Generates topography
  - Enters countdown mode for multiplayer

#### gameLoop()
- **Purpose:** Main game loop executed every frame
- **Notes:**
  - Calculates delta time (capped at 0.1s)
  - Handles countdown timer
  - Updates game simulation
  - Updates AI (if applicable)
  - Renders frame
  - Checks for victory/defeat

#### handleVictory(winner)
- **Purpose:** Process match end
- **Parameters:** Winner player index
- **Notes:**
  - Stops game loop
  - Calculates match statistics
  - Updates player stats and MMR
  - Shows victory/defeat screen
  - Plays sound effects

### Screen Navigation Functions
- **goToMenu()**: Return to main menu
- **goToUnitSelection()**: Open unit roster screen
- **goToMapSelection()**: Open map browser
- **goToLevelSelection()**: AI difficulty select
- **goToOnlineMode()**: Multiplayer lobby browser
- **goToStatistics()**: View player stats

### Multiplayer Functions
- **refreshLobbies()**: Fetch available games
- **createLobby(...)**: Host new game
- **joinLobby(gameId)**: Join existing game
- **leaveLobby()**: Exit lobby
- **startOnlineGame()**: Begin multiplayer match
- **multiplayerManagerRef init**: Selects Spark or Supabase backend via `createRealtimeStore`

### Event Handlers
- Touch and mouse event wrappers for input system
- Pass canvas and game state to input handlers

## Terminology
- **Game Loop**: Continuous update and render cycle
- **Delta Time**: Time elapsed between frames
- **useKV**: Local storage-backed hook for persistent key-value storage
- **Render Trigger**: State variable that forces re-render
- **Animation Frame**: Browser API for smooth animations
- **Countdown**: 3-second delay before match start
- **Match Start Animation**: Base sliding and "GO" sequence

## Implementation Notes

### Critical Details
- Game state stored in ref for performance (avoid re-renders)
- Delta time capped at 0.1s to prevent large jumps (e.g., tab switching)
- Canvas resizes with window
- Settings synced from useKV to game state on change
- Match statistics tracked throughout game
- MMR calculated using ELO formula for online matches
- Surrender requires 3 clicks within time window
- Victory animation includes base sliding sequence

### Performance Considerations
- Game state in ref (not React state) avoids re-render overhead
- RequestAnimationFrame ensures smooth 60 FPS
- Canvas only re-rendered when needed
- Settings updates batched in useEffect

### Persistence Strategy
- useKV hooks auto-save to localStorage
- Settings restored on page reload
- Statistics accumulated across sessions
- Match history limited to 50 most recent

### Known Issues
- None currently identified

## Future Changes

### Planned
- None currently scheduled

### Needed
- Pause functionality
- Game speed controls
- Better error handling for multiplayer disconnects
- Replay system
- Tutorial mode
- Campaign progression
- Achievement notifications
- Better mobile UI scaling
- Keyboard shortcuts
- Better surrender UI (less accidental)

## Change History
- Initial creation with basic game loop
- Added multiplayer support
- Implemented statistics tracking
- Added match start animations
- Added surrender mechanic
- Added time limit support
- Switched persistence hook to local storage to avoid Spark-only dependencies
- **2026-01-01**: Wired multiplayer init to realtime store abstraction and improved error handling
- **2026-01-01**: Updated menu build badge and sprite URL construction to use the Vite base path.
- **2026-01-01**: Added tracked countdown seconds for UI refreshes and bumped the visible build number.
- **2026-01-01**: Removed the main menu build badge so only the loading overlay displays build metadata.

## Watch Out For
- Game state ref vs React state - use correctly for performance
- Delta time must be capped to prevent physics breaking
- useKV hooks need null checks (initial load may be undefined)
- Canvas event handlers must use passive: false for touch
- Multiplayer requires network error handling
- Match statistics must be initialized when game starts
- Victory condition checked after all updates
- Animation frame must be cancelled on unmount
- Sound effects tied to specific events (timing matters)
- Player colors must be synced to game state when changed
- Enabled units converted to Set for fast lookup
- Map selection validated against available maps
- Lobby status changes trigger game start
- Countdown timer uses Date.now() for accuracy
- Match start animation has multiple phases
