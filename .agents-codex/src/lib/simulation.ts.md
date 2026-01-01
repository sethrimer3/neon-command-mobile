# simulation.ts

## Purpose
Contains the core game simulation loop and logic. Handles unit movement, combat, abilities, base movement, income generation, and victory conditions. This is the heart of the game's mechanics.

## Dependencies
### Imports
- `./types` - All game types, constants, and definitions
- `./gameUtils` - Vector math and utilities
- `./maps` - Obstacle collision detection
- `./sound` - Sound effect management

### Used By
- `App.tsx` - Main game loop calls updateGame()
- `ai.ts` - Calls spawnUnit() for AI
- `input.ts` - Calls spawnUnit() for player actions

## Key Components

### updateGame(state: GameState, deltaTime: number): void
- **Purpose:** Main simulation update function called every frame
- **Parameters:** Game state and time elapsed since last frame
- **Notes:** Only runs when mode is 'game', orchestrates all subsystems

### updateIncome(state: GameState, deltaTime: number): void
- **Purpose:** Manages resource generation for players
- **Notes:** Income rate increases every 10 seconds, grants photons per second

### updateUnits(state: GameState, deltaTime: number): void
- **Purpose:** Updates all unit positions, abilities, and command queues
- **Notes:** 
  - Handles ability cooldowns and active effects
  - Updates particle physics for marines (attraction-based orbital motion)
  - Processes line jump telegraphs (0.5s delay before execution)
  - Executes movement from command queues
  - Applies promotion system based on distance traveled
  - Queue bonus grants extra distance credit (10% per queued move node)

### updateBases(state: GameState, deltaTime: number): void
- **Purpose:** Moves bases toward their movement targets
- **Notes:** Bases can be dragged by players to reposition

### updateCombat(state: GameState, deltaTime: number): void
- **Purpose:** Handles all combat interactions between units and bases
- **Notes:** Processes ranged, melee, and special attacks

### checkTimeLimit(state: GameState): void
- **Purpose:** Enforces match time limits in timed games
- **Notes:** Shows warning at 30 seconds remaining, ends match when time expires

### checkVictory(state: GameState): void
- **Purpose:** Determines if a player has won
- **Notes:** Victory when enemy base is destroyed

### spawnUnit(state, owner, unitType, basePos, rallyPos): void
- **Purpose:** Creates a new unit and deducts cost from player
- **Parameters:** State, player owner, unit type, spawn position, initial rally point
- **Notes:** 
  - Deducts photon cost
  - Initializes unit with full HP
  - Clamps rally position into the playable arena before queuing movement
  - Updates match statistics
  - Initializes 10 particles for marines in an orbital pattern

### getSafeRallyPosition(state, spawnPos, desiredRallyPos): Vector2
- **Purpose:** Ensures rally points stay within the 1m boundary and avoid obstacles
- **Parameters:** Game state, spawn position, desired rally point
- **Returns:** A safe movement target for newly spawned units
- **Notes:** Uses boundary obstacles to infer playable bounds and steps back toward the base if blocked

### Particle Physics Functions
- **createParticlesForUnit(unit, count):** Creates particles in circular formation around unit
- **updateParticles(unit, deltaTime):** Updates particle positions using attraction forces
  - Particles attracted to unit center with spring-like force
  - Damping applied to prevent excessive velocity
  - Maintains desired orbit distance of 0.8 meters

### executeLineJump(state: GameState, unit: Unit): void
- **Purpose:** Executes the Snaker's line jump ability
- **Notes:** Teleports unit to target position after telegraph delay

### Ability System Functions
Multiple functions for unit abilities:
- `executeWarriorDash()` - Warrior's dash attack
- `executeScoutCloak()` - Scout invisibility
- `executeTankShield()` - Tank's protective dome
- `executeArtilleryBombardment()` - Artillery siege attack
- `executeMedicHeal()` - Medic's healing pulse
- `executeInterceptorMissiles()` - Interceptor's missile barrage

## Terminology
- **Delta Time**: Time elapsed between frames (in seconds)
- **Rally Point**: Initial movement target for newly spawned units
- **Telegraph**: Visual warning shown before ability execution
- **Promotion**: Damage multiplier increase from traveling distance
- **Distance Credit**: Accumulated travel toward next promotion
- **Queue Bonus**: Additional distance credit from having multiple queued commands
- **Ability Cooldown**: Time until ability can be used again

## Implementation Notes

### Critical Details
- Promotion occurs every 10 meters traveled, granting 10% damage increase
- Queue bonus: +10% distance credit per queued move command (encourages planning)
- Line jump has 500ms telegraph delay before execution
- Income rate formula: floor(elapsedSeconds / 10) + 1
- All abilities have unique implementations and effects
- Combat uses attack rate to determine damage intervals
- Bases can move but slowly (for gameplay balance)
- Spawn rally points are clamped inside the 1m boundary to prevent off-screen movement targets

### Known Issues
- None currently identified

## Future Changes

### Planned
- May add more unit abilities
- Potential for upgrades/tech tree system

### Needed
- Consider extracting ability implementations to separate files for better organization
- Performance optimization for large unit counts
- Better collision resolution for clustered units

## Change History
- Initial creation with basic movement and combat
- Added promotion system with queue bonuses
- Implemented 8 unique unit abilities
- Added match statistics tracking
- Added time limit support
- **2025-12-31**: Added particle physics system for marines with 10 particles per unit that orbit using attraction forces
- **2026-01-01**: Clamped spawn rally points to playable bounds to prevent stuck units

## Watch Out For
- Delta time must be in seconds, not milliseconds
- Promotion multiplier is exponential (compounds per promotion)
- Queue bonus calculation depends on move nodes only (not ability nodes)
- Line jump telegraph must complete before unit can move again
- Sound effects must be played at appropriate times for player feedback
- Match statistics must be updated for both players
- Ability cooldowns are in seconds
- Some abilities affect multiple units (shield, heal pulse)
- Collision detection must check both units and obstacles
- Victory check must happen after all updates to prevent race conditions
