# Group Movement Improvements - StarCraft-like Smooth Movement

## Problem Statement
Player units were getting stuck when moving as a group, causing frustration and breaking the flow of gameplay. The previous system had several issues:
1. Units would completely stop when blocked by friendly units
2. Limited pathfinding (only 3 angles tried)
3. No group cohesion or coordination
4. Rigid formation positions that didn't adapt to obstacles
5. Stuck detection that just gave up and canceled commands

## Solution: Flocking/Boids Algorithm + Enhanced Collision Avoidance

### 1. Flocking/Boids Algorithm Implementation

Inspired by Craig Reynolds' boids algorithm and used in games like StarCraft, we implemented three core forces that make units move smoothly as a group:

#### Separation Force
- **Purpose**: Prevents units from overlapping each other
- **How it works**: Each unit checks nearby friendly units within 1.5m radius and applies a force pushing away from them
- **Strength**: 8.0 (scaled by inverse distance - closer units push harder)
- **Result**: Units naturally space themselves out while moving

#### Cohesion Force
- **Purpose**: Keeps groups moving together toward a common center
- **How it works**: Units calculate the average position of nearby moving friendlies (within 4m) and apply a gentle force toward that center
- **Strength**: 2.0
- **Result**: Groups stay together instead of spreading out too much

#### Alignment Force
- **Purpose**: Makes units move in the same direction with similar velocities
- **How it works**: Units check nearby moving friendlies (within 3m) and adjust their direction to match the group's average
- **Strength**: 1.5
- **Result**: Smooth, coordinated group movement like a flock of birds

### 2. Enhanced Collision Avoidance

#### Better Sliding (8+ options instead of 2)
The old system only tried 2 perpendicular slide positions. The new system tries:
- 3 different slide distances (0.3m, 0.45m, 0.15m)
- 4 different slide angles:
  - Right perpendicular
  - Left perpendicular
  - Diagonal right
  - Diagonal left
- Total: Up to 12 alternative positions to find a path around friendly units

#### Improved Pathfinding (6 angles instead of 3)
- **Old**: Tried 3 angles at 30° increments (30°, 60°, 90°)
- **New**: Tries 6 angles at 22.5° increments (22.5°, 45°, 67.5°, 90°, 112.5°, 135°)
- **Result**: More granular pathfinding, finds paths around obstacles more reliably

### 3. Stuck Unit Recovery (Jitter/Wiggle)

Instead of just giving up, stuck units now try to wiggle free:

#### Two-Phase Approach
1. **Phase 1 (0-1.25s stuck)**: Normal pathfinding and sliding
2. **Phase 2 (1.25-2.5s stuck)**: Activate jitter movement
3. **Phase 3 (>2.5s stuck)**: Cancel commands as last resort

#### Jitter Movement
- Applies a small circular wiggle pattern (0.2m radius)
- Cycles through angles to find a gap
- Works especially well when multiple units are stuck together
- Resets when movement is successful

### 4. Application to All Movement Types

The improvements apply uniformly to:
- **Move commands**: Direct movement to a position
- **Attack-move commands**: Moving while engaging enemies
- **Patrol commands**: Looping patrol routes

All three now use flocking + jitter + enhanced collision avoidance.

## Technical Details

### New Constants
```typescript
// Flocking/Boids constants
const SEPARATION_RADIUS = 1.5; // meters
const SEPARATION_FORCE = 8.0;
const COHESION_RADIUS = 4.0; // meters
const COHESION_FORCE = 2.0;
const ALIGNMENT_RADIUS = 3.0; // meters
const ALIGNMENT_FORCE = 1.5;
const FLOCKING_MAX_FORCE = 5.0;

// Enhanced pathfinding
const PATHFINDING_ANGLE_STEP = Math.PI / 8; // 22.5 degrees
const PATHFINDING_MAX_ANGLES = 6; // 6 angles per side
```

### New Functions

#### `calculateSeparation(unit, allUnits)`
Returns a force vector pushing away from nearby friendly units.

#### `calculateCohesion(unit, allUnits)`
Returns a force vector toward the average position of nearby moving friendlies.

#### `calculateAlignment(unit, allUnits, currentDirection)`
Returns a force vector to align with nearby units' movement directions.

#### `applyFlockingBehavior(unit, baseDirection, allUnits)`
Combines all three forces with the base movement direction for smooth group movement.

#### `applyJitterMovement(unit, baseDirection, allUnits, obstacles)`
Applies circular wiggle pattern to help stuck units escape.

### Performance Impact

- **Separation**: O(n) per unit - checks nearby units within radius
- **Cohesion**: O(n) per unit - calculates average position
- **Alignment**: O(n) per unit - averages movement directions
- **Overall**: O(n²) in worst case, but radius-limited so typically much better
- **Optimization**: Only active units are considered, radius checks are fast

The performance impact is minimal - these calculations are simple vector operations and are radius-limited, so they only affect nearby units.

## Expected Results

### Before
- Units get stuck when moving in groups
- Groups spread out or bunch up unpredictably
- Units stop completely when blocked by friendlies
- Pathfinding gives up easily around obstacles
- Frustrating micromanagement required

### After
- Smooth, fluid group movement like StarCraft
- Units maintain consistent spacing
- Groups flow around obstacles naturally
- Units slide past friendlies gracefully
- Stuck units wiggle free automatically
- Formations adapt to terrain dynamically

## Testing Recommendations

1. **Small Groups (2-5 units)**: Should move tightly together with no sticking
2. **Medium Groups (10-15 units)**: Should maintain cohesion while flowing around obstacles
3. **Large Groups (20+ units)**: Should spread out appropriately but stay coordinated
4. **Choke Points**: Groups should funnel through narrow passages without jamming
5. **Formation Changes**: Units should reorganize smoothly when changing formations
6. **Attack-Move**: Groups should maintain formation while engaging enemies
7. **Patrol**: Groups should move back and forth smoothly without getting stuck

## Future Enhancements

Potential improvements to consider:
1. **Adaptive separation radius**: Smaller for melee units, larger for ranged
2. **Priority-based collision**: High-priority units (heroes) get right-of-way
3. **Dynamic formation reshaping**: Automatically adjust formation shape around obstacles
4. **Predictive avoidance**: Anticipate where other units will be, not just where they are
5. **Flow field pathfinding**: For very large groups (50+ units)
6. **Unit-type-specific behavior**: Scouts move faster, tanks move slower, etc.

## Configuration

All constants can be tuned in `simulation.ts`:
- Increase `SEPARATION_FORCE` for more spacing
- Increase `COHESION_FORCE` for tighter groups
- Increase `ALIGNMENT_FORCE` for more synchronized movement
- Adjust radius values to affect interaction distances

## References

- Craig Reynolds' Boids Algorithm (1986)
- StarCraft Remastered Unit Movement Analysis
- Supreme Commander Flow Field Pathfinding
- Age of Empires II Formation System
