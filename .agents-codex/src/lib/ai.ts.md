# ai.ts

## Purpose
Implements the AI opponent logic for single-player mode. Handles automated unit production, unit control, and basic tactical decisions for the AI player.

## Dependencies
### Imports
- `./types` - Game state, unit types, and constants
- `./simulation` - spawnUnit() function
- `./gameUtils` - Vector math (distance, add)

### Used By
- `App.tsx` - Main game loop calls updateAI()

## Key Components

### updateAI(state: GameState, deltaTime: number): void
- **Purpose:** Main AI update function called each frame
- **Parameters:** Game state and delta time
- **Notes:** 
  - Only runs when vsMode is 'ai'
  - Uses action interval to throttle AI decisions
  - Calls performAIActions() periodically

### performAIActions(state: GameState): void
- **Purpose:** Executes AI decision-making for unit production and control
- **Notes:**
  - Spawns random unit types when resources available
  - Issues move commands to existing units
  - Uses abilities randomly (20% chance when off cooldown)
  - Targets player base with some randomization

### Constants
- **AI_ACTION_INTERVAL**: `2.0` seconds - How often AI makes decisions
- **lastAIAction**: Tracks time since last action

## Terminology
- **AI Player**: Always player index 1 (enemy)
- **Rally Point**: Initial position AI units move to after spawning
- **Action Interval**: Delay between AI decision cycles

## Implementation Notes

### Critical Details
- AI acts every 2 seconds to prevent overwhelming decision-making
- AI only uses units enabled in game settings (respects player's unit selection)
- Unit spawn uses random rally points (left, up, or down from base)
- AI issues commands when units have fewer than 3 queued commands
- 30% chance to issue new move command per unit per cycle
- 20% chance to use ability when available
- Commands target area around player base with ±5 meter randomization
- AI does not do strategic planning - purely reactive

### AI Behavior Patterns
1. **Unit Production**: 
   - Randomly selects from enabled unit types
   - Spawns whenever resources permit
   - No preference or counter-picking strategy

2. **Unit Control**:
   - Units attack-move toward player base
   - Adds randomization to prevent predictable grouping
   - Uses abilities opportunistically (no tactical timing)

3. **Rally Points**:
   - Three options: left (-8,0), up (0,-8), down (0,+8)
   - Randomly selected for variety

### Known Issues
- AI does not adapt to player strategy
- No unit composition planning
- Abilities used without tactical consideration
- No defensive behavior when base threatened

## Future Changes

### Planned
- None currently scheduled

### Needed
- Difficulty levels (easy/medium/hard)
- Strategic AI that counter-picks units
- Defensive behavior when base HP is low
- Better ability usage timing
- Flanking maneuvers
- Resource management (saving for expensive units)
- Unit micro (focus fire, retreating)

## Change History
- Initial creation with basic AI
- Added ability usage
- Respects enabled units setting

## Watch Out For
- AI is always player 1 (index 1)
- Action interval affects AI responsiveness
- AI command queue limit prevents overflow
- Rally positions must be added to base position (not absolute)
- Random ability usage can waste abilities on poor targets
- AI respects QUEUE_MAX_LENGTH to prevent infinite commands
- AI does not check if moves are valid (relies on simulation collision)
- Enabling/disabling units changes AI composition immediately
