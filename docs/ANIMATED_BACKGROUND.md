# Animated Background System

## Overview

The AnimatedBackground component provides a dynamic particle-based background for menu screens in Speed of Light RTS. It features galaxy formations with orbiting particles and a push effect system that can be triggered by ability activations.

## Features

### 1. Galaxy Formations
- **Multiple galaxies**: Configurable number of galaxy formations (default: 3)
- **Center masses**: Each galaxy has a glowing center point that drifts slowly
- **Orbiting particles**: 70% of particles orbit around galaxy centers
- **Variable orbit speeds**: Particles farther from center orbit slower, creating depth
- **Drift behavior**: Galaxies slowly drift and bounce off screen edges

### 2. Free-Floating Particles
- **Minimum velocity**: All free particles have a minimum speed (0.08) to prevent jittering
- **Smooth motion**: Constant velocity ensures no visual "stuttering"
- **Screen wrapping**: Particles wrap around edges for continuous motion
- **30% distribution**: 30% of particles are free-floating, independent of galaxies

### 3. Visual Effects
- **Particle glow**: Each particle has a soft glow effect
- **Pulsing opacity**: Particles pulse subtly for visual interest
- **Connection lines**: Nearby particles are connected with lines
- **Center mass visualization**: Galaxy centers are rendered as glowing points

### 4. Push Effect System
- **Event-based**: Triggered via custom `backgroundPush` events
- **Force-based**: Configurable force value affects push magnitude
- **Distance falloff**: Push effect weakens with distance from source
- **Differential movement**: 
  - Galaxy centers move less (30% of force)
  - Free particles move more (100% of force)
  - Galaxy particles maintain orbital behavior
- **Velocity clamping**: Prevents particles from moving too fast

## Component Props

```typescript
interface AnimatedBackgroundProps {
  particleCount?: number;  // Total number of particles (default: 50)
  color?: string;          // Color in oklch format (default: 'oklch(0.65 0.25 240)')
  galaxyCount?: number;    // Number of galaxy formations (default: 3)
}
```

## Usage

### Basic Integration

```tsx
import { AnimatedBackground } from './components/AnimatedBackground';

<AnimatedBackground 
  particleCount={60} 
  color="oklch(0.65 0.25 240)"
  galaxyCount={3}
/>
```

### Triggering Push Effects

Push effects can be triggered from anywhere in the application using custom events:

```typescript
// Basic push
window.dispatchEvent(new CustomEvent('backgroundPush', {
  detail: { 
    x: screenX,      // X coordinate in pixels
    y: screenY,      // Y coordinate in pixels
    force: 10        // Force magnitude (5-20 typical range)
  }
}));
```

### Integration with Abilities

The `triggerBackgroundPush` helper function has been added to `visualEffects.ts`:

```typescript
import { triggerBackgroundPush } from './lib/visualEffects';

// In ability activation code
triggerBackgroundPush(abilityPosition, 15);
```

This is automatically called for all abilities in `createAbilityEffect()` with appropriate force values:
- Light abilities: 5-7 force
- Medium abilities: 8-10 force
- Heavy abilities: 12-15 force

## Technical Details

### Performance Considerations
- **Efficient rendering**: Uses canvas 2D context for hardware-accelerated rendering
- **Particle limits**: Configurable particle count prevents performance issues
- **Optimized loops**: Connection lines only drawn for nearby particles
- **RequestAnimationFrame**: Uses browser's animation frame for smooth 60fps

### Galaxy Physics
- **Orbital motion**: Particles maintain circular orbits around galaxy centers
- **Angular velocity**: `orbitSpeed = rotationSpeed / (1 + distance / radius)`
- **Rotation direction**: Each galaxy rotates clockwise or counter-clockwise
- **Drift velocity**: Very slow (0.05 max) to create subtle movement

### Push Physics
- **Push radius**: 300 pixels from push origin
- **Force falloff**: `pushMagnitude = force / (1 + distance * factor)`
- **Velocity bounds**: 
  - Minimum: 0.08 (for free particles)
  - Maximum: 2.0 (for free particles)
  - Maximum: 0.3 (for galaxy centers)

## Examples

### Example 1: Push from Screen Center
```typescript
const centerX = window.innerWidth / 2;
const centerY = window.innerHeight / 2;

window.dispatchEvent(new CustomEvent('backgroundPush', {
  detail: { x: centerX, y: centerY, force: 20 }
}));
```

### Example 2: Sequential Pushes
```typescript
const pushSequence = [
  { x: 200, y: 200, force: 15, delay: 0 },
  { x: 800, y: 200, force: 15, delay: 300 },
  { x: 500, y: 600, force: 20, delay: 600 }
];

pushSequence.forEach(push => {
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('backgroundPush', {
      detail: { x: push.x, y: push.y, force: push.force }
    }));
  }, push.delay);
});
```

### Example 3: Mouse-Following Push
```typescript
window.addEventListener('mousemove', (e) => {
  if (Math.random() < 0.1) { // 10% chance per frame
    window.dispatchEvent(new CustomEvent('backgroundPush', {
      detail: { x: e.clientX, y: e.clientY, force: 5 }
    }));
  }
});
```

## Future Enhancements

Possible future improvements:
1. **Gravity wells**: Attract particles toward points
2. **Repulsion fields**: Push particles away continuously
3. **Color transitions**: Galaxy colors change over time
4. **Particle trails**: Leave fading trails behind particles
5. **Formation patterns**: Additional patterns beyond circular orbits
6. **Collision detection**: Particles interact with each other
7. **Sound integration**: Subtle audio feedback on pushes
8. **3D depth**: Z-axis for layered galaxies

## Troubleshooting

### Particles appear jittery
- Check that minimum velocity is set (MIN_VELOCITY = 0.08)
- Ensure browser supports requestAnimationFrame
- Verify canvas size matches viewport

### Push effects not working
- Confirm AnimatedBackground component is mounted
- Check browser console for event listener errors
- Verify event detail structure matches expected format

### Performance issues
- Reduce `particleCount` (try 30-40)
- Reduce `galaxyCount` (try 2)
- Disable connection lines in production if needed
- Check for memory leaks from event listeners

## Browser Support

- Modern browsers with Canvas 2D support
- Tested on Chrome, Firefox, Safari, Edge
- Requires ES6+ JavaScript support
- Hardware acceleration recommended for best performance
