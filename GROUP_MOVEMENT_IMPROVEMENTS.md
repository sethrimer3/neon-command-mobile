# Group Movement Improvements - Reducing Violent Oscillations

## Problem
Units were experiencing violent oscillations, sliding around each other aggressively, shaking, and getting stuck when moving in groups. This was caused by overly strong flocking forces that created feedback loops and oscillations.

## Root Causes Identified

### 1. Excessive Force Magnitudes
- **Separation force of 8.0** was too strong, causing units to push each other violently when close
- When multiple units clustered, the combined forces could become extreme
- No upper limit on combined force magnitude allowed forces to compound

### 2. Instant Force Changes
- Forces were recalculated every frame without smoothing
- Sudden changes in nearby unit positions caused abrupt force spikes
- This created oscillations where units would overshoot corrections

### 3. No Dead Zone
- Forces applied even at very close distances (< 0.1m)
- At extremely close range, small position changes caused large force variations
- Led to jittering and shaking when units were tightly packed

### 4. Linear Force Falloff
- Simple linear distance weighting created predictable but potentially unstable forces
- Didn't account for the increasing instability at very close ranges

### 5. Collision System Conflicts
- Strong flocking forces could conflict with the collision sliding system
- Units would try to separate via flocking while collision system tried to slide them
- Created competing movement vectors that caused erratic behavior

## Solutions Implemented

### 1. Reduced Force Magnitudes
```typescript
// Before:
const SEPARATION_FORCE = 8.0;
const COHESION_FORCE = 2.0;
const ALIGNMENT_FORCE = 1.5;
const FLOCKING_MAX_FORCE = 5.0;

// After:
const SEPARATION_FORCE = 3.0;   // 62.5% reduction
const COHESION_FORCE = 1.0;     // 50% reduction
const ALIGNMENT_FORCE = 0.8;    // 47% reduction
const FLOCKING_MAX_FORCE = 3.0; // 40% reduction
```

**Benefits:**
- Gentler separation prevents violent pushing
- Units maintain cohesion without over-correcting
- Smoother alignment reduces erratic direction changes
- Lower max force prevents extreme behaviors

### 2. Added Dead Zone for Separation
```typescript
const SEPARATION_DEAD_ZONE = 0.3; // meters
```

**Implementation:**
- No separation force applied when units are within 0.3m
- Prevents jitter at very close ranges
- Allows units to naturally settle into stable positions
- Reduces computational overhead for tightly packed groups

### 3. Force Smoothing (Temporal Damping)
```typescript
const FLOCKING_FORCE_SMOOTHING = 0.7;
```

**Implementation:**
```typescript
// Blend previous force with current force
if (unit.previousFlockingForce) {
  flockingForce = {
    x: previousForce.x * 0.7 + currentForce.x * 0.3,
    y: previousForce.y * 0.7 + currentForce.y * 0.3
  };
}
```

**Benefits:**
- Prevents sudden force changes between frames
- Creates momentum in force direction
- Eliminates oscillations from frame-to-frame force variations
- Smoother, more natural-looking movement

### 4. Quadratic Falloff for Separation
```typescript
// Before: Linear falloff
const weight = (SEPARATION_RADIUS - dist) / SEPARATION_RADIUS;

// After: Quadratic falloff with dead zone
const normalizedDist = (dist - SEPARATION_DEAD_ZONE) / (SEPARATION_RADIUS - SEPARATION_DEAD_ZONE);
const weight = (1 - normalizedDist) * (1 - normalizedDist);
```

**Benefits:**
- Smoother force curve
- Reduces force more gradually at medium distances
- Stronger reduction as units get very close
- More stable behavior overall

### 5. Distance-Scaled Cohesion and Alignment
```typescript
// Cohesion: Weaker at longer distances
const normalizedDist = Math.min(cohesionMagnitude / COHESION_RADIUS, 1.0);
const strength = COHESION_FORCE * normalizedDist;

// Alignment: Scaled by magnitude of direction difference
const strength = ALIGNMENT_FORCE * Math.min(alignmentMagnitude, 1.0);
```

**Benefits:**
- More natural grouping behavior
- Less aggressive corrections at distance
- Proportional response to actual misalignment

### 6. More Permissive Collision Detection
```typescript
// Before:
const UNIT_COLLISION_SQUEEZE_FACTOR = 0.8;

// After:
const UNIT_COLLISION_SQUEEZE_FACTOR = 0.75;
```

**Benefits:**
- Units can pass each other more easily
- Reduces blocking in tight formations
- Better flow through groups
- Fewer stuck situations

## Expected Improvements

### Before These Changes:
- Units shake and vibrate when grouped
- Violent sliding and pushing between units
- Units getting stuck and unable to pass each other
- Oscillating movement patterns (zig-zagging)
- Formations breaking apart under stress
- Erratic behavior when many units cluster

### After These Changes:
- ✅ Smooth, stable group movement
- ✅ Gentle separation without violent pushing
- ✅ Units flow around each other naturally
- ✅ Stable formations even when tightly packed
- ✅ No more shaking or oscillations
- ✅ Better pathfinding through clustered groups
- ✅ More predictable unit behavior

## Testing Recommendations

### Small Groups (2-5 units)
- Should maintain tight formation
- No visible shaking or oscillation
- Smooth passing when moving past each other

### Medium Groups (10-15 units)
- Should spread out naturally into stable formation
- Maintain cohesion while moving
- Flow around obstacles smoothly

### Large Groups (20+ units)
- Should self-organize into stable clusters
- No mass pushing or shoving
- Gradual spreading instead of explosive separation

### Stress Tests
1. **Tight Choke Points**: Units should queue smoothly, not pile up
2. **Opposing Groups**: Should slide past each other without bouncing
3. **Formation Changes**: Should reorganize smoothly without chaos
4. **Stop-and-Go**: Should resume movement without initial jitter

## Tuning Guide

If further adjustments are needed:

### Units Too Spread Out
- Increase `COHESION_FORCE` (try 1.2-1.5)
- Increase `COHESION_RADIUS` (try 4.5-5.0)

### Units Still Shaking
- Increase `FLOCKING_FORCE_SMOOTHING` (try 0.75-0.8)
- Increase `SEPARATION_DEAD_ZONE` (try 0.4-0.5)
- Decrease `SEPARATION_FORCE` further (try 2.5 or 2.0)

### Units Too Clumped
- Increase `SEPARATION_FORCE` slightly (try 3.5 or 4.0)
- Decrease `SEPARATION_DEAD_ZONE` (try 0.2)

### Units Not Aligning Well
- Increase `ALIGNMENT_FORCE` (try 1.0-1.2)
- Increase `ALIGNMENT_RADIUS` (try 3.5-4.0)

### Units Getting Stuck
- Decrease `UNIT_COLLISION_SQUEEZE_FACTOR` (try 0.7)
- Increase slide distance options in collision code

## Technical Details

### Force Combination
The final movement direction is computed as:
```typescript
finalDirection = baseDirection * 10.0 + smoothedFlockingForce
```

The base direction (toward goal) is weighted 10x stronger than flocking forces, ensuring units always prioritize reaching their destination while the flocking forces provide subtle adjustments for smooth group behavior.

### Performance Impact
- Negligible - force smoothing adds one vector interpolation per unit per frame
- Dead zone actually improves performance by skipping calculations for very close units
- Overall computational cost remains O(n²) but with better constants

## Implementation Files Modified

1. **src/lib/simulation.ts**
   - Updated flocking constants
   - Modified `calculateSeparation()` with dead zone and quadratic falloff
   - Modified `calculateCohesion()` with distance-based scaling
   - Modified `calculateAlignment()` with magnitude-based scaling
   - Updated `applyFlockingBehavior()` with force smoothing
   - Updated `UNIT_COLLISION_SQUEEZE_FACTOR`

2. **src/lib/types.ts**
   - Added `previousFlockingForce?: Vector2` to Unit interface

## References

- Original flocking algorithm: Craig Reynolds' Boids (1986)
- Force smoothing: Common technique in physics simulations
- Dead zones: Standard practice in control systems to prevent oscillations
- Quadratic falloff: Provides better stability than linear or inverse square

## Update: Fixed Unit Sticking Issue (Dead Zone Trap)

### New Problem Discovered
After implementing the dead zone (0.3m) to prevent oscillations, a new issue emerged:
- **2 units consistently getting stuck** when moving together
- Units would jitter without making progress toward their destination
- Most problematic with exactly 2 units (no third party to break symmetry)

### Root Cause: Dead Zone Trap
The `SEPARATION_DEAD_ZONE` created a "trap zone" where:
1. Units within 0.3m have **NO separation force** pushing them apart
2. Cohesion and alignment forces continue to pull them together
3. Local collision push is insufficient to separate them
4. Results in balanced forces that cancel out → jittering in place
5. With only 2 units, forces become perfectly balanced with no way to break free

### Solution: Removed Dead Zone, Improved Falloff
```typescript
// Before:
const SEPARATION_DEAD_ZONE = 0.3;
const normalizedDist = (dist - SEPARATION_DEAD_ZONE) / (SEPARATION_RADIUS - SEPARATION_DEAD_ZONE);
const weight = (1 - normalizedDist) * (1 - normalizedDist); // Quadratic falloff

// After:
const SEPARATION_MIN_DISTANCE = 0.05; // Only to prevent division by zero
const normalizedDist = dist / SEPARATION_RADIUS;
const weight = Math.pow(1 - normalizedDist, 3); // Cubic falloff
```

**Benefits:**
- ✅ Separation force now active at all distances (down to 0.05m)
- ✅ Cubic falloff provides stronger separation at very close range
- ✅ Smooth, continuous force prevents oscillations
- ✅ No more "trap zones" where units can get stuck
- ✅ Force smoothing (0.7) still active to prevent jitter
- ✅ Fixes the 2-unit sticking issue without introducing new problems

**Force Profile Comparison:**
- At 0.05m: weight = 0.905 (very strong)
- At 0.3m (old dead zone): weight = 0.512 (moderate) 
- At 0.75m: weight = 0.125 (weak)
- At 1.5m: weight = 0.0 (none)

The cubic falloff (`x³`) provides:
- Strong separation when units are too close (prevents sticking)
- Gentle separation at medium distances (prevents oscillations)
- Natural tapering as units reach desired spacing
