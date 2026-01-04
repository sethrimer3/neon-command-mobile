# Group Movement Tuning Guide

Quick reference for adjusting the group movement behavior.

## Constants Location
All constants are in `src/lib/simulation.ts` at the top of the file.

## Flocking Forces

### Separation (Keep Units Apart)
```typescript
const SEPARATION_RADIUS = 1.5;    // How far to check for nearby units (meters)
const SEPARATION_FORCE = 8.0;     // How strongly to push away from nearby units
```
- **Increase radius** → Units start avoiding each other from farther away
- **Increase force** → Units push away from each other more aggressively
- **Decrease force** → Units can get closer together (tighter formations)

### Cohesion (Keep Groups Together)
```typescript
const COHESION_RADIUS = 4.0;      // How far to look for group center (meters)
const COHESION_FORCE = 2.0;       // How strongly to pull toward group center
```
- **Increase radius** → Larger groups stay cohesive
- **Increase force** → Groups pack tighter together
- **Decrease force** → Groups can spread out more naturally

### Alignment (Move in Same Direction)
```typescript
const ALIGNMENT_RADIUS = 3.0;     // How far to check other units' directions (meters)
const ALIGNMENT_FORCE = 1.5;      // How strongly to match neighbors' direction
```
- **Increase radius** → More coordinated movement over larger distances
- **Increase force** → Units turn more sharply to match neighbors
- **Decrease force** → More independent movement within groups

## Collision Avoidance

### Friendly Unit Sliding
```typescript
const FRIENDLY_SLIDE_DISTANCE = 0.3;  // How far to slide when avoiding friends (meters)
```
- **Increase** → Units take wider paths around friendlies (less cramped)
- **Decrease** → Units squeeze through tighter gaps (more aggressive)

### Pathfinding Precision
```typescript
const PATHFINDING_LOOKAHEAD_DISTANCE = 2.0;  // How far ahead to check (meters)
const PATHFINDING_ANGLE_STEP = Math.PI / 8;  // 22.5 degrees
const PATHFINDING_MAX_ANGLES = 6;            // Angles to try per side
```
- **Increase lookahead** → Anticipate obstacles earlier
- **Decrease angle step** → More precise pathfinding (more CPU)
- **Increase max angles** → Try more paths (more CPU, finds paths more often)

## Stuck Unit Recovery

### Stuck Detection
```typescript
const STUCK_DETECTION_THRESHOLD = 0.1;  // Minimum movement to not be stuck (meters)
const STUCK_TIMEOUT = 2.5;              // Seconds before canceling commands
```
- **Decrease threshold** → More sensitive stuck detection
- **Increase timeout** → Give units more time to find a path

### Jitter Movement
```typescript
// In applyJitterMovement() function:
const jitterRadius = 0.2;          // Size of wiggle circle (meters)
unit.jitterOffset += 0.1;          // Speed of wiggle cycle
```
- **Increase radius** → Larger wiggle movement
- **Increase offset increment** → Faster wiggle speed

## Movement Physics

### Acceleration/Deceleration
```typescript
const ACCELERATION_RATE = 15.0;           // Units per second²
const DECELERATION_RATE = 20.0;           // Units per second²
const COLLISION_DECELERATION_FACTOR = 0.5; // Speed reduction when blocked
```
- **Increase acceleration** → Units reach max speed faster (more responsive)
- **Increase deceleration** → Units stop faster (more precise)
- **Increase collision factor** → Slow down more when blocked (less pushing)

## Common Tuning Scenarios

### Problem: Units Too Spread Out
**Solution:**
- Increase `COHESION_FORCE` to 3.0-4.0
- Decrease `SEPARATION_RADIUS` to 1.0-1.2
- Decrease `FRIENDLY_SLIDE_DISTANCE` to 0.2

### Problem: Units Too Cramped/Overlapping
**Solution:**
- Increase `SEPARATION_FORCE` to 10.0-12.0
- Increase `SEPARATION_RADIUS` to 2.0
- Increase `FRIENDLY_SLIDE_DISTANCE` to 0.5

### Problem: Groups Break Apart
**Solution:**
- Increase `COHESION_RADIUS` to 5.0-6.0
- Increase `COHESION_FORCE` to 3.0
- Increase `ALIGNMENT_FORCE` to 2.0

### Problem: Movement Too Erratic
**Solution:**
- Decrease all force values by 20-30%
- Increase `ALIGNMENT_FORCE` for smoother turning
- Decrease `PATHFINDING_ANGLE_STEP` to π/12 (15°) for gentler turns

### Problem: Units Get Stuck Often
**Solution:**
- Increase `PATHFINDING_MAX_ANGLES` to 8
- Decrease `PATHFINDING_ANGLE_STEP` to π/16 (11.25°)
- Decrease `STUCK_TIMEOUT` to 2.0 (give up faster)
- Increase `jitterRadius` to 0.3 (bigger wiggle)

### Problem: Too Much CPU Usage
**Solution:**
- Decrease all radius values by 20%
- Decrease `PATHFINDING_MAX_ANGLES` to 4
- Increase `PATHFINDING_ANGLE_STEP` to π/6 (30°)

## Testing Your Changes

After modifying constants:

1. **Small Groups (3-5 units)**
   - Select units, right-click to move
   - Should maintain consistent spacing
   - Should all move together smoothly

2. **Large Groups (15-20 units)**
   - Groups should stay cohesive
   - Should flow around obstacles
   - Should not jam in choke points

3. **Stress Test (30+ units)**
   - Move large group through narrow passage
   - Units should funnel through without stopping
   - FPS should stay above 30

4. **Formation Test**
   - Select group, cycle through formations (1-6 keys)
   - Units should reorganize smoothly
   - No units should get left behind

## Recommended Starting Values

**For RTS-style precise control:**
```typescript
SEPARATION_FORCE = 8.0
COHESION_FORCE = 2.0
ALIGNMENT_FORCE = 1.5
```

**For more organic, fluid movement:**
```typescript
SEPARATION_FORCE = 6.0
COHESION_FORCE = 3.0
ALIGNMENT_FORCE = 2.0
```

**For tighter, military-style formations:**
```typescript
SEPARATION_FORCE = 10.0
COHESION_FORCE = 4.0
ALIGNMENT_FORCE = 2.5
```

## Performance Notes

- **Radius values** affect performance most (checked for every unit)
- Keep radii under 5.0m for good performance with 100+ units
- `PATHFINDING_MAX_ANGLES` > 8 may cause lag with many units
- Flocking forces use O(n) per unit within radius
- Test with `npm run dev` and watch FPS in debug HUD

## Rolling Back Changes

If you want to disable the new system entirely:
1. Set all force values to 0
2. This makes units behave like the old system
3. Or use `git checkout HEAD~1 src/lib/simulation.ts`

## Need Help?

See `GROUP_MOVEMENT_FIX.md` for detailed explanation of how the system works.
