# types.ts

## Purpose
Defines all core type definitions, interfaces, and constants for the SoL-RTS game. This is the foundational type system that the entire application relies on for type safety and game configuration.

## Dependencies
### Imports
- `./maps` - Imports Obstacle type for game state

### Used By
- `App.tsx` - Main application uses all types
- `simulation.ts` - Game logic and updates
- `renderer.ts` - Rendering system
- `ai.ts` - AI decision making
- `input.ts` - Input handling
- `gameUtils.ts` - Utility functions
- `multiplayer.ts` - Online gameplay
- All component files that interact with game state

## Key Components

### Constants
- **PIXELS_PER_METER:** `20` - Conversion ratio between game meters and screen pixels
- **BASE_SIZE_METERS:** `3` - Size of player bases in game units
- **UNIT_SIZE_METERS:** `1` - Standard unit collision size
- **ABILITY_MAX_RANGE:** `10` - Maximum range for ability targeting
- **QUEUE_MAX_LENGTH:** `20` - Maximum command queue size per unit
- **LASER_RANGE:** `20` - Base laser weapon range
- **LASER_DAMAGE_UNIT/BASE:** Unit and base damage values for laser
- **PROMOTION_DISTANCE_THRESHOLD:** `10` - Distance units must travel to gain promotion
- **PROMOTION_MULTIPLIER:** `1.1` - Damage increase per promotion (10% boost)
- **QUEUE_BONUS_PER_NODE:** `0.1` - Distance credit bonus per queued move command

### COLORS Object
Defines all color values using OKLCH color space for consistent appearance:
- `background`, `pattern` - UI background colors
- `playerDefault`, `enemyDefault` - Default player colors
- `photon`, `laser`, `telegraph` - Game effect colors
- `white` - Pure white for UI elements

### Vector2 Type
```typescript
type Vector2 = { x: number; y: number }
```
Represents 2D positions and directions in game space (meters, not pixels).

### Particle Interface
```typescript
interface Particle {
  id: string;
  position: Vector2;
  velocity: Vector2;
  color: string;
}
```
Represents a visual particle in the particle physics system. Particles are attracted to their parent unit and orbit around it, creating visual interest.

### CommandNode Type
Union type for unit commands:
- `move` - Move to a position
- `ability` - Use ability at position with direction

### Unit Interface
Represents a game unit with:
- Basic properties: id, type, owner, position, hp
- Command system: commandQueue for queued actions
- Progression: damageMultiplier, distanceTraveled, distanceCredit
- Ability states: lineJumpTelegraph, shieldActive, cloaked, bombardmentActive, healPulseActive, missileBarrageActive
- Visual effects: particles (optional array of Particle objects, currently used for marines)

### Base Interface
Represents a player base with:
- Identity: id, owner, position
- Health: hp, maxHp
- Movement: movementTarget (for dragging bases)
- UI state: isSelected
- Abilities: laserCooldown

### UnitType
8 unit types: `marine`, `warrior`, `snaker`, `tank`, `scout`, `artillery`, `medic`, `interceptor`

### UnitDefinition Interface
Configuration for each unit type including:
- Display: name
- Stats: hp, moveSpeed
- Combat: attackType, attackRange, attackDamage, attackRate, canDamageStructures
- Economy: cost
- Ability: abilityName, abilityCooldown

### UNIT_DEFINITIONS
Complete configuration object for all 8 unit types with balanced stats:
- **Marine**: Ranged basic unit with Burst Fire ability
- **Warrior**: Melee tank with Laser Beam
- **Snaker**: Fast non-combat unit with Line Jump mobility
- **Tank**: Heavy unit with Shield Dome
- **Scout**: Fast reconnaissance with Cloak
- **Artillery**: Long-range siege with Bombardment
- **Medic**: Support unit with Heal Pulse
- **Interceptor**: Air superiority with Missile Barrage

### GameState Interface
The complete game state structure containing:
- **mode**: Current screen/phase
- **vsMode**: Game type (AI, local player, or online)
- **units**: All active units
- **bases**: Player bases
- **obstacles**: Map obstacles
- **players**: Player resources and settings (array of 2 for both players)
- **selectedUnits**: Set of selected unit IDs
- **elapsedTime**: Game time tracking
- **winner**: Game outcome
- **settings**: Game configuration
- **surrenderClicks**: Surrender mechanism tracking
- **countdownStartTime**: Multiplayer countdown
- **countdownSeconds**: UI countdown snapshot used for rendering and audio cues
- **matchStartAnimation**: Intro animation state
- **matchStats**: Match statistics tracking
- **matchTimeLimit**: Optional time limit for matches
- **topographyLines**: Background decoration

## Terminology
- **Photons**: In-game currency/resource for training units
- **Income Rate**: Photons gained per second (increases every 10 seconds)
- **Promotion**: Damage multiplier gained by traveling distance
- **Distance Credit**: Accumulated distance toward next promotion (with queue bonuses)
- **Telegraph**: Visual indicator shown before ability execution
- **Command Queue**: List of pending actions for a unit
- **Queue Bonus**: Extra distance credit gained when unit has multiple queued moves

## Implementation Notes

### Critical Details
- All positions and distances use meters, not pixels - convert using PIXELS_PER_METER
- Owner is 0-indexed: 0 = player, 1 = enemy
- Promotion system rewards long-distance movement with damage buffs
- Queue bonus system encourages strategic planning (more queued moves = faster promotions)
- Optional properties (with `?`) indicate temporary ability states

### Known Issues
None currently identified

## Future Changes

### Planned
- May add more unit types as game expands
- Potential for additional ability states

### Needed
- Consider extracting constants to configuration file for easier balancing
- May need unit tier system for tech progression

## Change History
- Initial creation with 8 unit types and core game mechanics
- Added match statistics and time limit support
- Added topography lines for visual enhancement
- **2025-12-31**: Added Particle interface and particle physics system for visual effects on marines (10 particles per marine that orbit using attraction forces)
- **2026-01-01**: Added countdownSeconds to keep UI and audio updates in sync during match start.
- **2026-01-07**: Updated the warrior ability name to Laser Beam to match the shared laser-only behavior and removed dash-specific unit state.

## Watch Out For
- Always use meters for game logic, only convert to pixels for rendering
- Ensure new unit types are added to both UnitType union and UNIT_DEFINITIONS
- When adding new ability states, add optional properties to Unit interface
- Owner indices must stay 0 and 1 for two-player game
- Command queue length should not exceed QUEUE_MAX_LENGTH
- Distance credit calculation depends on queue size - be careful when modifying
