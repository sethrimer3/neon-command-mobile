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
  - Records Blade movement history snapshots for per-particle lag in the renderer
  - Processes line jump telegraphs (0.5s delay before execution)
  - Executes movement from command queues
  - Applies local collision push to keep units from stacking while still moving
  - Blocks movement only on obstacle collisions (unit overlap handled by avoidance)
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
  - Maintains desired orbit distance scaled to unit size (0.8 × unit size)

### executeLineJump(state: GameState, unit: Unit): void
- **Purpose:** Executes the Snaker's line jump ability
- **Notes:** Teleports unit to target position after telegraph delay

### Ability System Functions
Multiple functions for unit abilities:
- `executeDaggerAmbush()` - Dagger reveal timing and delayed knife throw
- `executeTankShield()` - Tank's protective dome with ranged damage reduction
- `executeArtilleryBombardment()` - Artillery siege attack
- `executeMedicHeal()` - Medic's healing pulse
- `executeInterceptorMissiles()` - Interceptor's missile barrage
- `applyBladeSwingDamage()` - Applies Blade swing damage in a forward semicircle or full circle based on swing number

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
- Blade (warrior) now skips the shared laser effect and triggers a knife volley instead
- Combat uses attack rate to determine damage intervals
- Bases can move but slowly (for gameplay balance)
- Spawn rally points are clamped inside the 1m boundary to prevent off-screen movement targets
- Ability commands execute after the unit reaches the queued anchor, moving the unit toward that point if needed
- Ability cooldowns are temporarily disabled, so ability use is no longer blocked by cooldown timers
- Tank shield domes now reduce ranged damage for allies in range and projectiles curve toward nearby enemy tanks
- Dagger units remain cloaked by default, revealing briefly to throw an ambush knife before recloaking
- Mining income now counts every active worker id per deposit, and dead drones are pruned from deposit worker lists
- Mining drones can wait briefly using cadence delays so paired drones alternate between depot and deposit
- Unit movement collision checks now block on any unit overlap without attempting friendly sliding paths
- Local collision push keeps units from overlapping while allowing them to keep moving through crowds
- Obstacle collisions still block movement to prevent clipping through walls
- Blade melee swings now queue through a full three-hit combo with short pauses via the swordSwingCombo state, preventing mid-swing resets
- Blade swings now apply area damage per swing with 1s pauses between combo hits and after the final spin
- Blade movement history is recorded each frame to support lagged sword particle rendering
- Blade sword swing completions now store a hold state so the sword stays at its final angle between combo swings
- Marine basic ranged shots are now hitscan-style, spawning instant impact feedback and ricochet bullets at the target
- Marine shell casings eject consistently to the firing unit's right side with angle variance
- Sprite corner trails assume sprites are authored facing up and apply a PI/2 offset when computing the back corners

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
- **2026-01-05**: Executed queued abilities from current position to avoid stalled ability commands
- **2026-01-07**: Removed the warrior's execute dash extra effect so warriors only trigger the shared laser ability and cleaned up dash timing logic
- **2025-03-10**: Scaled particle orbit distance and orbital forces with unit size to keep unit-following particles proportional after size changes
- **2025-03-17**: Updated mining income and mining drone cadence handling to support two drones per deposit
- **2025-03-19**: Removed friendly sliding collision resolution so units block on overlap instead of shifting around each other
- **2025-03-20**: Replaced hard unit blocking with local collision pushes so group movement stays smooth while still respecting obstacles
- **2025-03-21**: Moved ability execution to fire on arrival at the queued anchor and disabled cooldown enforcement
- **2025-03-22**: Added Blade knife volley ability logic, marine projectile speed boost, and shell casing physics with field particle bounces
- **2026-01-08**: Added tank projectile attraction, ranged-only shield dome mitigation, and Dagger ambush reveal/knife timing with permanent cloak
- **2026-01-10**: Queued Blade sword swing combo sequencing so each attack plays all three swings with pauses before reset
- **2026-01-11**: Applied Blade swing damage in semicircle/full-circle arcs, extended combo pauses to 1s, and recorded Blade trail history for particle lag rendering
- **2026-01-12**: Held Blade sword angles after each swing and added a final-swing hold delay before returning to rest
- **2026-01-13**: Converted marine basic ranged attacks to instant hits with ricochet feedback and standardized right-side shell ejection
- **2025-03-24**: Clarified sprite corner trail math to align with the global sprite-forward PI/2 rotation offset.

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
