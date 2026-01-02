# Sprite Assets

This directory contains all sprite assets for the game.

## Sprite Orientation

**Important:** All projectile and bullet sprites are designed with the following orientation:

- **Forward direction is UPWARD** (pointing up in the image)
- Sprites should be rotated to face their movement direction during rendering
- The base rotation adjustment needed is +90° (π/2 radians) from the standard right-facing orientation

### Affected Sprites

The following sprites use upward-facing orientation:

1. **Beta Tower Bullet Particle** (`projectiles/particles/particle1.png`)
   - Used for beta tower projectiles
   - Sprite faces upward (0° = up)

2. **Gamma Tower Bullet Particle** (`projectiles/particles/particle1.png`)
   - Used for gamma tower projectiles
   - Sprite faces upward (0° = up)

3. **Delta Tower Ships** (unit sprites)
   - Delta tower ship units
   - Sprite faces upward (0° = up)

4. **Epsilon Projectile** (`projectiles/throw/throw1.png`)
   - Used for epsilon unit projectiles
   - Sprite faces upward (0° = up)

## Rendering Guidelines

When rendering these sprites in code:

```typescript
// Calculate the angle based on velocity
const angle = Math.atan2(velocity.y, velocity.x);

// Add π/2 (90 degrees) to account for upward-facing sprite
const spriteRotation = angle + Math.PI / 2;

// Apply rotation
ctx.rotate(spriteRotation);
```

This ensures that sprites designed to face upward will correctly align with their movement direction.
