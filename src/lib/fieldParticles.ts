import { FieldParticle, Vector2, GameState, Unit, Base, Projectile, ARENA_WIDTH_METERS } from './types';
import { generateId, getArenaHeight, distance, normalize, subtract, add, scale } from './gameUtils';

// Field particle constants
const FIELD_PARTICLE_BASE_COUNT = 100; // Base number of particles
const FIELD_PARTICLE_SIZE = 0.15; // Size in meters
const FIELD_PARTICLE_MASS = 0.05; // Very low mass for easy repulsion
const FIELD_PARTICLE_OPACITY = 0.6; // Opacity for white particles

// Repulsion constants
const UNIT_REPULSION_RADIUS = 3.0; // Distance at which units repel particles (meters)
const UNIT_REPULSION_FORCE = 8.0; // Force strength for unit repulsion
const PROJECTILE_REPULSION_RADIUS = 2.0; // Distance for projectile repulsion
const PROJECTILE_REPULSION_FORCE = 5.0; // Force for projectile repulsion
const BASE_REPULSION_RADIUS = 4.0; // Distance for base repulsion
const BASE_REPULSION_FORCE = 6.0; // Force for base repulsion

// Physics constants
const PARTICLE_DAMPING = 0.95; // Velocity damping to slow particles over time
const PARTICLE_MAX_SPEED = 8.0; // Maximum particle speed
const PARTICLE_MAX_SPEED_SQUARED = PARTICLE_MAX_SPEED * PARTICLE_MAX_SPEED; // Squared for optimization
const BOUNDARY_MARGIN = 2.0; // Margin from arena edges
const BOUNCE_DAMPING_FACTOR = 0.5; // Velocity reduction factor on boundary bounce
const MIN_REPULSION_DISTANCE = 0.01; // Minimum distance to avoid division by zero
const DENSITY_GRADIENT_FACTOR = 0.5; // Controls how much density increases toward center (0.5 = 50% increase)

/**
 * Initialize field particles distributed in the middle 50% of the arena (between 1st and 3rd quartiles)
 * Density increases toward the center
 */
export function initializeFieldParticles(arenaWidth: number, arenaHeight: number): FieldParticle[] {
  const particles: FieldParticle[] = [];
  
  // Calculate quartile boundaries (middle 50% = between 25% and 75%)
  const minY = arenaHeight * 0.25;
  const maxY = arenaHeight * 0.75;
  const centerY = arenaHeight / 2;
  
  // Generate particles with density gradient toward center
  for (let i = 0; i < FIELD_PARTICLE_BASE_COUNT; i++) {
    // Use a biased distribution that favors the center
    // Use rejection sampling to create higher density near center
    let x: number, y: number;
    let attempts = 0;
    const maxAttempts = 10;
    
    do {
      // Generate random position in the quartile range
      x = Math.random() * arenaWidth;
      y = minY + Math.random() * (maxY - minY);
      
      // Calculate distance from center (normalized 0-1)
      // Use squared distance to avoid expensive sqrt in rejection sampling
      const distFromCenterX = Math.abs(x - arenaWidth / 2) / (arenaWidth / 2);
      const distFromCenterY = Math.abs(y - centerY) / ((maxY - minY) / 2);
      const distFromCenterSquared = distFromCenterX * distFromCenterX + distFromCenterY * distFromCenterY;
      
      // Accept position with probability inversely proportional to distance from center
      // This creates higher density near center
      // Using squared distance maintains the same distribution
      const acceptProbability = 1.0 - (Math.sqrt(distFromCenterSquared) * DENSITY_GRADIENT_FACTOR);
      
      if (Math.random() < acceptProbability) {
        break;
      }
      
      attempts++;
    } while (attempts < maxAttempts);
    
    // Note: If maxAttempts is reached, the last generated position is used.
    // This is acceptable as it still falls within the valid quartile range.
    
    particles.push({
      id: generateId(),
      position: { x, y },
      velocity: { x: 0, y: 0 },
      mass: FIELD_PARTICLE_MASS,
      size: FIELD_PARTICLE_SIZE,
      opacity: FIELD_PARTICLE_OPACITY,
    });
  }
  
  return particles;
}

/**
 * Update field particle physics, applying repulsion forces from units, bases, and projectiles
 */
export function updateFieldParticles(state: GameState, deltaTime: number): void {
  if (!state.fieldParticles) return;
  
  const arenaWidth = ARENA_WIDTH_METERS;
  const arenaHeight = getArenaHeight();
  
  // Calculate quartile boundaries
  const minY = arenaHeight * 0.25;
  const maxY = arenaHeight * 0.75;
  
  for (const particle of state.fieldParticles) {
    // Reset force accumulator
    let forceX = 0;
    let forceY = 0;
    
    // Apply repulsion from units
    for (const unit of state.units) {
      const dist = distance(particle.position, unit.position);
      
      if (dist < UNIT_REPULSION_RADIUS && dist > MIN_REPULSION_DISTANCE) {
        const repulsionDir = normalize(subtract(particle.position, unit.position));
        const forceMagnitude = UNIT_REPULSION_FORCE * (1.0 - dist / UNIT_REPULSION_RADIUS);
        forceX += repulsionDir.x * forceMagnitude;
        forceY += repulsionDir.y * forceMagnitude;
      }
    }
    
    // Apply repulsion from bases
    for (const base of state.bases) {
      const dist = distance(particle.position, base.position);
      
      if (dist < BASE_REPULSION_RADIUS && dist > MIN_REPULSION_DISTANCE) {
        const repulsionDir = normalize(subtract(particle.position, base.position));
        const forceMagnitude = BASE_REPULSION_FORCE * (1.0 - dist / BASE_REPULSION_RADIUS);
        forceX += repulsionDir.x * forceMagnitude;
        forceY += repulsionDir.y * forceMagnitude;
      }
    }
    
    // Apply repulsion from projectiles
    if (state.projectiles) {
      for (const projectile of state.projectiles) {
        const dist = distance(particle.position, projectile.position);
        
        if (dist < PROJECTILE_REPULSION_RADIUS && dist > MIN_REPULSION_DISTANCE) {
          const repulsionDir = normalize(subtract(particle.position, projectile.position));
          const forceMagnitude = PROJECTILE_REPULSION_FORCE * (1.0 - dist / PROJECTILE_REPULSION_RADIUS);
          forceX += repulsionDir.x * forceMagnitude;
          forceY += repulsionDir.y * forceMagnitude;
        }
      }
    }
    
    // Apply force to velocity (F = ma, so a = F/m)
    particle.velocity.x += (forceX / particle.mass) * deltaTime;
    particle.velocity.y += (forceY / particle.mass) * deltaTime;
    
    // Apply damping
    particle.velocity.x *= PARTICLE_DAMPING;
    particle.velocity.y *= PARTICLE_DAMPING;
    
    // Clamp speed to maximum (use squared comparison to avoid sqrt when not needed)
    const speedSquared = particle.velocity.x * particle.velocity.x + particle.velocity.y * particle.velocity.y;
    if (speedSquared > PARTICLE_MAX_SPEED_SQUARED) {
      const speed = Math.sqrt(speedSquared);
      const scale = PARTICLE_MAX_SPEED / speed;
      particle.velocity.x *= scale;
      particle.velocity.y *= scale;
    }
    
    // Update position
    particle.position.x += particle.velocity.x * deltaTime;
    particle.position.y += particle.velocity.y * deltaTime;
    
    // Constrain to quartile boundaries with soft bounce
    if (particle.position.y < minY) {
      particle.position.y = minY;
      particle.velocity.y = Math.abs(particle.velocity.y) * BOUNCE_DAMPING_FACTOR;
    } else if (particle.position.y > maxY) {
      particle.position.y = maxY;
      particle.velocity.y = -Math.abs(particle.velocity.y) * BOUNCE_DAMPING_FACTOR;
    }
    
    // Constrain to arena width with soft bounce
    if (particle.position.x < BOUNDARY_MARGIN) {
      particle.position.x = BOUNDARY_MARGIN;
      particle.velocity.x = Math.abs(particle.velocity.x) * BOUNCE_DAMPING_FACTOR;
    } else if (particle.position.x > arenaWidth - BOUNDARY_MARGIN) {
      particle.position.x = arenaWidth - BOUNDARY_MARGIN;
      particle.velocity.x = -Math.abs(particle.velocity.x) * BOUNCE_DAMPING_FACTOR;
    }
  }
}
