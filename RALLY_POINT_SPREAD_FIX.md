# Rally Point Spread Fix - Preventing Unit Pile-ups at Spawn

## Problem Statement
When units spawned from the base and moved to the rally point, they would all target the exact same position. This caused them to pile up in one big cluster and get stuck, as all units were trying to reach the same coordinates simultaneously.

## Root Cause
The `spawnUnit` function was giving every spawned unit the exact same rally point position as their initial movement command. With multiple units spawning in quick succession, they would all converge on this single point, causing:
- Units to stack on top of each other
- Collision avoidance to trigger aggressively
- Units to get stuck while trying to squeeze through each other
- Poor visual appearance with units clumped in a pile

## Solution: Random Circular Spread

### Implementation
Added a random circular offset to each spawned unit's rally point target. Each unit now receives a slightly different destination within a radius around the original rally point.

### Technical Details

#### New Constant
```typescript
const RALLY_POINT_SPREAD_RADIUS = 1.5; // meters - radius around rally point where units will be distributed
```

#### Modified `spawnUnit` Function
The function now:
1. Calculates the safe rally position as before
2. Generates a random angle (0 to 2π radians)
3. Generates a random distance (0 to RALLY_POINT_SPREAD_RADIUS)
4. Calculates offset position using polar coordinates:
   - `x = safeRallyPos.x + cos(angle) * distance`
   - `y = safeRallyPos.y + sin(angle) * distance`
5. Validates the offset position through `getSafeRallyPosition` to ensure it's not in obstacles or out of bounds
6. Uses the validated offset position as the unit's rally target

### Code Changes
```typescript
// Add a random offset to the rally point to spread out spawned units
// This prevents units from all targeting the exact same point and piling up
const angle = Math.random() * Math.PI * 2; // Random angle in radians
const distance = Math.random() * RALLY_POINT_SPREAD_RADIUS; // Random distance within spread radius
const offsetRallyPos = {
  x: safeRallyPos.x + Math.cos(angle) * distance,
  y: safeRallyPos.y + Math.sin(angle) * distance
};

// Ensure the offset rally position is still safe (not in obstacle or out of bounds)
const finalRallyPos = getSafeRallyPosition(state, spawnPos, offsetRallyPos);

// Use finalRallyPos instead of safeRallyPos for the unit's command queue
commandQueue: [{ type: 'move', position: finalRallyPos }]
```

## Benefits

### Before the Fix
- ❌ Units pile up at the exact rally point
- ❌ Severe congestion when spawning multiple units
- ❌ Units get stuck trying to reach the same coordinate
- ❌ Poor visual appearance with clumped units
- ❌ Difficulty moving units away from rally point

### After the Fix
- ✅ Units spread out naturally in a circle around rally point
- ✅ Smooth flow from base to rally area
- ✅ No pile-ups or congestion
- ✅ Better visual appearance with distributed units
- ✅ Flocking behavior maintains cohesion while moving
- ✅ Units can easily start moving as a group

## How It Works with Existing Systems

### Compatibility with Flocking Behavior
The spread radius (1.5 meters) is specifically chosen to work well with the existing flocking system:
- **Separation radius**: 1.5m - Units maintain spacing but don't repel too aggressively
- **Cohesion radius**: 4.0m - Units within the spread area still form a cohesive group
- **Alignment radius**: 3.0m - Units coordinate movement direction naturally

The spread prevents the initial pile-up, then flocking takes over to maintain smooth group movement.

### Safety Validation
The offset rally position goes through the same `getSafeRallyPosition` validation as the original rally point, ensuring:
- Units don't target positions inside obstacles
- Units stay within playable boundaries
- If offset position is unsafe, it steps back toward spawn position
- Falls back to spawn position if no safe position found

## Configuration and Tuning

### Adjusting Spread Radius
The `RALLY_POINT_SPREAD_RADIUS` constant can be tuned based on needs:
- **Smaller (0.5-1.0m)**: Tighter grouping, faster convergence
- **Current (1.5m)**: Balanced spread with good flow
- **Larger (2.0-3.0m)**: More spread out, may feel less cohesive

### Considerations
- Too small: Units may still pile up slightly
- Too large: Units may look disconnected from rally point
- Current value (1.5m) provides good balance

## Testing Recommendations

### Small Groups (2-5 units)
- Should spread out slightly around rally point
- No visible stacking or congestion
- Quick convergence into formation

### Medium Groups (10-15 units)
- Should form a natural circle/cluster around rally point
- Smooth flow from base to rally area
- Maintain cohesion while moving

### Large Groups (20+ units)
- Should spread out broadly but maintain group identity
- No pile-ups or stuck units
- Natural self-organization

### Rapid Spawning
- Test spawning many units quickly (10+ units in quick succession)
- Should not create congestion
- Units should flow smoothly to their spread positions

## Performance Impact

**Negligible** - The changes add:
- Two random number generations per spawn
- Two trigonometric calculations (cos, sin)
- One additional `getSafeRallyPosition` call

These operations are trivial compared to the overall spawn process and game simulation.

## Files Modified

1. **src/lib/simulation.ts**
   - Added `RALLY_POINT_SPREAD_RADIUS` constant
   - Modified `spawnUnit` function to apply random circular offset
   - Added safety validation for offset positions

## Related Systems

This fix works alongside:
- **Flocking/Boids Algorithm** (GROUP_MOVEMENT_FIX.md): Maintains group cohesion after initial spread
- **Collision Avoidance**: Prevents units from overlapping during movement
- **Pathfinding**: Helps units navigate around obstacles to their individual targets

## Future Enhancements

Potential improvements to consider:
1. **Formation-aware spread**: Spread units in the player's current formation shape
2. **Directional spread**: Spread units along the path from base to rally point
3. **Dynamic spread radius**: Adjust based on number of units spawning simultaneously
4. **Priority lanes**: Higher priority units get positions closer to exact rally point

## References

- Original issue: "Units come out of the base and there are a lot of units, they should move out of the way for each other, they all end up getting stuck in one big pile all trying to go to the ralley point"
- Related: GROUP_MOVEMENT_FIX.md (flocking behavior)
- Related: GROUP_MOVEMENT_IMPROVEMENTS.md (reduced oscillations)
