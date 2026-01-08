# Field Particles System

## Overview
The field particles system adds dynamic white particles with physics to the middle section of the game arena. These particles create a visually engaging environment and respond to game entities (units, bases, and projectiles) by being repelled when entities pass through them.

## Features

### Positioning
- **Quartile Constraint**: Particles are confined to the middle 50% of the arena vertically (between Y = 25% and Y = 75%)
- **Horizontal Coverage**: Particles span the full width of the arena
- **Boundary Behavior**: Particles bounce softly when hitting quartile or arena boundaries

### Density Distribution
- **Center-Focused**: Higher particle density near the center of the field
- **Gradient Algorithm**: Uses rejection sampling with configurable gradient factor
- **Natural Distribution**: Creates a visually appealing concentration without hard clustering

### Physics Properties
- **Mass**: Very low (0.05) for easy displacement by game entities
- **Damping**: 0.95 velocity damping creates smooth, organic movement
- **Max Speed**: 8.0 meters per second prevents excessive velocities
- **Bounce Damping**: 0.5 factor creates soft, realistic boundary collisions

### Repulsion System
Particles are repelled by three types of game entities:

1. **Units**
   - Repulsion Radius: 3.0 meters
   - Force Strength: 8.0
   - Effect: Units create a clear "wake" as they move through particles

2. **Bases**
   - Repulsion Radius: 4.0 meters (larger to account for base size)
   - Force Strength: 6.0
   - Effect: Bases maintain a clear zone around them

3. **Projectiles**
   - Repulsion Radius: 2.0 meters
   - Force Strength: 5.0
   - Effect: Projectiles create brief disturbances as they travel

### Visual Rendering
- **Color**: White (COLORS.white from theme)
- **Size**: 0.15 meters
- **Opacity**: 0.6 (semi-transparent)
- **Glow**: Subtle shadow blur effect (3x particle size)
- **Z-Level**: Rendered before units but after projectiles

## Configuration Constants

### Particle Constants
```typescript
FIELD_PARTICLE_BASE_COUNT = 100      // Total number of particles
FIELD_PARTICLE_SIZE = 0.15           // Size in meters
FIELD_PARTICLE_MASS = 0.05           // Very low for easy repulsion
FIELD_PARTICLE_OPACITY = 0.6         // Semi-transparent
```

### Repulsion Constants
```typescript
UNIT_REPULSION_RADIUS = 3.0          // Distance in meters
UNIT_REPULSION_FORCE = 8.0           // Force strength
PROJECTILE_REPULSION_RADIUS = 2.0    // Distance in meters
PROJECTILE_REPULSION_FORCE = 5.0     // Force strength
BASE_REPULSION_RADIUS = 4.0          // Distance in meters
BASE_REPULSION_FORCE = 6.0           // Force strength
```

### Physics Constants
```typescript
PARTICLE_DAMPING = 0.95              // Velocity reduction per frame
PARTICLE_MAX_SPEED = 8.0             // Maximum speed in m/s
BOUNDARY_MARGIN = 2.0                // Margin from arena edges
BOUNCE_DAMPING_FACTOR = 0.5          // Velocity reduction on bounce
MIN_REPULSION_DISTANCE = 0.01        // Prevents division by zero
DENSITY_GRADIENT_FACTOR = 0.5        // Controls center density increase
```

## Performance Optimizations

1. **Squared Distance Comparisons**: Speed checks use squared values to avoid expensive sqrt operations
2. **Pre-calculated Constants**: `PARTICLE_MAX_SPEED_SQUARED` is pre-calculated
3. **Conditional Rendering**: Respects the `enableParticleEffects` setting toggle
4. **Efficient Loops**: Optimized repulsion calculations with early termination

## Integration Points

### Initialization
Field particles are initialized in all game state creation functions:
- `createBackgroundBattle()`
- `createTutorialState()`
- `createGameState()`
- `createOnlineGameState()`
- `createOnlineCountdownState()`

### Update Loop
Field particles are updated in the main game loop:
- Background battle updates
- Countdown phase updates
- Active game updates

### Rendering
Field particles are rendered at the appropriate Z-level:
- After projectiles
- Before units
- Respects camera transforms for proper positioning

## User Settings
Field particles can be toggled on/off via the game settings:
- Setting: `enableParticleEffects`
- Default: Enabled
- Effect: When disabled, field particles are not rendered or updated

## Technical Details

### File Structure
- **Types**: `src/lib/types.ts` - `FieldParticle` interface and `GameState.fieldParticles` property
- **Logic**: `src/lib/fieldParticles.ts` - Initialization and physics update functions
- **Integration**: `src/App.tsx` - Initialization and update calls in game loop
- **Rendering**: `src/lib/renderer.ts` - Drawing function

### Memory Impact
- Each particle: ~100 bytes (position, velocity, mass, size, opacity, id)
- 100 particles: ~10 KB total
- Minimal impact on overall game performance

### Collision Detection
Particles use the existing `distance()` utility function from `gameUtils.ts` for efficient distance calculations with all game entities.

## Future Enhancements
Potential improvements for future versions:
- Dynamic particle count based on device performance
- Particle color variations
- Connection lines between nearby particles (similar to floaters)
- Particle lifetime and respawning system
- Different particle behaviors in different arena zones
