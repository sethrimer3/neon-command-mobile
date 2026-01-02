import {
  GameState,
  Unit,
  Base,
  UnitType,
  Vector2,
  UNIT_DEFINITIONS,
  CommandNode,
  PROMOTION_DISTANCE_THRESHOLD,
  PROMOTION_MULTIPLIER,
  QUEUE_BONUS_PER_NODE,
  BASE_SIZE_METERS,
  UNIT_SIZE_METERS,
  ABILITY_MAX_RANGE,
  ABILITY_LASER_DAMAGE,
  ABILITY_LASER_WIDTH,
  ABILITY_LASER_DURATION,
  ABILITY_LASER_BASE_DAMAGE_MULTIPLIER,
  Particle,
  Projectile,
  FACTION_DEFINITIONS,
  UnitModifier,
  QUEUE_MAX_LENGTH,
  BASE_TYPE_DEFINITIONS,
} from './types';
import { distance, normalize, scale, add, subtract, generateId } from './gameUtils';
import { checkObstacleCollision } from './maps';
import { soundManager } from './sound';
import { createSpawnEffect, createHitSparks, createAbilityEffect, createEnhancedDeathExplosion, createScreenFlash, createLaserParticles } from './visualEffects';
import { ObjectPool } from './objectPool';

// Projectile constants - must be declared before object pool
const PROJECTILE_SPEED = 15; // meters per second
const PROJECTILE_LIFETIME = 2.0; // seconds before projectile disappears
const MELEE_EFFECT_DURATION = 0.2; // seconds for melee attack visual
const LASER_BEAM_DURATION = 0.5; // seconds for laser beam visual

// Helper function to calculate damage with armor
// Ranged attacks are reduced by armor, melee attacks ignore armor
function calculateDamageWithArmor(baseDamage: number, armor: number, isMelee: boolean, targetModifiers: UnitModifier[] = []): number {
  if (isMelee) {
    // Melee attacks ignore armor
    return baseDamage;
  } else {
    // Ranged attacks are reduced by armor
    // Armor reduces damage by a percentage: reduction = armor / (armor + 100)
    const armorReduction = armor / (armor + 100);
    return baseDamage * (1 - armorReduction);
  }
}

// Object pool for projectiles - reuse projectiles instead of creating/destroying
const projectilePool = new ObjectPool<Projectile>(
  () => ({
    id: generateId(),
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    damage: 0,
    owner: 0,
    color: '',
    lifetime: PROJECTILE_LIFETIME,
    createdAt: Date.now(),
    sourceUnit: '',
  }),
  (projectile) => {
    // Reset projectile state when returned to pool
    projectile.position.x = 0;
    projectile.position.y = 0;
    projectile.velocity.x = 0;
    projectile.velocity.y = 0;
    projectile.damage = 0;
    projectile.createdAt = Date.now();
    delete projectile.targetUnit;
  },
  100, // Initial pool size
  500  // Max pool size
);

// Unit collision constants
const UNIT_COLLISION_RADIUS = UNIT_SIZE_METERS / 2; // Minimum distance between unit centers
const UNIT_COLLISION_SQUEEZE_FACTOR = 0.8; // Allow units to squeeze past each other (80% of full diameter)
const FRIENDLY_SLIDE_DISTANCE = 0.3; // Distance to slide perpendicular when avoiding friendly units

// Particle physics constants
const PARTICLE_ATTRACTION_STRENGTH = 6.0; // How strongly particles are attracted to their unit
const PARTICLE_DAMPING = 0.92; // Velocity damping factor - reduces velocity to prevent excessive speeds
const PARTICLE_ORBIT_DISTANCE = 0.8; // Desired orbit distance from unit center
const PARTICLE_MIN_VELOCITY = 2.5; // Minimum velocity to keep particles moving
const PARTICLE_ORBITAL_SPEED = 2.0; // Speed of orbital rotation around unit
const PARTICLE_ORBITAL_FORCE = 1.2; // Force applied for orbital motion
const PARTICLE_ORBITAL_VELOCITY_SCALE = 0.5; // Scale factor for orbital velocity contribution
const PARTICLE_TRAIL_LENGTH = 6; // Number of trail positions to keep
const PARTICLE_MIN_SPEED_THRESHOLD = 0.01; // Threshold for detecting nearly stationary particles

// Rotation constants
const ROTATION_SPEED = 8.0; // radians per second - how fast units rotate to face direction

// Movement acceleration/deceleration constants
const ACCELERATION_RATE = 15.0; // units per second per second - how fast units accelerate
const DECELERATION_RATE = 20.0; // units per second per second - how fast units decelerate
const MIN_SPEED_THRESHOLD = 0.05; // Minimum speed before stopping completely
const COLLISION_DECELERATION_FACTOR = 0.5; // Factor to slow down when collision detected

// Visual effect constants
const IMPACT_EFFECT_DURATION = 0.5; // seconds for impact ring animation
const IMPACT_EFFECT_CLEANUP_TIME = 1.0; // seconds before old effects are removed
const DAMAGE_NUMBER_DURATION = 0.8; // seconds for damage number animation
const DAMAGE_NUMBER_CLEANUP_TIME = 1.0; // seconds before old numbers are removed
const SCREEN_SHAKE_BASE_DAMAGE = 10; // base damage divisor for shake intensity
const SCREEN_SHAKE_MAX_INTENSITY = 8; // maximum shake intensity
const SCREEN_SHAKE_DURATION_SHORT = 0.2; // seconds for unit death shakes
const SCREEN_SHAKE_DURATION_MEDIUM = 0.3; // seconds for base damage shakes
const SCREEN_SHAKE_DURATION_LONG = 0.8; // seconds for base destruction
const SCREEN_SHAKE_BASE_DESTROY_INTENSITY = 15; // shake intensity for base destruction
const SCREEN_SHAKE_MULTI_KILL_MULTIPLIER = 0.8; // multiplier per unit killed
const SCREEN_SHAKE_MULTI_KILL_THRESHOLD = 3; // minimum units for multi-kill shake

// Motion trail constants - exported for use in renderer
export const MOTION_TRAIL_DURATION = 0.5; // seconds for motion trail fade

// Stuck detection constants
const STUCK_DETECTION_THRESHOLD = 0.1; // Minimum distance unit must move to not be considered stuck
const STUCK_TIMEOUT = 2.5; // Seconds before a stuck unit cancels its command queue
export const QUEUE_FADE_DURATION = 1.0; // Seconds for command queue fade animation
export const QUEUE_DRAW_DURATION = 0.5; // Seconds for command queue draw-in animation
export const QUEUE_UNDRAW_DURATION = 0.5; // Seconds for command queue reverse un-draw animation

/**
 * Derives the playable arena bounds from boundary obstacles.
 * Uses boundary thickness to inset the playable area from the screen edge.
 * @param obstacles - Obstacles in the current level, including boundary walls
 * @returns Inset bounds or undefined when boundary data is unavailable
 */
function getPlayableBoundsFromObstacles(
  obstacles: import('./maps').Obstacle[]
): { minX: number; maxX: number; minY: number; maxY: number } | undefined {
  // Filter for boundary walls that define the arena perimeter.
  const boundaryObstacles = obstacles.filter((obstacle) => obstacle.type === 'boundary');

  if (boundaryObstacles.length < 4) {
    return undefined;
  }

  // Determine the outer edges of the arena from boundary rectangles.
  const minEdgeX = Math.min(...boundaryObstacles.map((obstacle) => obstacle.position.x - obstacle.width / 2));
  const maxEdgeX = Math.max(...boundaryObstacles.map((obstacle) => obstacle.position.x + obstacle.width / 2));
  const minEdgeY = Math.min(...boundaryObstacles.map((obstacle) => obstacle.position.y - obstacle.height / 2));
  const maxEdgeY = Math.max(...boundaryObstacles.map((obstacle) => obstacle.position.y + obstacle.height / 2));

  // Infer boundary thickness from the thinner side of each boundary rectangle.
  const boundaryThickness = Math.min(
    ...boundaryObstacles.map((obstacle) => Math.min(obstacle.width, obstacle.height))
  );

  return {
    minX: minEdgeX + boundaryThickness,
    maxX: maxEdgeX - boundaryThickness,
    minY: minEdgeY + boundaryThickness,
    maxY: maxEdgeY - boundaryThickness,
  };
}

/**
 * Clamps a rally position so spawned units don't aim into obstacles or off-screen.
 * Steps back toward the base if the initial rally point is blocked.
 * @param state - Current game state with obstacle data
 * @param spawnPos - Base position where the unit spawns
 * @param desiredRallyPos - Intended rally point from input
 * @returns Safe rally position inside the playable area
 */
function getSafeRallyPosition(
  state: GameState,
  spawnPos: Vector2,
  desiredRallyPos: Vector2
): Vector2 {
  const unitRadius = UNIT_SIZE_METERS / 2;
  const bounds = getPlayableBoundsFromObstacles(state.obstacles);

  // Clamp the rally point into the playable area if bounds are available.
  let clampedRallyPos = { ...desiredRallyPos };
  if (bounds) {
    const minX = bounds.minX + unitRadius;
    const maxX = bounds.maxX - unitRadius;
    const minY = bounds.minY + unitRadius;
    const maxY = bounds.maxY - unitRadius;

    clampedRallyPos = {
      x: Math.min(maxX, Math.max(minX, clampedRallyPos.x)),
      y: Math.min(maxY, Math.max(minY, clampedRallyPos.y)),
    };
  }

  // Accept the clamped position if it is not colliding with any obstacle.
  if (!checkObstacleCollision(clampedRallyPos, unitRadius, state.obstacles)) {
    return clampedRallyPos;
  }

  // Step back toward the spawn position until a valid rally point is found.
  const fallbackDirection = normalize(subtract(spawnPos, clampedRallyPos));
  const stepSize = 0.5;
  const maxSteps = 20;

  // If we cannot determine a direction, fall back to the spawn position immediately.
  if (fallbackDirection.x === 0 && fallbackDirection.y === 0) {
    return spawnPos;
  }

  for (let stepIndex = 1; stepIndex <= maxSteps; stepIndex += 1) {
    const candidate = add(clampedRallyPos, scale(fallbackDirection, stepSize * stepIndex));
    const boundedCandidate = bounds
      ? {
          x: Math.min(bounds.maxX - unitRadius, Math.max(bounds.minX + unitRadius, candidate.x)),
          y: Math.min(bounds.maxY - unitRadius, Math.max(bounds.minY + unitRadius, candidate.y)),
        }
      : candidate;

    if (!checkObstacleCollision(boundedCandidate, unitRadius, state.obstacles)) {
      return boundedCandidate;
    }
  }

  // Fall back to the spawn position if no safe rally spot is found.
  return spawnPos;
}

// Check if a position would collide with any existing unit
function checkUnitCollision(position: Vector2, currentUnitId: string, allUnits: Unit[]): boolean {
  // Use a slightly smaller collision radius to allow units to squeeze past each other
  const collisionRadius = (UNIT_COLLISION_RADIUS * 2) * UNIT_COLLISION_SQUEEZE_FACTOR;
  
  for (const otherUnit of allUnits) {
    // Skip checking against self
    if (otherUnit.id === currentUnitId) continue;
    
    // Calculate distance between units
    const dist = distance(position, otherUnit.position);
    
    // Check if units would overlap (within combined radii)
    if (dist < collisionRadius) {
      return true; // Collision detected
    }
  }
  return false; // No collision
}

// Enhanced collision check that attempts to find a slide path for friendly units
// Returns { blocked: boolean, alternativePosition?: Vector2 }
function checkUnitCollisionWithSliding(
  unit: Unit,
  desiredPosition: Vector2,
  allUnits: Unit[],
  obstacles: import('./maps').Obstacle[]
): { blocked: boolean; alternativePosition?: Vector2 } {
  const collisionRadius = (UNIT_COLLISION_RADIUS * 2) * UNIT_COLLISION_SQUEEZE_FACTOR;
  
  // Check obstacle collision first
  if (checkObstacleCollision(desiredPosition, UNIT_SIZE_METERS / 2, obstacles)) {
    return { blocked: true };
  }
  
  // Check unit collisions
  let hasEnemyCollision = false;
  let hasFriendlyCollision = false;
  
  for (const otherUnit of allUnits) {
    if (otherUnit.id === unit.id) continue;
    
    const dist = distance(desiredPosition, otherUnit.position);
    if (dist < collisionRadius) {
      if (otherUnit.owner === unit.owner) {
        hasFriendlyCollision = true;
      } else {
        hasEnemyCollision = true;
      }
    }
  }
  
  // If blocked by enemy, return blocked status
  if (hasEnemyCollision) {
    return { blocked: true };
  }
  
  // If only friendly collisions, try to find a sliding path
  if (hasFriendlyCollision) {
    const movementDirection = normalize(subtract(desiredPosition, unit.position));
    
    // Try sliding perpendicular to movement direction
    const perpendicular1 = { x: -movementDirection.y, y: movementDirection.x };
    const perpendicular2 = { x: movementDirection.y, y: -movementDirection.x };
    
    // Try sliding to the right
    const slidePos1 = add(desiredPosition, scale(perpendicular1, FRIENDLY_SLIDE_DISTANCE));
    if (!checkObstacleCollision(slidePos1, UNIT_SIZE_METERS / 2, obstacles) &&
        !checkUnitCollision(slidePos1, unit.id, allUnits)) {
      return { blocked: false, alternativePosition: slidePos1 };
    }
    
    // Try sliding to the left
    const slidePos2 = add(desiredPosition, scale(perpendicular2, FRIENDLY_SLIDE_DISTANCE));
    if (!checkObstacleCollision(slidePos2, UNIT_SIZE_METERS / 2, obstacles) &&
        !checkUnitCollision(slidePos2, unit.id, allUnits)) {
      return { blocked: false, alternativePosition: slidePos2 };
    }
    
    // If no slide path found, return blocked but still friendly collision
    return { blocked: true };
  }
  
  // No collision
  return { blocked: false };
}

// Helper function to mark unit's queue for cancellation due to being stuck
function markQueueForCancellation(unit: Unit): void {
  // Start fade animation for cancelled commands
  if (!unit.queueFadeStartTime) {
    unit.queueFadeStartTime = Date.now();
  }
}

// Helper function to update stuck detection for a unit that's blocked
function updateStuckDetection(unit: Unit, deltaTime: number): void {
  if (!unit.lastPosition) {
    unit.lastPosition = { ...unit.position };
    unit.stuckTimer = 0;
  } else {
    const distMoved = distance(unit.position, unit.lastPosition);
    
    if (distMoved < STUCK_DETECTION_THRESHOLD) {
      // Unit hasn't moved much - increment stuck timer
      unit.stuckTimer = (unit.stuckTimer || 0) + deltaTime;
      
      // If stuck for too long, cancel command queue
      if (unit.stuckTimer >= STUCK_TIMEOUT) {
        markQueueForCancellation(unit);
      }
    } else {
      // Unit moved enough - reset stuck timer
      unit.stuckTimer = 0;
      unit.lastPosition = { ...unit.position };
    }
  }
}

// Create particles for a unit
function createParticlesForUnit(unit: Unit, count: number): Particle[] {
  const particles: Particle[] = [];
  const unitColor = unit.owner === 0 ? 'oklch(0.65 0.25 240)' : 'oklch(0.62 0.28 25)';
  
  for (let i = 0; i < count; i++) {
    // Position particles in a circle around the unit
    const angle = (i / count) * Math.PI * 2;
    const distance = PARTICLE_ORBIT_DISTANCE;
    
    particles.push({
      id: generateId(),
      position: {
        x: unit.position.x + Math.cos(angle) * distance,
        y: unit.position.y + Math.sin(angle) * distance,
      },
      velocity: { x: 0, y: 0 },
      color: unitColor,
      trail: [], // Initialize empty trail
      angle: angle, // Store initial angle for orbital motion
    });
  }
  
  return particles;
}

// Update unit rotation to smoothly face movement direction
function updateUnitRotation(unit: Unit, direction: Vector2, deltaTime: number): void {
  // Initialize rotation if not set
  if (unit.rotation === undefined) {
    unit.rotation = 0;
  }
  
  // Calculate target rotation from direction vector
  // atan2 gives angle in radians, 0 = right, PI/2 = down, PI = left, -PI/2 = up
  const targetRotation = Math.atan2(direction.y, direction.x);
  
  // Calculate shortest rotation difference (handles wrap-around)
  let rotationDiff = targetRotation - unit.rotation;
  
  // Normalize to [-PI, PI] range
  while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
  while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
  
  // Apply rotation with speed limit
  const maxRotation = ROTATION_SPEED * deltaTime;
  if (Math.abs(rotationDiff) < maxRotation) {
    unit.rotation = targetRotation;
  } else {
    unit.rotation += Math.sign(rotationDiff) * maxRotation;
  }
  
  // Normalize rotation to [0, 2*PI] range for consistency
  unit.rotation = ((unit.rotation % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
}

// Apply smooth acceleration/deceleration to unit movement
function applyMovementAcceleration(unit: Unit, direction: Vector2, targetSpeed: number, deltaTime: number): number {
  // Initialize current speed if not set
  if (unit.currentSpeed === undefined) {
    unit.currentSpeed = 0;
  }
  
  // Calculate speed change based on whether we're accelerating or decelerating
  const speedDiff = targetSpeed - unit.currentSpeed;
  
  if (speedDiff > 0) {
    // Accelerating
    const acceleration = Math.min(ACCELERATION_RATE * deltaTime, speedDiff);
    unit.currentSpeed += acceleration;
  } else if (speedDiff < 0) {
    // Decelerating
    const deceleration = Math.max(-DECELERATION_RATE * deltaTime, speedDiff);
    unit.currentSpeed += deceleration;
  }
  
  // Clamp to zero if very slow
  if (unit.currentSpeed < MIN_SPEED_THRESHOLD) {
    unit.currentSpeed = 0;
  }
  
  return unit.currentSpeed;
}

// Update particle physics
function updateParticles(unit: Unit, deltaTime: number): void {
  if (!unit.particles || unit.particles.length === 0) return;
  
  unit.particles.forEach((particle) => {
    // Store current position in trail
    particle.trail.unshift({ ...particle.position });
    if (particle.trail.length > PARTICLE_TRAIL_LENGTH) {
      particle.trail.pop();
    }
    
    // Calculate attraction force towards unit
    const toUnit = subtract(unit.position, particle.position);
    const dist = distance(particle.position, unit.position);
    
    // Apply force that's stronger when farther from desired orbit distance
    const desiredDist = PARTICLE_ORBIT_DISTANCE;
    const distError = dist - desiredDist;
    
    // Normalize direction and apply force proportional to distance error
    if (dist > PARTICLE_MIN_SPEED_THRESHOLD) {
      const direction = normalize(toUnit);
      const force = scale(direction, distError * PARTICLE_ATTRACTION_STRENGTH);
      
      // Update velocity with force
      particle.velocity.x += force.x * deltaTime;
      particle.velocity.y += force.y * deltaTime;
    }
    
    // Add orbital/swirling motion component
    // Update particle angle to create circular motion around unit
    particle.angle += PARTICLE_ORBITAL_SPEED * deltaTime;
    
    // Calculate tangential velocity for orbital motion
    const tangentX = -Math.sin(particle.angle);
    const tangentY = Math.cos(particle.angle);
    
    // Add orbital velocity component using dedicated orbital force
    particle.velocity.x += tangentX * PARTICLE_ORBITAL_FORCE * deltaTime;
    particle.velocity.y += tangentY * PARTICLE_ORBITAL_FORCE * deltaTime;
    
    // Apply damping to prevent excessive velocity
    particle.velocity.x *= PARTICLE_DAMPING;
    particle.velocity.y *= PARTICLE_DAMPING;
    
    // Ensure minimum velocity magnitude for constant motion
    const currentSpeed = Math.hypot(particle.velocity.x, particle.velocity.y);
    if (currentSpeed < PARTICLE_MIN_VELOCITY && currentSpeed > PARTICLE_MIN_SPEED_THRESHOLD) {
      const scale = PARTICLE_MIN_VELOCITY / currentSpeed;
      particle.velocity.x *= scale;
      particle.velocity.y *= scale;
    } else if (currentSpeed < PARTICLE_MIN_SPEED_THRESHOLD) {
      // If particle is nearly stationary, give it a random velocity
      const randomAngle = Math.random() * Math.PI * 2;
      particle.velocity.x = Math.cos(randomAngle) * PARTICLE_MIN_VELOCITY;
      particle.velocity.y = Math.sin(randomAngle) * PARTICLE_MIN_VELOCITY;
    }
    
    // Update position based on velocity
    particle.position.x += particle.velocity.x * deltaTime;
    particle.position.y += particle.velocity.y * deltaTime;
  });
}

// Create a projectile for ranged attacks
function createProjectile(state: GameState, sourceUnit: Unit, target: Vector2, targetUnit?: Unit): Projectile {
  const direction = normalize(subtract(target, sourceUnit.position));
  const def = UNIT_DEFINITIONS[sourceUnit.type];
  const damage = def.attackDamage * sourceUnit.damageMultiplier;
  const color = state.players[sourceUnit.owner].color;
  
  // Acquire projectile from pool and initialize it
  const projectile = projectilePool.acquire();
  projectile.id = generateId();
  projectile.position.x = sourceUnit.position.x;
  projectile.position.y = sourceUnit.position.y;
  projectile.velocity = scale(direction, PROJECTILE_SPEED);
  projectile.target = target;
  projectile.damage = damage;
  projectile.owner = sourceUnit.owner;
  projectile.color = color;
  projectile.lifetime = PROJECTILE_LIFETIME;
  projectile.createdAt = Date.now();
  projectile.sourceUnit = sourceUnit.id;
  projectile.targetUnit = targetUnit?.id;
  
  return projectile;
}

// Create an impact effect
function createImpactEffect(state: GameState, position: Vector2, color: string, size: number = 1): void {
  if (!state.impactEffects) {
    state.impactEffects = [];
  }
  
  state.impactEffects.push({
    id: generateId(),
    position: { ...position },
    color,
    startTime: Date.now(),
    duration: IMPACT_EFFECT_DURATION,
    size,
  });
  
  // Clean up old effects
  const now = Date.now();
  state.impactEffects = state.impactEffects.filter((effect) => {
    const age = (now - effect.startTime) / 1000;
    return age < IMPACT_EFFECT_CLEANUP_TIME;
  });
}

// Create a floating damage number
function createDamageNumber(state: GameState, position: Vector2, damage: number, color: string): void {
  if (!state.damageNumbers) {
    state.damageNumbers = [];
  }
  
  state.damageNumbers.push({
    id: generateId(),
    position: { ...position },
    damage: Math.round(damage),
    color,
    startTime: Date.now(),
    duration: DAMAGE_NUMBER_DURATION,
  });
  
  // Clean up old damage numbers
  const now = Date.now();
  state.damageNumbers = state.damageNumbers.filter((num) => {
    const age = (now - num.startTime) / 1000;
    return age < DAMAGE_NUMBER_CLEANUP_TIME;
  });
}

// Create screen shake effect
function createScreenShake(state: GameState, intensity: number, duration: number): void {
  // Only create new shake if current shake is weaker or expired
  if (!state.screenShake || state.screenShake.intensity < intensity) {
    state.screenShake = {
      intensity,
      duration,
      startTime: Date.now(),
    };
  }
}

// Particle color constants for explosion effects
const BRIGHT_BLUE_SPARK = 'oklch(0.85 0.25 240)';
const BRIGHT_RED_SPARK = 'oklch(0.85 0.28 25)';

// Create explosion particles for unit death
function createExplosionParticles(state: GameState, position: Vector2, color: string, count: number = 12): void {
  if (!state.explosionParticles) {
    state.explosionParticles = [];
  }
  
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 8 + Math.random() * 4;
    state.explosionParticles.push({
      id: generateId(),
      position: { ...position },
      velocity: {
        x: Math.cos(angle) * speed,
        y: Math.sin(angle) * speed,
      },
      color,
      size: 0.2 + Math.random() * 0.3,
      lifetime: 0.6 + Math.random() * 0.4,
      createdAt: now,
      alpha: 1.0,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 8,
    });
  }
  
  // Add some colored sparks for variety
  const sparkCount = Math.floor(count / 2);
  const brightColor = color === 'oklch(0.65 0.25 240)' ? BRIGHT_BLUE_SPARK : BRIGHT_RED_SPARK;
  for (let i = 0; i < sparkCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 12 + Math.random() * 8;
    state.explosionParticles.push({
      id: generateId(),
      position: { ...position },
      velocity: {
        x: Math.cos(angle) * speed,
        y: Math.sin(angle) * speed,
      },
      color: brightColor,
      size: 0.15 + Math.random() * 0.15,
      lifetime: 0.4 + Math.random() * 0.3,
      createdAt: now,
      alpha: 1.0,
      rotation: 0,
      rotationSpeed: 0,
    });
  }
  
  // Clean up old particles
  state.explosionParticles = state.explosionParticles.filter((particle) => {
    const age = (now - particle.createdAt) / 1000;
    return age < particle.lifetime;
  });
}

// Update explosion particles
function updateExplosionParticles(state: GameState, deltaTime: number): void {
  if (!state.explosionParticles) return;
  
  const now = Date.now();
  state.explosionParticles.forEach((particle) => {
    // Update position
    particle.position.x += particle.velocity.x * deltaTime;
    particle.position.y += particle.velocity.y * deltaTime;
    
    // Apply gravity/deceleration
    particle.velocity.x *= 0.96;
    particle.velocity.y *= 0.96;
    
    // Update rotation
    if (particle.rotation !== undefined && particle.rotationSpeed !== undefined) {
      particle.rotation += particle.rotationSpeed * deltaTime;
    }
    
    // Update alpha based on lifetime
    const age = (now - particle.createdAt) / 1000;
    particle.alpha = Math.max(0, 1 - age / particle.lifetime);
  });
  
  // Remove dead particles
  state.explosionParticles = state.explosionParticles.filter((particle) => {
    const age = (now - particle.createdAt) / 1000;
    return age < particle.lifetime;
  });
}

// Create energy pulse effect
function createEnergyPulse(state: GameState, position: Vector2, color: string, maxRadius: number, duration: number = 0.8): void {
  if (!state.energyPulses) {
    state.energyPulses = [];
  }
  
  state.energyPulses.push({
    id: generateId(),
    position: { ...position },
    radius: 0,
    color,
    startTime: Date.now(),
    duration,
    maxRadius,
  });
}

// Update energy pulses
function updateEnergyPulses(state: GameState): void {
  if (!state.energyPulses) return;
  
  const now = Date.now();
  state.energyPulses.forEach((pulse) => {
    const age = (now - pulse.startTime) / 1000;
    const progress = age / pulse.duration;
    pulse.radius = pulse.maxRadius * progress;
  });
  
  // Remove expired pulses
  state.energyPulses = state.energyPulses.filter((pulse) => {
    const age = (now - pulse.startTime) / 1000;
    return age < pulse.duration;
  });
}

// Create spawn effect for units
function createSpawnEffect(state: GameState, position: Vector2, color: string): void {
  if (!state.spawnEffects) {
    state.spawnEffects = [];
  }
  
  state.spawnEffects.push({
    id: generateId(),
    position: { ...position },
    color,
    startTime: Date.now(),
    duration: 0.6,
  });
  
  // Clean up old effects
  const now = Date.now();
  state.spawnEffects = state.spawnEffects.filter((effect) => {
    const age = (now - effect.startTime) / 1000;
    return age < effect.duration;
  });
}

// Create hit spark effects
function createHitSparks(state: GameState, position: Vector2, color: string, count: number = 6): void {
  if (!state.hitSparks) {
    state.hitSparks = [];
  }
  
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 4;
    state.hitSparks.push({
      id: generateId(),
      position: { ...position },
      velocity: {
        x: Math.cos(angle) * speed,
        y: Math.sin(angle) * speed,
      },
      color,
      size: 0.1 + Math.random() * 0.1,
      lifetime: 0.3 + Math.random() * 0.2,
      createdAt: now,
    });
  }
  
  // Clean up old sparks
  state.hitSparks = state.hitSparks.filter((spark) => {
    const age = (now - spark.createdAt) / 1000;
    return age < spark.lifetime;
  });
}

// Update hit sparks
function updateHitSparks(state: GameState, deltaTime: number): void {
  if (!state.hitSparks) return;
  
  const now = Date.now();
  state.hitSparks.forEach((spark) => {
    // Update position
    spark.position.x += spark.velocity.x * deltaTime;
    spark.position.y += spark.velocity.y * deltaTime;
    
    // Apply deceleration
    spark.velocity.x *= 0.92;
    spark.velocity.y *= 0.92;
  });
  
  // Remove dead sparks
  state.hitSparks = state.hitSparks.filter((spark) => {
    const age = (now - spark.createdAt) / 1000;
    return age < spark.lifetime;
  });
}

// Update motion trails for fast units
function updateMotionTrails(state: GameState): void {
  if (!state.motionTrails) {
    state.motionTrails = [];
  }
  
  const now = Date.now();
  
  // Update trails for each unit
  state.units.forEach((unit) => {
    // Only create trails for fast units (scout, interceptor, snaker)
    if (unit.type !== 'scout' && unit.type !== 'interceptor' && unit.type !== 'snaker') {
      return;
    }
    
    // Check if unit is moving
    const isMoving = unit.commandQueue.length > 0;
    if (!isMoving) return;
    
    let trail = state.motionTrails?.find(t => t.unitId === unit.id);
    if (!trail) {
      trail = {
        unitId: unit.id,
        positions: [],
        color: state.players[unit.owner].color,
      };
      state.motionTrails!.push(trail);
    }
    
    // Add current position
    trail.positions.push({
      pos: { ...unit.position },
      timestamp: now,
    });
    
    // Remove old positions
    trail.positions = trail.positions.filter(p => (now - p.timestamp) / 1000 < MOTION_TRAIL_DURATION);
  });
  
  // Clean up trails for dead units
  const unitIds = new Set(state.units.map(u => u.id));
  state.motionTrails = state.motionTrails.filter(t => unitIds.has(t.unitId));
}

// Update projectiles - movement and collision
function updateProjectiles(state: GameState, deltaTime: number): void {
  const now = Date.now();
  
  // Update positions
  state.projectiles.forEach((projectile) => {
    projectile.position.x += projectile.velocity.x * deltaTime;
    projectile.position.y += projectile.velocity.y * deltaTime;
  });
  
  // Check collisions and remove hit projectiles
  const projectilesToRemove = new Set<string>();
  
  state.projectiles.forEach((projectile) => {
    // Check if projectile reached target or expired
    const distToTarget = distance(projectile.position, projectile.target);
    const age = (now - projectile.createdAt) / 1000;
    
    if (distToTarget < 0.5 || age > projectile.lifetime) {
      // Hit target or expired
      if (distToTarget < 0.5) {
        // Create impact effect
        createImpactEffect(state, projectile.position, projectile.color, 0.8);
        
        // Apply damage if target still exists
        if (projectile.targetUnit) {
          const target = state.units.find((u) => u.id === projectile.targetUnit);
          if (target && target.hp > 0) {
            const def = UNIT_DEFINITIONS[target.type];
            const finalDamage = calculateDamageWithArmor(projectile.damage, target.armor, false, def.modifiers);
            target.hp -= finalDamage;
            createDamageNumber(state, projectile.position, finalDamage, projectile.color);
            createHitSparks(state, projectile.position, projectile.color, 6);
            
            if (state.matchStats && projectile.owner === 0) {
              state.matchStats.damageDealtByPlayer += finalDamage;
            }
          }
        } else {
          // Check for any unit hit in the area - only hit the first one found
          const enemies = state.units.filter((u) => u.owner !== projectile.owner && u.hp > 0);
          let hitEnemy = false;
          
          for (const enemy of enemies) {
            if (distance(enemy.position, projectile.position) < UNIT_SIZE_METERS / 2) {
              const def = UNIT_DEFINITIONS[enemy.type];
              const finalDamage = calculateDamageWithArmor(projectile.damage, enemy.armor, false, def.modifiers);
              enemy.hp -= finalDamage;
              createDamageNumber(state, projectile.position, finalDamage, projectile.color);
              createHitSparks(state, projectile.position, projectile.color, 6);
              
              if (state.matchStats && projectile.owner === 0) {
                state.matchStats.damageDealtByPlayer += finalDamage;
              }
              hitEnemy = true;
              break; // Only hit one unit
            }
          }
          
          // Only check bases if no unit was hit
          if (!hitEnemy) {
            const enemyBases = state.bases.filter((b) => b.owner !== projectile.owner);
            for (const base of enemyBases) {
              if (distance(base.position, projectile.position) < BASE_SIZE_METERS / 2) {
                // Check if base has active shield (mobile faction)
                if (!base.shieldActive || Date.now() >= base.shieldActive.endTime) {
                  const finalDamage = calculateDamageWithArmor(projectile.damage, base.armor, false);
                  base.hp -= finalDamage;
                  createHitSparks(state, projectile.position, projectile.color, 8);
                  
                  if (state.matchStats) {
                    if (base.owner === 0) {
                      state.matchStats.damageToPlayerBase += finalDamage;
                    } else {
                      state.matchStats.damageToEnemyBase += finalDamage;
                    }
                    
                    if (projectile.owner === 0) {
                      state.matchStats.damageDealtByPlayer += finalDamage;
                    }
                  }
                } else {
                  // Shield blocked the damage - create visual feedback
                  createHitSparks(state, projectile.position, state.players[base.owner].color, 12);
                }
                break; // Only hit one base
              }
            }
          }
        }
      }
      
      projectilesToRemove.add(projectile.id);
    }
  });
  
  // Remove collided/expired projectiles and return them to pool
  const remainingProjectiles: Projectile[] = [];
  const removedProjectiles: Projectile[] = [];
  
  state.projectiles.forEach((p) => {
    if (projectilesToRemove.has(p.id)) {
      removedProjectiles.push(p);
    } else {
      remainingProjectiles.push(p);
    }
  });
  
  // Return removed projectiles to pool
  projectilePool.releaseAll(removedProjectiles);
  state.projectiles = remainingProjectiles;
}

export function updateGame(state: GameState, deltaTime: number): void {
  if (state.mode !== 'game') return;

  state.elapsedTime += deltaTime;

  updateIncome(state, deltaTime);
  updateUnits(state, deltaTime);
  updateBases(state, deltaTime);
  updateProjectiles(state, deltaTime);
  updateCombat(state, deltaTime);
  cleanupDeadUnits(state); // Clean up dead units after combat
  cleanupDyingUnits(state); // Clean up dying units after animation completes
  updateExplosionParticles(state, deltaTime);
  updateEnergyPulses(state);
  updateHitSparks(state, deltaTime);
  updateMotionTrails(state);
  checkTimeLimit(state);
  checkVictory(state);
}

function updateIncome(state: GameState, deltaTime: number): void {
  const elapsedSeconds = Math.floor(state.elapsedTime);
  const newIncomeRate = Math.floor(elapsedSeconds / 10) + 1;

  state.players.forEach((player) => {
    player.incomeRate = newIncomeRate;
  });

  state.lastIncomeTime += deltaTime;
  if (state.lastIncomeTime >= 1.0) {
    state.lastIncomeTime -= 1.0;
    state.players.forEach((player, index) => {
      player.photons += player.incomeRate;
      if (index === 0) {
        soundManager.playIncomeTick();
      }
    });
  }
}

// Avoidance constants
const AVOIDANCE_DETECTION_RANGE = 2.0; // Range to detect approaching friendly units
const AVOIDANCE_MOVE_DISTANCE = 1.5; // Distance to temporarily move aside
const AVOIDANCE_RETURN_DELAY = 1.0; // Seconds to wait before returning to original position

function updateUnits(state: GameState, deltaTime: number): void {
  // First pass: detect stationary units that should move aside for moving units
  state.units.forEach((stationaryUnit) => {
    // Skip units that are already moving or have been marked to avoid
    if (stationaryUnit.commandQueue.length > 0) return;
    if (stationaryUnit.temporaryAvoidance) {
      // Check if it's time to return to original position
      if (Date.now() >= stationaryUnit.temporaryAvoidance.returnTime) {
        // Return to original position
        stationaryUnit.commandQueue.push({
          type: 'move',
          position: stationaryUnit.temporaryAvoidance.originalPosition
        });
        stationaryUnit.temporaryAvoidance = undefined;
      }
      return;
    }
    
    // Check for approaching friendly units
    for (const movingUnit of state.units) {
      // Skip self, different teams, or non-moving units
      if (movingUnit.id === stationaryUnit.id) continue;
      if (movingUnit.owner !== stationaryUnit.owner) continue;
      if (movingUnit.commandQueue.length === 0) continue;
      
      // Get moving unit's target
      const targetNode = movingUnit.commandQueue[0];
      if (targetNode.type !== 'move' && targetNode.type !== 'attack-move' && targetNode.type !== 'patrol') continue;
      
      // Check if moving unit is approaching stationary unit
      const distToStationary = distance(movingUnit.position, stationaryUnit.position);
      if (distToStationary > AVOIDANCE_DETECTION_RANGE) continue;
      
      // Check if moving unit is moving towards stationary unit
      const movementDirection = normalize(subtract(targetNode.position, movingUnit.position));
      const toStationary = normalize(subtract(stationaryUnit.position, movingUnit.position));
      const dotProduct = movementDirection.x * toStationary.x + movementDirection.y * toStationary.y;
      
      // If dot product > 0.5, moving unit is heading towards stationary unit
      if (dotProduct > 0.5) {
        // Move stationary unit aside perpendicular to movement direction
        const perpendicular = { x: -movementDirection.y, y: movementDirection.x };
        const avoidancePos = add(stationaryUnit.position, scale(perpendicular, AVOIDANCE_MOVE_DISTANCE));
        
        // Check if avoidance position is valid (not in obstacle)
        if (!checkObstacleCollision(avoidancePos, UNIT_SIZE_METERS / 2, state.obstacles)) {
          // Store original position and schedule return
          stationaryUnit.temporaryAvoidance = {
            originalPosition: { ...stationaryUnit.position },
            returnTime: Date.now() + AVOIDANCE_RETURN_DELAY * 1000
          };
          
          // Add temporary move command
          stationaryUnit.commandQueue.push({
            type: 'move',
            position: avoidancePos
          });
          break; // Only avoid once per update
        }
      }
    }
  });
  
  // Second pass: update all units normally
  state.units.forEach((unit) => {
    // Clean up faded command queues that have been marked for cancellation
    if (unit.queueFadeStartTime) {
      const fadeElapsed = (Date.now() - unit.queueFadeStartTime) / 1000;
      if (fadeElapsed >= QUEUE_FADE_DURATION) {
        // Fade complete - clear the queue and reset stuck state
        unit.commandQueue = [];
        unit.stuckTimer = 0;
        unit.lastPosition = undefined;
        unit.currentSpeed = 0;
        unit.queueFadeStartTime = undefined;
      }
    }
    
    if (unit.abilityCooldown > 0) {
      unit.abilityCooldown = Math.max(0, unit.abilityCooldown - deltaTime);
    }

    // Smoothly interpolate display health towards actual health
    if (unit.displayHp === undefined) {
      unit.displayHp = unit.hp;
    } else {
      const healthDiff = unit.hp - unit.displayHp;
      // Fast interpolation for smooth health bar updates (20% per frame)
      unit.displayHp += healthDiff * 0.2;
      // Snap to actual health if very close
      if (Math.abs(healthDiff) < 0.5) {
        unit.displayHp = unit.hp;
      }
    }

    updateAbilityEffects(unit, state, deltaTime);
    
    // Update particle physics for all units
    updateParticles(unit, deltaTime);
    
    // Clean up expired melee attack effects
    if (unit.meleeAttackEffect && Date.now() > unit.meleeAttackEffect.endTime) {
      unit.meleeAttackEffect = undefined;
    }

    if (unit.lineJumpTelegraph) {
      const elapsed = Date.now() - unit.lineJumpTelegraph.startTime;
      if (elapsed >= 500) {
        executeLineJump(state, unit);
        unit.lineJumpTelegraph = undefined;
      }
      return;
    }

    if (unit.commandQueue.length === 0) {
      // Reset stuck timer when no commands
      unit.stuckTimer = 0;
      unit.lastPosition = undefined;
      return;
    }

    const currentNode = unit.commandQueue[0];

    if (currentNode.type === 'move') {
      const dist = distance(unit.position, currentNode.position);
      const def = UNIT_DEFINITIONS[unit.type];

      if (dist < 0.1) {
        unit.commandQueue.shift();
        // Decelerate when reaching destination
        unit.currentSpeed = 0;
        // Reset stuck timer on successful completion
        unit.stuckTimer = 0;
        unit.lastPosition = undefined;
        return;
      }

      const direction = normalize(subtract(currentNode.position, unit.position));
      
      // Update unit rotation to face movement direction
      updateUnitRotation(unit, direction, deltaTime);
      
      // Apply smooth acceleration to reach target speed
      const currentSpeed = applyMovementAcceleration(unit, direction, def.moveSpeed, deltaTime);
      const movement = scale(direction, currentSpeed * deltaTime);

      const moveDist = Math.min(distance(unit.position, add(unit.position, movement)), dist);
      const newPosition = add(unit.position, scale(direction, moveDist));
      
      // Check for collisions with sliding for friendly units
      const collisionResult = checkUnitCollisionWithSliding(unit, newPosition, state.units, state.obstacles);
      
      if (!collisionResult.blocked) {
        // Use alternative position if sliding found a path, otherwise use desired position
        unit.position = collisionResult.alternativePosition || newPosition;
        
        // Reset stuck timer - unit is making progress
        unit.stuckTimer = 0;
        unit.lastPosition = { ...unit.position };
      } else {
        // Collision detected - slow down
        unit.currentSpeed = Math.max(0, (unit.currentSpeed || 0) * COLLISION_DECELERATION_FACTOR);
        
        // Track stuck state
        updateStuckDetection(unit, deltaTime);
        return;
      }

      const queueMovementNodes = unit.commandQueue.filter((n) => n.type === 'move').length;
      const creditMultiplier = 1.0 + QUEUE_BONUS_PER_NODE * queueMovementNodes;
      unit.distanceCredit += moveDist * creditMultiplier;

      while (unit.distanceCredit >= PROMOTION_DISTANCE_THRESHOLD) {
        unit.distanceCredit -= PROMOTION_DISTANCE_THRESHOLD;
        unit.damageMultiplier *= PROMOTION_MULTIPLIER;
      }

      unit.distanceTraveled += moveDist;
    } else if (currentNode.type === 'attack-move') {
      // Attack-move: move towards position but attack any enemies in range
      const def = UNIT_DEFINITIONS[unit.type];
      
      // Check for enemies in attack range
      let targetEnemy: Unit | null = null;
      let minDist = Infinity;
      
      state.units.forEach((enemy) => {
        if (enemy.owner !== unit.owner && enemy.hp > 0) {
          const enemyDef = UNIT_DEFINITIONS[enemy.type];
          // Flying units can only be hit by ability attacks, not normal attacks
          if (enemyDef.modifiers.includes('flying')) {
            return; // Skip flying units for normal attacks
          }
          
          const dist = distance(unit.position, enemy.position);
          if (dist <= def.attackRange && dist < minDist) {
            targetEnemy = enemy;
            minDist = dist;
          }
        }
      });
      
      // If enemy in range, attack it
      if (targetEnemy && (!unit.attackCooldown || unit.attackCooldown <= 0)) {
        performAttack(state, unit, targetEnemy);
        unit.attackCooldown = 1 / def.attackRate;
      }
      
      // Continue moving towards destination
      const dist = distance(unit.position, currentNode.position);
      if (dist < 0.1) {
        unit.commandQueue.shift();
        unit.currentSpeed = 0;
        return;
      }

      const direction = normalize(subtract(currentNode.position, unit.position));

      // Update unit rotation to face movement direction
      updateUnitRotation(unit, direction, deltaTime);
      
      // Apply smooth acceleration
      const currentSpeed = applyMovementAcceleration(unit, direction, def.moveSpeed, deltaTime);
      const movement = scale(direction, currentSpeed * deltaTime);

      const moveDist = Math.min(distance(unit.position, add(unit.position, movement)), dist);
      const newPosition = add(unit.position, scale(direction, moveDist));
      
      // Check for collisions with sliding for friendly units
      const collisionResult = checkUnitCollisionWithSliding(unit, newPosition, state.units, state.obstacles);
      
      if (!collisionResult.blocked) {
        // Use alternative position if sliding found a path
        unit.position = collisionResult.alternativePosition || newPosition;
        // Reset stuck timer
        unit.stuckTimer = 0;
        unit.lastPosition = { ...unit.position };
      } else {
        // Collision detected - slow down
        unit.currentSpeed = Math.max(0, (unit.currentSpeed || 0) * COLLISION_DECELERATION_FACTOR);
        
        // Track stuck state
        updateStuckDetection(unit, deltaTime);
        return;
      }

      const queueMovementNodes = unit.commandQueue.filter((n) => n.type === 'move' || n.type === 'attack-move').length;
      const creditMultiplier = 1.0 + QUEUE_BONUS_PER_NODE * queueMovementNodes;
      unit.distanceCredit += moveDist * creditMultiplier;

      while (unit.distanceCredit >= PROMOTION_DISTANCE_THRESHOLD) {
        unit.distanceCredit -= PROMOTION_DISTANCE_THRESHOLD;
        unit.damageMultiplier *= PROMOTION_MULTIPLIER;
      }

      unit.distanceTraveled += moveDist;
    } else if (currentNode.type === 'ability') {
      const dist = distance(unit.position, currentNode.position);
      if (dist > 0.1) {
        const def = UNIT_DEFINITIONS[unit.type];
        const direction = normalize(subtract(currentNode.position, unit.position));
        const movement = scale(direction, def.moveSpeed * deltaTime);
        
        // Update unit rotation to face movement direction
        updateUnitRotation(unit, direction, deltaTime);
        
        unit.position = add(unit.position, movement);

        const queueMovementNodes = unit.commandQueue.filter((n) => n.type === 'move').length;
        const creditMultiplier = 1.0 + QUEUE_BONUS_PER_NODE * queueMovementNodes;
        const moveDist = Math.min(distance({ x: 0, y: 0 }, movement), dist);
        unit.distanceCredit += moveDist * creditMultiplier;

        while (unit.distanceCredit >= PROMOTION_DISTANCE_THRESHOLD) {
          unit.distanceCredit -= PROMOTION_DISTANCE_THRESHOLD;
          unit.damageMultiplier *= PROMOTION_MULTIPLIER;
        }

        unit.distanceTraveled += moveDist;
      } else {
        executeAbility(state, unit, currentNode);
        unit.commandQueue.shift();
      }
    } else if (currentNode.type === 'patrol') {
      // Patrol: move to patrol point, then add return command to create loop
      const dist = distance(unit.position, currentNode.position);
      if (dist < 0.1) {
        // Reached patrol point - add return command and remove current
        unit.commandQueue.shift();
        // Add return patrol command if queue isn't full
        if (unit.commandQueue.length < QUEUE_MAX_LENGTH) {
          unit.commandQueue.push({ 
            type: 'patrol', 
            position: currentNode.returnPosition,
            returnPosition: currentNode.position 
          });
        }
        return;
      }

      const def = UNIT_DEFINITIONS[unit.type];
      const direction = normalize(subtract(currentNode.position, unit.position));
      const movement = scale(direction, def.moveSpeed * deltaTime);
      
      // Update unit rotation to face movement direction
      updateUnitRotation(unit, direction, deltaTime);
      
      const moveDist = Math.min(distance(unit.position, add(unit.position, movement)), dist);
      const newPosition = add(unit.position, scale(direction, moveDist));
      
      // Check for collisions with sliding for friendly units
      const collisionResult = checkUnitCollisionWithSliding(unit, newPosition, state.units, state.obstacles);
      
      if (!collisionResult.blocked) {
        unit.position = collisionResult.alternativePosition || newPosition;
        // Reset stuck timer
        unit.stuckTimer = 0;
        unit.lastPosition = { ...unit.position };
      } else {
        // Track stuck state
        updateStuckDetection(unit, deltaTime);
        return;
      }

      // Track distance traveled
      const queueMovementNodes = unit.commandQueue.filter((n) => 
        n.type === 'move' || n.type === 'attack-move' || n.type === 'patrol'
      ).length;
      const creditMultiplier = 1.0 + QUEUE_BONUS_PER_NODE * queueMovementNodes;
      unit.distanceCredit += moveDist * creditMultiplier;

      while (unit.distanceCredit >= PROMOTION_DISTANCE_THRESHOLD) {
        unit.distanceCredit -= PROMOTION_DISTANCE_THRESHOLD;
        unit.damageMultiplier *= PROMOTION_MULTIPLIER;
      }

      unit.distanceTraveled += moveDist;
    }
  });
}

function updateAbilityEffects(unit: Unit, state: GameState, deltaTime: number): void {
  const now = Date.now();

  if (unit.shieldActive && now > unit.shieldActive.endTime) {
    unit.shieldActive = undefined;
  }

  if (unit.cloaked && now > unit.cloaked.endTime) {
    unit.cloaked = undefined;
  }

  if (unit.bombardmentActive) {
    if (now > unit.bombardmentActive.impactTime && now < unit.bombardmentActive.endTime) {
      const enemies = state.units.filter((u) => u.owner !== unit.owner);
      enemies.forEach((enemy) => {
        if (distance(enemy.position, unit.bombardmentActive!.targetPos) <= 3) {
          let damage = 40 * unit.damageMultiplier * deltaTime;
          const def = UNIT_DEFINITIONS[enemy.type];
          
          // Small units take double damage from splash attacks
          if (def.modifiers.includes('small')) {
            damage *= 2;
          }
          
          // Bombardment is a ranged attack, so it respects armor
          const finalDamage = calculateDamageWithArmor(damage, enemy.armor, false, def.modifiers);
          enemy.hp -= finalDamage;
          
          if (state.matchStats && unit.owner === 0) {
            state.matchStats.damageDealtByPlayer += finalDamage;
          }
        }
      });

      const enemyBases = state.bases.filter((b) => b.owner !== unit.owner);
      enemyBases.forEach((base) => {
        if (distance(base.position, unit.bombardmentActive!.targetPos) <= 3) {
          // Check if base has active shield (mobile faction)
          if (!base.shieldActive || Date.now() >= base.shieldActive.endTime) {
            const damage = 80 * unit.damageMultiplier * deltaTime;
            // Bombardment is a ranged attack, so it respects armor
            const finalDamage = calculateDamageWithArmor(damage, base.armor, false);
            base.hp -= finalDamage;
            
            if (state.matchStats && unit.owner === 0) {
              state.matchStats.damageDealtByPlayer += finalDamage;
            }
          }
        }
      });
    }

    if (now > unit.bombardmentActive.endTime) {
      unit.bombardmentActive = undefined;
    }
  }

  if (unit.healPulseActive && now > unit.healPulseActive.endTime) {
    unit.healPulseActive = undefined;
  }

  if (unit.missileBarrageActive) {
    const progress = Math.min(1, (now - (unit.missileBarrageActive.endTime - 1500)) / 1500);
    
    if (progress >= 1) {
      unit.missileBarrageActive.missiles.forEach((missile) => {
        const enemies = state.units.filter((u) => u.owner !== unit.owner);
        const target = enemies.find((e) => distance(e.position, missile.target) < 0.5);
        if (target) {
          const def = UNIT_DEFINITIONS[target.type];
          const finalDamage = calculateDamageWithArmor(missile.damage, target.armor, false, def.modifiers);
          target.hp -= finalDamage;
          
          if (state.matchStats && unit.owner === 0) {
            state.matchStats.damageDealtByPlayer += finalDamage;
          }
        }
      });
      unit.missileBarrageActive = undefined;
    }
  }
}

function updateBases(state: GameState, deltaTime: number): void {
  state.bases.forEach((base) => {
    if (base.laserCooldown > 0) {
      base.laserCooldown = Math.max(0, base.laserCooldown - deltaTime);
    }

    // Regeneration logic for support base type
    if (base.baseType === 'support') {
      // Heal nearby friendly units periodically
      const REGEN_RADIUS = 8; // meters
      const REGEN_AMOUNT = 15; // HP per second
      const REGEN_PULSE_INTERVAL = 2; // seconds between visual pulses
      
      // Initialize cooldown if needed
      if (base.autoAttackCooldown === undefined) {
        base.autoAttackCooldown = 0;
      }
      
      if (base.autoAttackCooldown > 0) {
        base.autoAttackCooldown = Math.max(0, base.autoAttackCooldown - deltaTime);
      }
      
      // Continuous healing
      state.units.forEach((unit) => {
        if (unit.owner === base.owner) {
          const dist = distance(base.position, unit.position);
          if (dist <= REGEN_RADIUS && unit.hp < unit.maxHp) {
            unit.hp = Math.min(unit.maxHp, unit.hp + REGEN_AMOUNT * deltaTime);
          }
        }
      });
      
      // Heal self
      if (base.hp < base.maxHp) {
        base.hp = Math.min(base.maxHp, base.hp + REGEN_AMOUNT * deltaTime * 0.5); // Half rate for self
      }
      
      // Create visual pulse effect
      if (base.autoAttackCooldown === 0) {
        base.regenerationPulse = {
          endTime: Date.now() + 500, // 0.5 second pulse duration
          radius: REGEN_RADIUS,
        };
        base.autoAttackCooldown = REGEN_PULSE_INTERVAL;
      }
    }

    // Auto-attack logic for defense base type
    if (base.baseType === 'defense') {
      const baseTypeDef = BASE_TYPE_DEFINITIONS[base.baseType];
      if (baseTypeDef.autoAttack) {
        // Update auto-attack cooldown
        if (base.autoAttackCooldown === undefined) {
          base.autoAttackCooldown = 0;
        }
        
        if (base.autoAttackCooldown > 0) {
          base.autoAttackCooldown = Math.max(0, base.autoAttackCooldown - deltaTime);
        }

        // Find closest enemy unit or base within range
        if (base.autoAttackCooldown === 0) {
          type TargetInfo = { position: Vector2; isUnit: boolean; id: string };
          let closestTarget: TargetInfo | null = null;
          let closestDist = Infinity;

          // Check enemy units
          state.units.forEach((unit) => {
            if (unit.owner !== base.owner) {
              const dist = distance(base.position, unit.position);
              if (dist <= baseTypeDef.autoAttack!.range && dist < closestDist) {
                closestDist = dist;
                closestTarget = { position: unit.position, isUnit: true, id: unit.id };
              }
            }
          });

          // Check enemy bases
          state.bases.forEach((targetBase) => {
            if (targetBase.owner !== base.owner) {
              const dist = distance(base.position, targetBase.position);
              if (dist <= baseTypeDef.autoAttack!.range && dist < closestDist) {
                closestDist = dist;
                closestTarget = { position: targetBase.position, isUnit: false, id: targetBase.id };
              }
            }
          });

          // Fire at closest target
          if (closestTarget !== null) {
            const direction = normalize(subtract(closestTarget.position, base.position));
            const projectile = projectilePool.acquire();
            projectile.position = { ...base.position };
            projectile.velocity = scale(direction, PROJECTILE_SPEED);
            projectile.target = { ...closestTarget.position };
            projectile.damage = baseTypeDef.autoAttack!.damage;
            projectile.owner = base.owner;
            projectile.color = state.players[base.owner].color;
            projectile.lifetime = PROJECTILE_LIFETIME;
            projectile.createdAt = Date.now();
            projectile.sourceUnit = base.id;
            if (closestTarget.isUnit) {
              projectile.targetUnit = closestTarget.id;
            }
            state.projectiles.push(projectile);

            // Set cooldown
            base.autoAttackCooldown = 1 / baseTypeDef.autoAttack!.attackRate;
          }
        }
      }
    }

    if (!base.movementTarget) {
      // Deactivate shield when not moving (for mobile faction)
      if (base.shieldActive) {
        base.shieldActive = undefined;
      }
      return;
    }

    const dist = distance(base.position, base.movementTarget);
    if (dist < 0.1) {
      base.movementTarget = null;
      // Deactivate shield when movement completes
      if (base.shieldActive) {
        base.shieldActive = undefined;
      }
      return;
    }

    // Get base type definition for movement speed
    const baseTypeDef = BASE_TYPE_DEFINITIONS[base.baseType];
    if (!baseTypeDef.canMove) {
      // Stationary base cannot move
      base.movementTarget = null;
      return;
    }

    // Activate shield for assault base when moving
    if (base.baseType === 'assault' && !base.shieldActive) {
      base.shieldActive = { endTime: Date.now() + 10000 }; // Shield lasts while moving
    }

    const direction = normalize(subtract(base.movementTarget, base.position));
    // Use baseTypeDef moveSpeed if > 0, otherwise use faction baseMoveSpeed
    const moveSpeed = baseTypeDef.moveSpeed > 0 ? baseTypeDef.moveSpeed : FACTION_DEFINITIONS[base.faction].baseMoveSpeed;
    const movement = scale(direction, moveSpeed * deltaTime);
    base.position = add(base.position, movement);
    
    // Update shield endTime to keep it active while moving (assault base)
    if (base.shieldActive) {
      base.shieldActive.endTime = Date.now() + 100; // Keep extending while moving
    }
  });
}

function executeAbility(state: GameState, unit: Unit, node: CommandNode): void {
  if (node.type !== 'ability') return;
  if (unit.abilityCooldown > 0) return;

  const def = UNIT_DEFINITIONS[unit.type];

  soundManager.playAbility();

  // Execute generic laser ability for all units
  executeGenericLaser(state, unit, node.direction);
  unit.abilityCooldown = def.abilityCooldown;
  
  // Keep existing specific abilities as additional effects
  if (unit.type === 'marine') {
    createAbilityEffect(state, unit, node.position, 'burst-fire');
    executeBurstFire(state, unit, node.direction);
  } else if (unit.type === 'warrior') {
    createAbilityEffect(state, unit, node.position, 'execute-dash');
    executeExecuteDash(state, unit, node.position);
  } else if (unit.type === 'snaker') {
    createAbilityEffect(state, unit, node.position, 'line-jump');
    unit.lineJumpTelegraph = {
      startTime: Date.now(),
      endPos: add(unit.position, scale(normalize(node.direction), Math.min(distance({ x: 0, y: 0 }, node.direction), 10))),
      direction: normalize(node.direction),
    };
  } else if (unit.type === 'tank') {
    createAbilityEffect(state, unit, node.position, 'shield-dome');
    executeShieldDome(state, unit);
  } else if (unit.type === 'scout') {
    createAbilityEffect(state, unit, node.position, 'cloak');
    executeCloak(state, unit);
  } else if (unit.type === 'artillery') {
    createAbilityEffect(state, unit, node.position, 'bombardment');
    executeArtilleryBombardment(state, unit, node.position);
  } else if (unit.type === 'medic') {
    createAbilityEffect(state, unit, node.position, 'heal-pulse');
    executeHealPulse(state, unit);
  } else if (unit.type === 'interceptor') {
    createAbilityEffect(state, unit, node.position, 'missile-barrage');
    executeMissileBarrage(state, unit, node.direction);
  } else if (unit.type === 'marksman') {
    createAbilityEffect(state, unit, node.position, 'precision-shot');
    executePrecisionShot(state, unit, node.direction);
  } else if (unit.type === 'engineer') {
    createAbilityEffect(state, unit, node.position, 'deploy-turret');
    executeDeployTurret(state, unit, node.position);
  } else if (unit.type === 'skirmisher') {
    createAbilityEffect(state, unit, node.position, 'rapid-retreat');
    executeRapidRetreat(state, unit, node.direction);
  } else if (unit.type === 'paladin') {
    createAbilityEffect(state, unit, node.position, 'holy-strike');
    executeHolyStrike(state, unit, node.direction);
  } else if (unit.type === 'gladiator') {
    createAbilityEffect(state, unit, node.position, 'lethal-strike');
    executeLethalStrike(state, unit, node.direction);
  } else if (unit.type === 'ravager') {
    createAbilityEffect(state, unit, node.position, 'blood-hunt');
    executeBloodHunt(state, unit);
  } else if (unit.type === 'warlord') {
    createAbilityEffect(state, unit, node.position, 'battle-cry');
    executeBattleCry(state, unit);
  } else if (unit.type === 'duelist') {
    createAbilityEffect(state, unit, node.position, 'riposte');
    executeRiposte(state, unit);
  } else if (unit.type === 'voidwalker') {
    createAbilityEffect(state, unit, node.position, 'void-step');
    executeVoidStep(state, unit, node.position);
  } else if (unit.type === 'chronomancer') {
    createAbilityEffect(state, unit, node.position, 'time-dilation');
    executeTimeDilation(state, unit);
  } else if (unit.type === 'nebula') {
    createAbilityEffect(state, unit, node.position, 'cosmic-barrier');
    executeCosmicBarrier(state, unit, node.position);
  } else if (unit.type === 'quasar') {
    createAbilityEffect(state, unit, node.position, 'stellar-convergence');
    executeStellarConvergence(state, unit, node.position);
  } else if (unit.type === 'berserker') {
    createAbilityEffect(state, unit, node.position, 'rage');
    executeRage(state, unit);
  } else if (unit.type === 'assassin') {
    createAbilityEffect(state, unit, node.position, 'shadow-strike');
    executeShadowStrike(state, unit, node.position);
  } else if (unit.type === 'juggernaut') {
    createAbilityEffect(state, unit, node.position, 'ground-slam');
    executeGroundSlam(state, unit);
  } else if (unit.type === 'striker') {
    createAbilityEffect(state, unit, node.position, 'whirlwind');
    executeWhirlwind(state, unit);
  } else if (unit.type === 'flare') {
    createAbilityEffect(state, unit, node.position, 'solar-beam');
    executeSolarBeam(state, unit, node.direction);
  } else if (unit.type === 'nova') {
    createAbilityEffect(state, unit, node.position, 'stellar-burst');
    executeStellarBurst(state, unit);
  } else if (unit.type === 'eclipse') {
    createAbilityEffect(state, unit, node.position, 'shadow-veil');
    executeShadowVeil(state, unit);
  } else if (unit.type === 'corona') {
    createAbilityEffect(state, unit, node.position, 'radiation-wave');
    executeRadiationWave(state, unit, node.direction);
  } else if (unit.type === 'supernova') {
    createAbilityEffect(state, unit, node.position, 'cosmic-explosion');
    executeCosmicExplosion(state, unit, node.position);
  } else if (unit.type === 'guardian') {
    createAbilityEffect(state, unit, node.position, 'protect-allies');
    executeProtectAllies(state, unit);
  } else if (unit.type === 'reaper') {
    createAbilityEffect(state, unit, node.position, 'soul-strike');
    executeSoulStrike(state, unit, node.direction);
  } else if (unit.type === 'oracle') {
    createAbilityEffect(state, unit, node.position, 'divine-restoration');
    executeDivineRestoration(state, unit);
  } else if (unit.type === 'harbinger') {
    createAbilityEffect(state, unit, node.position, 'ethereal-strike');
    executeEtherealStrike(state, unit, node.direction);
  } else if (unit.type === 'zenith') {
    createAbilityEffect(state, unit, node.position, 'solar-blessing');
    executeSolarBlessing(state, unit);
  } else if (unit.type === 'pulsar') {
    createAbilityEffect(state, unit, node.position, 'stellar-dive');
    executeStellarDive(state, unit, node.position);
  } else if (unit.type === 'celestial') {
    createAbilityEffect(state, unit, node.position, 'astral-charge');
    executeAstralCharge(state, unit, node.position);
  }
}

function executeGenericLaser(state: GameState, unit: Unit, direction: { x: number; y: number }): void {
  // Calculate laser range based on the drag distance
  const dragDistance = distance({ x: 0, y: 0 }, direction);
  const laserRange = Math.min(dragDistance, ABILITY_MAX_RANGE);
  
  const dir = normalize(direction);
  
  // Store laser beam for visual effect
  unit.laserBeam = {
    endTime: Date.now() + ABILITY_LASER_DURATION,
    direction: { ...dir },
    range: laserRange
  };
  
  // Create laser particle effects
  const laserColor = state.players[unit.owner].color;
  createLaserParticles(state, unit.position, dir, laserRange, laserColor);
  
  // Deal damage to enemies hit by the laser
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  const enemyBases = state.bases.filter((b) => b.owner !== unit.owner);
  
  const damage = ABILITY_LASER_DAMAGE * unit.damageMultiplier;
  const laserWidthHalf = ABILITY_LASER_WIDTH / 2;
  
  // Check units in the laser path (using perpendicular distance from laser line)
  enemies.forEach((enemy) => {
    const toEnemy = subtract(enemy.position, unit.position);
    const projectedDist = toEnemy.x * dir.x + toEnemy.y * dir.y;
    const perpDist = Math.abs(toEnemy.x * dir.y - toEnemy.y * dir.x); // 2D cross product for perpendicular distance
    
    if (projectedDist > 0 && projectedDist < laserRange && perpDist < laserWidthHalf) {
      enemy.hp -= damage;
      createHitSparks(state, enemy.position, laserColor, 6);
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += damage;
      }
    }
  });
  
  // Check bases in the laser path
  enemyBases.forEach((base) => {
    const toBase = subtract(base.position, unit.position);
    const projectedDist = toBase.x * dir.x + toBase.y * dir.y;
    const perpDist = Math.abs(toBase.x * dir.y - toBase.y * dir.x);
    
    const baseRadius = BASE_SIZE_METERS / 2;
    if (projectedDist > 0 && projectedDist < laserRange && perpDist < laserWidthHalf + baseRadius) {
      const baseDamage = damage * ABILITY_LASER_BASE_DAMAGE_MULTIPLIER;
      base.hp -= baseDamage;
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += baseDamage;
      }
    }
  });
}

function executeBurstFire(state: GameState, unit: Unit, direction: { x: number; y: number }): void {
  const def = UNIT_DEFINITIONS.marine;
  const shotDamage = 2 * unit.damageMultiplier;
  const maxRange = def.attackRange;

  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  const enemyBases = state.bases.filter((b) => b.owner !== unit.owner);

  const dir = normalize(direction);

  for (let i = 0; i < 10; i++) {
    let hitTarget: Unit | Base | null = null;
    let minDist = Infinity;

    enemies.forEach((enemy) => {
      const toEnemy = subtract(enemy.position, unit.position);
      const dist = distance(unit.position, enemy.position);
      if (dist > maxRange) return;

      const projectedDist = toEnemy.x * dir.x + toEnemy.y * dir.y;
      const perpDist = Math.abs(toEnemy.x * dir.y - toEnemy.y * dir.x);

      if (projectedDist > 0 && perpDist < UNIT_SIZE_METERS / 2 && dist < minDist) {
        minDist = dist;
        hitTarget = enemy;
      }
    });

    if (hitTarget) {
      (hitTarget as Unit).hp -= shotDamage;
      
      // Create hit spark effect
      createHitSparks(state, hitTarget.position, state.players[unit.owner].color, 4);
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += shotDamage;
      }
    }
  }
}

function executeExecuteDash(state: GameState, unit: Unit, targetPos: { x: number; y: number }): void {
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  const nearbyEnemies = enemies.filter((e) => distance(e.position, targetPos) <= 2);

  if (nearbyEnemies.length === 0) return;

  let nearest = nearbyEnemies[0];
  let minDist = distance(unit.position, nearest.position);

  nearbyEnemies.forEach((enemy) => {
    const dist = distance(unit.position, enemy.position);
    if (dist < minDist) {
      minDist = dist;
      nearest = enemy;
    }
  });

  unit.position = { ...nearest.position };
  const def = UNIT_DEFINITIONS.warrior;
  const damage = def.attackDamage * 5 * unit.damageMultiplier;
  nearest.hp -= damage;
  
  // Create impact effect and energy pulse for dash
  createHitSparks(state, nearest.position, state.players[unit.owner].color, 8);
  createEnergyPulse(state, nearest.position, state.players[unit.owner].color, 2.5, 0.4);
  
  if (state.matchStats && unit.owner === 0) {
    state.matchStats.damageDealtByPlayer += damage;
  }
  
  unit.dashExecuting = true;
  setTimeout(() => {
    unit.dashExecuting = false;
  }, 200);
}

function executeLineJump(state: GameState, unit: Unit): void {
  if (!unit.lineJumpTelegraph) return;

  const { endPos, direction } = unit.lineJumpTelegraph;
  const startPos = { ...unit.position };

  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  const hitEnemies = new Set<string>();

  const jumpDist = distance(startPos, endPos);
  const steps = Math.ceil(jumpDist * 10);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const checkPos = {
      x: startPos.x + (endPos.x - startPos.x) * t,
      y: startPos.y + (endPos.y - startPos.y) * t,
    };

    enemies.forEach((enemy) => {
      if (hitEnemies.has(enemy.id)) return;
      if (distance(enemy.position, checkPos) < UNIT_SIZE_METERS) {
        const damage = 20 * unit.damageMultiplier;
        enemy.hp -= damage;
        hitEnemies.add(enemy.id);
        
        if (state.matchStats && unit.owner === 0) {
          state.matchStats.damageDealtByPlayer += damage;
        }
      }
    });
  }

  unit.position = endPos;
}

function executeShieldDome(state: GameState, unit: Unit): void {
  unit.shieldActive = {
    endTime: Date.now() + 5000,
    radius: 4,
  };
}

function executeCloak(state: GameState, unit: Unit): void {
  unit.cloaked = {
    endTime: Date.now() + 6000,
  };
}

function executeArtilleryBombardment(state: GameState, unit: Unit, targetPos: { x: number; y: number }): void {
  unit.bombardmentActive = {
    endTime: Date.now() + 2000,
    targetPos,
    impactTime: Date.now() + 1500,
  };
}

function executeHealPulse(state: GameState, unit: Unit): void {
  const healAmount = 50;
  const healRadius = 5;
  
  unit.healPulseActive = {
    endTime: Date.now() + 1000,
    radius: healRadius,
  };

  const allies = state.units.filter((u) => u.owner === unit.owner);
  allies.forEach((ally) => {
    if (distance(ally.position, unit.position) <= healRadius) {
      ally.hp = Math.min(ally.hp + healAmount, ally.maxHp);
    }
  });

  const allyBases = state.bases.filter((b) => b.owner === unit.owner);
  allyBases.forEach((base) => {
    if (distance(base.position, unit.position) <= healRadius) {
      base.hp = Math.min(base.hp + healAmount * 2, base.maxHp);
    }
  });
}

function executeMissileBarrage(state: GameState, unit: Unit, direction: { x: number; y: number }): void {
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  const dir = normalize(direction);
  
  const missiles: Array<{ position: Vector2; target: Vector2; damage: number }> = [];
  
  const enemiesInDirection = enemies.filter((e) => {
    const toEnemy = subtract(e.position, unit.position);
    const dist = distance(unit.position, e.position);
    if (dist > 12) return false;
    
    const projectedDist = toEnemy.x * dir.x + toEnemy.y * dir.y;
    return projectedDist > 0;
  }).sort((a, b) => distance(unit.position, a.position) - distance(unit.position, b.position));

  for (let i = 0; i < Math.min(6, enemiesInDirection.length); i++) {
    missiles.push({
      position: { ...unit.position },
      target: { ...enemiesInDirection[i].position },
      damage: 15 * unit.damageMultiplier,
    });
  }

  unit.missileBarrageActive = {
    endTime: Date.now() + 1500,
    missiles,
  };
}

// Radiant faction abilities
function executePrecisionShot(state: GameState, unit: Unit, direction: { x: number; y: number }): void {
  const dir = normalize(direction);
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  const enemyBases = state.bases.filter((b) => b.owner !== unit.owner);
  
  let target: Unit | Base | null = null;
  let maxDist = 0;
  
  // Find furthest target in direction
  enemies.forEach((enemy) => {
    const toEnemy = subtract(enemy.position, unit.position);
    const dist = distance(unit.position, enemy.position);
    if (dist > 18) return;
    
    const projectedDist = toEnemy.x * dir.x + toEnemy.y * dir.y;
    const perpDist = Math.abs(toEnemy.x * dir.y - toEnemy.y * dir.x);
    
    if (projectedDist > 0 && perpDist < 1 && dist > maxDist) {
      maxDist = dist;
      target = enemy;
    }
  });
  
  if (target) {
    const damage = 50 * unit.damageMultiplier;
    (target as Unit).hp -= damage;
    createHitSparks(state, target.position, state.players[unit.owner].color, 8);
    createEnergyPulse(state, target.position, state.players[unit.owner].color, 1.5, 0.3);
    
    if (state.matchStats && unit.owner === 0) {
      state.matchStats.damageDealtByPlayer += damage;
    }
  }
}

function executeDeployTurret(state: GameState, unit: Unit, targetPos: { x: number; y: number }): void {
  // Create a temporary stationary unit that acts as a turret
  const turret: Unit = {
    id: `turret-${Date.now()}-${Math.random()}`,
    type: 'scout', // Use scout as base type for turret
    owner: unit.owner,
    position: { ...targetPos },
    hp: 30,
    maxHp: 30,
    armor: 0,
    commandQueue: [],
    damageMultiplier: 0.5,
    distanceTraveled: 0,
    distanceCredit: 0,
    abilityCooldown: 999, // High cooldown to prevent turret from using ability
  };
  
  state.units.push(turret);
  createSpawnEffect(state, targetPos, state.players[unit.owner].color);
  
  // Remove turret after 10 seconds
  setTimeout(() => {
    const index = state.units.findIndex(u => u.id === turret.id);
    if (index !== -1) {
      state.units.splice(index, 1);
    }
  }, 10000);
}

function executeRapidRetreat(state: GameState, unit: Unit, direction: { x: number; y: number }): void {
  const retreatDistance = 8;
  const dir = normalize(direction);
  const retreatPos = {
    x: unit.position.x - dir.x * retreatDistance,
    y: unit.position.y - dir.y * retreatDistance,
  };
  
  unit.position = retreatPos;
  unit.cloaked = {
    endTime: Date.now() + 2000,
  };
  createEnergyPulse(state, retreatPos, state.players[unit.owner].color, 2, 0.3);
}

function executeHolyStrike(state: GameState, unit: Unit, direction: { x: number; y: number }): void {
  const dir = normalize(direction);
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  
  enemies.forEach((enemy) => {
    const toEnemy = subtract(enemy.position, unit.position);
    const dist = distance(unit.position, enemy.position);
    if (dist > 6) return;
    
    const projectedDist = toEnemy.x * dir.x + toEnemy.y * dir.y;
    const perpDist = Math.abs(toEnemy.x * dir.y - toEnemy.y * dir.x);
    
    if (projectedDist > 0 && perpDist < 2) {
      const damage = 40 * unit.damageMultiplier;
      enemy.hp -= damage;
      createHitSparks(state, enemy.position, state.players[unit.owner].color, 6);
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += damage;
      }
    }
  });
}

// Aurum faction abilities
function executeLethalStrike(state: GameState, unit: Unit, direction: { x: number; y: number }): void {
  const dir = normalize(direction);
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  
  let target: Unit | null = null;
  let minDist = Infinity;
  
  enemies.forEach((enemy) => {
    const toEnemy = subtract(enemy.position, unit.position);
    const dist = distance(unit.position, enemy.position);
    if (dist > 3) return;
    
    const projectedDist = toEnemy.x * dir.x + toEnemy.y * dir.y;
    
    if (projectedDist > 0 && dist < minDist) {
      minDist = dist;
      target = enemy;
    }
  });
  
  if (target) {
    // High damage, execution-style ability
    const damage = Math.min(target.hp * 0.5, 100) * unit.damageMultiplier;
    target.hp -= damage;
    createHitSparks(state, target.position, state.players[unit.owner].color, 10);
    createEnergyPulse(state, target.position, state.players[unit.owner].color, 2, 0.5);
    
    if (state.matchStats && unit.owner === 0) {
      state.matchStats.damageDealtByPlayer += damage;
    }
  }
}

function executeBloodHunt(state: GameState, unit: Unit): void {
  // Life steal ability - damage nearby enemies and heal
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  let totalDamage = 0;
  
  enemies.forEach((enemy) => {
    if (distance(unit.position, enemy.position) <= 3) {
      const damage = 15 * unit.damageMultiplier;
      enemy.hp -= damage;
      totalDamage += damage;
      createHitSparks(state, enemy.position, state.players[unit.owner].color, 4);
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += damage;
      }
    }
  });
  
  // Heal for half the damage dealt
  unit.hp = Math.min(unit.hp + totalDamage * 0.5, unit.maxHp);
  createEnergyPulse(state, unit.position, state.players[unit.owner].color, 3, 0.4);
}

function executeBattleCry(state: GameState, unit: Unit): void {
  // Buff nearby allies
  const allies = state.units.filter((u) => u.owner === unit.owner);
  
  allies.forEach((ally) => {
    if (distance(ally.position, unit.position) <= 6) {
      ally.damageMultiplier += 0.5;
      createEnergyPulse(state, ally.position, state.players[unit.owner].color, 2, 0.3);
      
      // Reset buff after 5 seconds
      setTimeout(() => {
        ally.damageMultiplier = Math.max(1, ally.damageMultiplier - 0.5);
      }, 5000);
    }
  });
}

function executeRiposte(state: GameState, unit: Unit): void {
  // Counter-attack ability - briefly invulnerable and damages attackers
  unit.shieldActive = {
    endTime: Date.now() + 2000,
    radius: 2,
  };
  
  // Damage nearby enemies
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  enemies.forEach((enemy) => {
    if (distance(unit.position, enemy.position) <= 2) {
      const damage = 25 * unit.damageMultiplier;
      enemy.hp -= damage;
      createHitSparks(state, enemy.position, state.players[unit.owner].color, 6);
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += damage;
      }
    }
  });
}

// Solari faction abilities
function executeVoidStep(state: GameState, unit: Unit, targetPos: { x: number; y: number }): void {
  // Teleport to location
  const maxRange = 12;
  const actualDistance = distance(unit.position, targetPos);
  
  if (actualDistance <= maxRange) {
    createEnergyPulse(state, unit.position, state.players[unit.owner].color, 3, 0.4);
    unit.position = { ...targetPos };
    createEnergyPulse(state, targetPos, state.players[unit.owner].color, 3, 0.4);
  }
}

function executeTimeDilation(state: GameState, unit: Unit): void {
  // Slow enemies in area
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  
  enemies.forEach((enemy) => {
    if (distance(unit.position, enemy.position) <= 7) {
      const def = UNIT_DEFINITIONS[enemy.type];
      // Temporarily reduce move speed
      enemy.currentSpeed = def.moveSpeed * 0.3;
      
      createEnergyPulse(state, enemy.position, state.players[unit.owner].color, 2, 0.3);
      
      // Restore speed after 4 seconds
      setTimeout(() => {
        enemy.currentSpeed = undefined;
      }, 4000);
    }
  });
}

function executeCosmicBarrier(state: GameState, unit: Unit, targetPos: { x: number; y: number }): void {
  // Create temporary obstacle/barrier effect
  // This is simulated by creating a shield dome at target position
  unit.shieldActive = {
    endTime: Date.now() + 6000,
    radius: 3,
  };
  
  createEnergyPulse(state, targetPos, state.players[unit.owner].color, 3, 0.5);
}

function executeStellarConvergence(state: GameState, unit: Unit, targetPos: { x: number; y: number }): void {
  // Delayed area damage ability
  unit.bombardmentActive = {
    endTime: Date.now() + 3000,
    targetPos,
    impactTime: Date.now() + 2500,
  };
  
  // Deal heavy damage at impact
  setTimeout(() => {
    const enemies = state.units.filter((u) => u.owner !== unit.owner);
    const enemyBases = state.bases.filter((b) => b.owner !== unit.owner);
    
    enemies.forEach((enemy) => {
      if (distance(enemy.position, targetPos) <= 4) {
        const damage = 60 * unit.damageMultiplier;
        enemy.hp -= damage;
        createHitSparks(state, enemy.position, state.players[unit.owner].color, 8);
        
        if (state.matchStats && unit.owner === 0) {
          state.matchStats.damageDealtByPlayer += damage;
        }
      }
    });
    
    enemyBases.forEach((base) => {
      if (distance(base.position, targetPos) <= 4) {
        const baseDamage = 80 * unit.damageMultiplier;
        base.hp -= baseDamage;
        createImpactEffect(state, base.position, state.players[unit.owner].color, 4);
        
        if (state.matchStats && unit.owner === 0) {
          state.matchStats.damageDealtByPlayer += baseDamage;
        }
      }
    });
    
    createEnergyPulse(state, targetPos, state.players[unit.owner].color, 4, 0.8);
  }, 2500);
}

// Berserker - Rage: Temporary damage boost
function executeRage(state: GameState, unit: Unit): void {
  // Store original damage multiplier to reset correctly
  const originalMultiplier = unit.damageMultiplier;
  unit.damageMultiplier += 0.8;
  
  createEnergyPulse(state, unit.position, state.players[unit.owner].color, 2, 0.5);
  createHitSparks(state, unit.position, state.players[unit.owner].color, 10);
  
  // Reset buff after 6 seconds
  setTimeout(() => {
    unit.damageMultiplier = originalMultiplier;
  }, 6000);
}

// Assassin - Shadow Strike: Teleport to nearby enemy and deal high damage
function executeShadowStrike(state: GameState, unit: Unit, targetPos: { x: number; y: number }): void {
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  const nearbyEnemies = enemies.filter((e) => distance(e.position, targetPos) <= 3);
  
  if (nearbyEnemies.length === 0) return;
  
  let nearest = nearbyEnemies[0];
  let minDist = distance(unit.position, nearest.position);
  
  nearbyEnemies.forEach((enemy) => {
    const dist = distance(unit.position, enemy.position);
    if (dist < minDist) {
      minDist = dist;
      nearest = enemy;
    }
  });
  
  createEnergyPulse(state, unit.position, state.players[unit.owner].color, 2, 0.3);
  
  // Position assassin next to target, not on top of it
  const direction = normalize(subtract(nearest.position, unit.position));
  unit.position = {
    x: nearest.position.x - direction.x * 1.2,
    y: nearest.position.y - direction.y * 1.2,
  };
  
  const damage = 45 * unit.damageMultiplier;
  nearest.hp -= damage;
  
  createHitSparks(state, nearest.position, state.players[unit.owner].color, 8);
  createEnergyPulse(state, nearest.position, state.players[unit.owner].color, 2, 0.4);
  
  if (state.matchStats && unit.owner === 0) {
    state.matchStats.damageDealtByPlayer += damage;
  }
  
  // Brief cloak after strike
  unit.cloaked = {
    endTime: Date.now() + 1500,
  };
}

// Juggernaut - Ground Slam: Area of effect damage and stun
function executeGroundSlam(state: GameState, unit: Unit): void {
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  
  enemies.forEach((enemy) => {
    if (distance(unit.position, enemy.position) <= 4) {
      const damage = 35 * unit.damageMultiplier;
      enemy.hp -= damage;
      createHitSparks(state, enemy.position, state.players[unit.owner].color, 6);
      
      // Slow enemy temporarily - store original speed to restore properly
      const def = UNIT_DEFINITIONS[enemy.type];
      const originalSpeed = enemy.currentSpeed;
      enemy.currentSpeed = def.moveSpeed * 0.2;
      
      setTimeout(() => {
        enemy.currentSpeed = originalSpeed;
      }, 3000);
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += damage;
      }
    }
  });
  
  createEnergyPulse(state, unit.position, state.players[unit.owner].color, 4, 0.7);
  createScreenFlash(state, state.players[unit.owner].color, 0.3, 0.2);
}

// Striker - Whirlwind: Spin attack hitting all nearby enemies
function executeWhirlwind(state: GameState, unit: Unit): void {
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  
  enemies.forEach((enemy) => {
    if (distance(unit.position, enemy.position) <= 3) {
      const damage = 30 * unit.damageMultiplier;
      enemy.hp -= damage;
      createHitSparks(state, enemy.position, state.players[unit.owner].color, 5);
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += damage;
      }
    }
  });
  
  // Create spinning energy pulse effect
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      createEnergyPulse(state, unit.position, state.players[unit.owner].color, 3, 0.4);
    }, i * 200);
  }
}

// Flare - Solar Beam: Focused beam dealing sustained damage
function executeSolarBeam(state: GameState, unit: Unit, direction: { x: number; y: number }): void {
  const dir = normalize(direction);
  const beamRange = 7;
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  const enemyBases = state.bases.filter((b) => b.owner !== unit.owner);
  
  const damage = 35 * unit.damageMultiplier;
  const beamWidthHalf = 0.3;
  
  // Check units in beam path
  enemies.forEach((enemy) => {
    const toEnemy = subtract(enemy.position, unit.position);
    const projectedDist = toEnemy.x * dir.x + toEnemy.y * dir.y;
    const perpDist = Math.abs(toEnemy.x * dir.y - toEnemy.y * dir.x);
    
    if (projectedDist > 0 && projectedDist < beamRange && perpDist < beamWidthHalf) {
      enemy.hp -= damage;
      createHitSparks(state, enemy.position, state.players[unit.owner].color, 6);
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += damage;
      }
    }
  });
  
  // Check bases in beam path
  enemyBases.forEach((base) => {
    const toBase = subtract(base.position, unit.position);
    const projectedDist = toBase.x * dir.x + toBase.y * dir.y;
    const perpDist = Math.abs(toBase.x * dir.y - toBase.y * dir.x);
    
    const baseRadius = BASE_SIZE_METERS / 2;
    if (projectedDist > 0 && projectedDist < beamRange && perpDist < beamWidthHalf + baseRadius) {
      const baseDamage = damage * 0.5;
      base.hp -= baseDamage;
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += baseDamage;
      }
    }
  });
  
  createLaserParticles(state, unit.position, dir, beamRange, state.players[unit.owner].color);
}

// Nova - Stellar Burst: Explode dealing damage around the unit
function executeStellarBurst(state: GameState, unit: Unit): void {
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  
  enemies.forEach((enemy) => {
    if (distance(unit.position, enemy.position) <= 3.5) {
      const damage = 40 * unit.damageMultiplier;
      enemy.hp -= damage;
      createHitSparks(state, enemy.position, state.players[unit.owner].color, 7);
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += damage;
      }
    }
  });
  
  createEnergyPulse(state, unit.position, state.players[unit.owner].color, 3.5, 0.6);
  createScreenFlash(state, state.players[unit.owner].color, 0.2, 0.15);
}

// Eclipse - Shadow Veil: Cloak self and nearby allies
function executeShadowVeil(state: GameState, unit: Unit): void {
  const allies = state.units.filter((u) => u.owner === unit.owner);
  
  allies.forEach((ally) => {
    if (distance(ally.position, unit.position) <= 6) {
      ally.cloaked = {
        endTime: Date.now() + 5000,
      };
      createEnergyPulse(state, ally.position, state.players[unit.owner].color, 2, 0.3);
    }
  });
}

// Corona - Radiation Wave: Forward cone of damaging radiation
function executeRadiationWave(state: GameState, unit: Unit, direction: { x: number; y: number }): void {
  const dir = normalize(direction);
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  
  enemies.forEach((enemy) => {
    const toEnemy = subtract(enemy.position, unit.position);
    const dist = distance(unit.position, enemy.position);
    if (dist > 7) return;
    
    const projectedDist = toEnemy.x * dir.x + toEnemy.y * dir.y;
    const perpDist = Math.abs(toEnemy.x * dir.y - toEnemy.y * dir.x);
    
    // Cone shape: perpendicular distance proportional to forward distance
    if (projectedDist > 0 && perpDist < projectedDist * 0.5 + 1) {
      const damage = 32 * unit.damageMultiplier;
      enemy.hp -= damage;
      createHitSparks(state, enemy.position, state.players[unit.owner].color, 6);
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += damage;
      }
    }
  });
  
  createEnergyPulse(state, unit.position, state.players[unit.owner].color, 3, 0.5);
}

// Supernova - Cosmic Explosion: Massive delayed explosion at target location
function executeCosmicExplosion(state: GameState, unit: Unit, targetPos: { x: number; y: number }): void {
  const EXPLOSION_DELAY = 2000; // milliseconds
  const EXPLOSION_DURATION = 2500; // milliseconds
  
  unit.bombardmentActive = {
    endTime: Date.now() + EXPLOSION_DURATION,
    targetPos,
    impactTime: Date.now() + EXPLOSION_DELAY,
  };
  
  setTimeout(() => {
    const enemies = state.units.filter((u) => u.owner !== unit.owner);
    const enemyBases = state.bases.filter((b) => b.owner !== unit.owner);
    
    enemies.forEach((enemy) => {
      if (distance(enemy.position, targetPos) <= 5) {
        const damage = 70 * unit.damageMultiplier;
        enemy.hp -= damage;
        createHitSparks(state, enemy.position, state.players[unit.owner].color, 10);
        
        if (state.matchStats && unit.owner === 0) {
          state.matchStats.damageDealtByPlayer += damage;
        }
      }
    });
    
    enemyBases.forEach((base) => {
      if (distance(base.position, targetPos) <= 5) {
        const baseDamage = 100 * unit.damageMultiplier;
        base.hp -= baseDamage;
        createImpactEffect(state, base.position, state.players[unit.owner].color, 5);
        
        if (state.matchStats && unit.owner === 0) {
          state.matchStats.damageDealtByPlayer += baseDamage;
        }
      }
    });
    
    createEnergyPulse(state, targetPos, state.players[unit.owner].color, 5, 1.0);
    createScreenFlash(state, state.players[unit.owner].color, 0.4, 0.3);
  }, EXPLOSION_DELAY);
}

// Guardian - Protect Allies: Grant temporary shield to nearby allies
function executeProtectAllies(state: GameState, unit: Unit): void {
  const allies = state.units.filter((u) => u.owner === unit.owner);
  
  allies.forEach((ally) => {
    if (distance(ally.position, unit.position) <= 5) {
      ally.shieldActive = {
        endTime: Date.now() + 6000,
        radius: 3,
      };
      createEnergyPulse(state, ally.position, state.players[unit.owner].color, 2, 0.3);
    }
  });
  
  createEnergyPulse(state, unit.position, state.players[unit.owner].color, 5, 0.5);
}

// Reaper - Soul Strike: Drain life from enemies in direction
function executeSoulStrike(state: GameState, unit: Unit, direction: { x: number; y: number }): void {
  const dir = normalize(direction);
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  let totalDamage = 0;
  
  enemies.forEach((enemy) => {
    const toEnemy = subtract(enemy.position, unit.position);
    const dist = distance(unit.position, enemy.position);
    if (dist > 9) return;
    
    const projectedDist = toEnemy.x * dir.x + toEnemy.y * dir.y;
    const perpDist = Math.abs(toEnemy.x * dir.y - toEnemy.y * dir.x);
    
    if (projectedDist > 0 && perpDist < 1.5) {
      const damage = 25 * unit.damageMultiplier;
      enemy.hp -= damage;
      totalDamage += damage;
      createHitSparks(state, enemy.position, state.players[unit.owner].color, 6);
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += damage;
      }
    }
  });
  
  // Heal for portion of damage dealt
  unit.hp = Math.min(unit.hp + totalDamage * 0.4, unit.maxHp);
  createEnergyPulse(state, unit.position, state.players[unit.owner].color, 2.5, 0.4);
}

// Oracle - Divine Restoration: Powerful area heal for allies
function executeDivineRestoration(state: GameState, unit: Unit): void {
  const healAmount = 80;
  const healRadius = 6;
  
  unit.healPulseActive = {
    endTime: Date.now() + 1500,
    radius: healRadius,
  };
  
  const allies = state.units.filter((u) => u.owner === unit.owner);
  allies.forEach((ally) => {
    if (distance(ally.position, unit.position) <= healRadius) {
      ally.hp = Math.min(ally.hp + healAmount, ally.maxHp);
      createEnergyPulse(state, ally.position, state.players[unit.owner].color, 2, 0.3);
    }
  });
  
  const allyBases = state.bases.filter((b) => b.owner === unit.owner);
  allyBases.forEach((base) => {
    if (distance(base.position, unit.position) <= healRadius) {
      base.hp = Math.min(base.hp + healAmount * 2, base.maxHp);
    }
  });
  
  createEnergyPulse(state, unit.position, state.players[unit.owner].color, 6, 0.6);
}

// Harbinger - Ethereal Strike: Phase through enemies dealing damage
function executeEtherealStrike(state: GameState, unit: Unit, direction: { x: number; y: number }): void {
  const dir = normalize(direction);
  const dashDistance = 8;
  const dashPos = {
    x: unit.position.x + dir.x * dashDistance,
    y: unit.position.y + dir.y * dashDistance,
  };
  
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  
  // Damage all enemies along the path
  enemies.forEach((enemy) => {
    const toEnemy = subtract(enemy.position, unit.position);
    const projectedDist = toEnemy.x * dir.x + toEnemy.y * dir.y;
    const perpDist = Math.abs(toEnemy.x * dir.y - toEnemy.y * dir.x);
    
    if (projectedDist > 0 && projectedDist < dashDistance && perpDist < 1.5) {
      const damage = 28 * unit.damageMultiplier;
      enemy.hp -= damage;
      createHitSparks(state, enemy.position, state.players[unit.owner].color, 6);
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += damage;
      }
    }
  });
  
  createEnergyPulse(state, unit.position, state.players[unit.owner].color, 2, 0.3);
  unit.position = dashPos;
  createEnergyPulse(state, dashPos, state.players[unit.owner].color, 2, 0.3);
}

// Zenith - Solar Blessing: Heal and boost nearby allies
function executeSolarBlessing(state: GameState, unit: Unit): void {
  const healAmount = 60;
  const healRadius = 5.5;
  
  unit.healPulseActive = {
    endTime: Date.now() + 1200,
    radius: healRadius,
  };
  
  const allies = state.units.filter((u) => u.owner === unit.owner);
  allies.forEach((ally) => {
    if (distance(ally.position, unit.position) <= healRadius) {
      ally.hp = Math.min(ally.hp + healAmount, ally.maxHp);
      // Small damage boost - store original to reset correctly
      const originalMultiplier = ally.damageMultiplier;
      ally.damageMultiplier += 0.2;
      createEnergyPulse(state, ally.position, state.players[unit.owner].color, 2, 0.3);
      
      setTimeout(() => {
        ally.damageMultiplier = originalMultiplier;
      }, 4000);
    }
  });
  
  const allyBases = state.bases.filter((b) => b.owner === unit.owner);
  allyBases.forEach((base) => {
    if (distance(base.position, unit.position) <= healRadius) {
      base.hp = Math.min(base.hp + healAmount * 1.5, base.maxHp);
    }
  });
  
  createEnergyPulse(state, unit.position, state.players[unit.owner].color, 5.5, 0.5);
}

// Pulsar - Stellar Dive: Rapid dive attack at target location
function executeStellarDive(state: GameState, unit: Unit, targetPos: { x: number; y: number }): void {
  const maxRange = 10;
  const actualDistance = distance(unit.position, targetPos);
  
  if (actualDistance <= maxRange) {
    createEnergyPulse(state, unit.position, state.players[unit.owner].color, 2, 0.3);
    
    // Damage enemies near target
    const enemies = state.units.filter((u) => u.owner !== unit.owner);
    enemies.forEach((enemy) => {
      if (distance(enemy.position, targetPos) <= 2.5) {
        const damage = 35 * unit.damageMultiplier;
        enemy.hp -= damage;
        createHitSparks(state, enemy.position, state.players[unit.owner].color, 6);
        
        if (state.matchStats && unit.owner === 0) {
          state.matchStats.damageDealtByPlayer += damage;
        }
      }
    });
    
    unit.position = { ...targetPos };
    createEnergyPulse(state, targetPos, state.players[unit.owner].color, 2.5, 0.5);
  }
}

// Celestial - Astral Charge: Charge forward damaging enemies
function executeAstralCharge(state: GameState, unit: Unit, targetPos: { x: number; y: number }): void {
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  const direction = normalize(subtract(targetPos, unit.position));
  const chargeDistance = Math.min(distance(unit.position, targetPos), 8);
  
  const newPos = {
    x: unit.position.x + direction.x * chargeDistance,
    y: unit.position.y + direction.y * chargeDistance,
  };
  
  // Damage enemies along the path
  enemies.forEach((enemy) => {
    const toEnemy = subtract(enemy.position, unit.position);
    const projectedDist = toEnemy.x * direction.x + toEnemy.y * direction.y;
    const perpDist = Math.abs(toEnemy.x * direction.y - toEnemy.y * direction.x);
    
    if (projectedDist > 0 && projectedDist < chargeDistance && perpDist < 1.5) {
      const damage = 38 * unit.damageMultiplier;
      enemy.hp -= damage;
      createHitSparks(state, enemy.position, state.players[unit.owner].color, 7);
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += damage;
      }
    }
  });
  
  createEnergyPulse(state, unit.position, state.players[unit.owner].color, 2, 0.3);
  unit.position = newPos;
  createEnergyPulse(state, newPos, state.players[unit.owner].color, 2, 0.4);
}

function updateCombat(state: GameState, deltaTime: number): void {
  state.units.forEach((unit) => {
    const def = UNIT_DEFINITIONS[unit.type];
    if (def.attackType === 'none') return;

    // Update attack cooldown
    if (unit.attackCooldown === undefined) {
      unit.attackCooldown = 0;
    }
    
    if (unit.attackCooldown > 0) {
      unit.attackCooldown -= deltaTime;
      return;
    }

    // Find target
    const enemies = state.units.filter((u) => {
      if (u.owner === unit.owner || u.cloaked) return false;
      
      const enemyDef = UNIT_DEFINITIONS[u.type];
      // Flying units can only be hit by ability attacks, not normal attacks
      if (enemyDef.modifiers.includes('flying')) {
        return false;
      }
      
      return true;
    });
    const enemyBases = state.bases.filter((b) => b.owner !== unit.owner);

    let target: Unit | Base | null = null;
    let minDist = Infinity;

    enemies.forEach((enemy) => {
      const dist = distance(unit.position, enemy.position);
      if (dist <= def.attackRange && dist < minDist) {
        minDist = dist;
        target = enemy;
      }
    });

    if (!target && def.canDamageStructures) {
      enemyBases.forEach((base) => {
        const dist = distance(unit.position, base.position);
        const baseRadius = BASE_SIZE_METERS / 2;
        if (dist <= def.attackRange + baseRadius && dist < minDist) {
          minDist = dist;
          target = base;
        }
      });
    }

    if (target) {
      performAttack(state, unit, target);
    }
  });
}

// Helper function to perform an attack
function performAttack(state: GameState, unit: Unit, target: Unit | Base): void {
  const def = UNIT_DEFINITIONS[unit.type];
  
  // Reset attack cooldown
  unit.attackCooldown = 1.0 / def.attackRate;
  
  // Update rotation to face target
  const direction = normalize(subtract(target.position, unit.position));
  const targetRotation = Math.atan2(direction.y, direction.x);
  unit.rotation = targetRotation;
  
  if (def.attackType === 'ranged') {
    // Spawn projectile for ranged attacks
    const targetPos = target.position;
    const targetUnit = 'type' in target ? (target as Unit) : undefined;
    const projectile = createProjectile(state, unit, targetPos, targetUnit);
    state.projectiles.push(projectile);
    
    // Create muzzle flash effect for visual feedback
    const color = state.players[unit.owner].color;
    createHitSparks(state, unit.position, color, 3);
    
    if (unit.owner === 0 && Math.random() < 0.3) {
      soundManager.playAttack();
    }
  } else if (def.attackType === 'melee') {
    // Apply instant damage for melee and create visual effect
    let damage = def.attackDamage * unit.damageMultiplier;

    if ('type' in target) {
      const targetUnit = target as Unit;
      
      if (targetUnit.shieldActive) {
        const allies = state.units.filter((u) => 
          u.owner === targetUnit.owner && 
          u.shieldActive && 
          distance(u.position, targetUnit.position) <= u.shieldActive.radius
        );
        if (allies.length > 0) {
          damage *= 0.3;
        }
      }

      targetUnit.hp -= damage;
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += damage;
      }
      
      // Create melee attack visual effect
      unit.meleeAttackEffect = {
        endTime: Date.now() + MELEE_EFFECT_DURATION * 1000,
        targetPos: { ...targetUnit.position },
      };
    } else {
      const targetBase = target as Base;
      // Check if base has active shield (mobile faction)
      if (!targetBase.shieldActive || Date.now() >= targetBase.shieldActive.endTime) {
        const prevHp = targetBase.hp;
        targetBase.hp -= damage;
        
        // Create impact effect and screen shake for base damage
        if (prevHp > 0 && targetBase.hp < prevHp) {
          const color = state.players[unit.owner].color;
          createImpactEffect(state, targetBase.position, color, 2.5);
          // Stronger shake for base damage (scales with damage)
          createScreenShake(state, Math.min(damage / SCREEN_SHAKE_BASE_DAMAGE, SCREEN_SHAKE_MAX_INTENSITY), SCREEN_SHAKE_DURATION_MEDIUM);
        }
        
        if (state.matchStats) {
          if (targetBase.owner === 0) {
            state.matchStats.damageToPlayerBase += damage;
          } else {
            state.matchStats.damageToEnemyBase += damage;
          }
          
          if (unit.owner === 0) {
            state.matchStats.damageDealtByPlayer += damage;
          }
        }
      } else {
        // Shield blocked the damage - create visual feedback
        createHitSparks(state, targetBase.position, state.players[targetBase.owner].color, 12);
      }
      
      // Create melee attack visual effect
      unit.meleeAttackEffect = {
        endTime: Date.now() + MELEE_EFFECT_DURATION * 1000,
        targetPos: { ...targetBase.position },
      };
    }
    
    if (unit.owner === 0 && Math.random() < 0.3) {
      soundManager.playAttack();
    }
  }
}

function cleanupDeadUnits(state: GameState): void {
  
  const oldUnits = [...state.units];
  
  // Count units by owner before filtering
  const unitsByOwner = oldUnits.reduce((acc, u) => {
    acc[u.owner] = (acc[u.owner] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  
  // Identify dead units and move them to dyingUnits array for queue animation
  const deadUnits = oldUnits.filter(u => u.hp <= 0);
  if (deadUnits.length > 0) {
    // Initialize dyingUnits array if it doesn't exist
    if (!state.dyingUnits) {
      state.dyingUnits = [];
    }
    
    deadUnits.forEach(u => {
      // Trigger reverse un-draw animation if unit has queued commands
      if (u.commandQueue.length > 0) {
        u.queueDrawStartTime = Date.now();
        u.queueDrawReverse = true;
        state.dyingUnits!.push(u);
      }
    });
  }
  
  state.units = state.units.filter((u) => u.hp > 0);
  
  // Create impact effects for dead units and screen shake for multiple deaths
  if (deadUnits.length > 0) {
    deadUnits.forEach(u => {
      const color = state.players[u.owner].color;
      createImpactEffect(state, u.position, color, 1.2);
      // Enhanced death explosion with multiple layers
      createEnhancedDeathExplosion(state, u.position, color, 1.0);
      soundManager.playUnitDeath();
    });
    
    // Shake screen if multiple units died at once
    if (deadUnits.length >= SCREEN_SHAKE_MULTI_KILL_THRESHOLD) {
      createScreenShake(state, deadUnits.length * SCREEN_SHAKE_MULTI_KILL_MULTIPLIER, SCREEN_SHAKE_DURATION_SHORT);
    }
  }
  
  if (state.matchStats) {
    const afterUnitsByOwner = state.units.reduce((acc, u) => {
      acc[u.owner] = (acc[u.owner] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);
    
    const enemyUnitsKilled = (unitsByOwner[1] || 0) - (afterUnitsByOwner[1] || 0);
    state.matchStats.unitsKilledByPlayer += enemyUnitsKilled;
  }
}

function cleanupDyingUnits(state: GameState): void {
  // Remove dying units whose queue un-draw animation has completed
  if (state.dyingUnits && state.dyingUnits.length > 0) {
    state.dyingUnits = state.dyingUnits.filter(unit => {
      if (unit.queueDrawStartTime && unit.queueDrawReverse) {
        const elapsed = (Date.now() - unit.queueDrawStartTime) / 1000;
        // Keep unit until animation completes
        return elapsed < QUEUE_UNDRAW_DURATION;
      }
      // Remove unit if no animation is running
      return false;
    });
  }
}

function checkVictory(state: GameState): void {
  state.bases.forEach((base) => {
    if (base.hp <= 0) {
      soundManager.playBaseDestroyed();
      // Big screen shake for base destruction
      createScreenShake(state, SCREEN_SHAKE_BASE_DESTROY_INTENSITY, SCREEN_SHAKE_DURATION_LONG);
      // Screen flash effect for dramatic impact
      const flashColor = base.owner === 0 ? 'oklch(0.62 0.28 25 / 0.7)' : 'oklch(0.65 0.25 240 / 0.7)';
      createScreenFlash(state, flashColor, 0.7, 0.6);
      // Big impact effect for base destruction with enhanced explosion
      const color = state.players[base.owner === 0 ? 1 : 0].color; // Use attacker's color
      createImpactEffect(state, base.position, color, 4.0);
      createEnhancedDeathExplosion(state, base.position, color, 2.5); // Much larger explosion for bases
      state.winner = base.owner === 0 ? 1 : 0;
      state.mode = 'victory';
    }
  });
}

function checkTimeLimit(state: GameState): void {
  if (!state.matchTimeLimit) return;
  if (state.winner !== null) return;
  
  const timeRemaining = state.matchTimeLimit - state.elapsedTime;
  
  if (timeRemaining <= 30 && timeRemaining > 29 && !state.timeoutWarningShown) {
    state.timeoutWarningShown = true;
  }
  
  if (state.elapsedTime >= state.matchTimeLimit) {
    const playerBase = state.bases.find(b => b.owner === 0);
    const enemyBase = state.bases.find(b => b.owner === 1);
    
    if (!playerBase || !enemyBase) return;
    
    const playerBaseDamage = playerBase.maxHp - playerBase.hp;
    const enemyBaseDamage = enemyBase.maxHp - enemyBase.hp;
    
    if (playerBaseDamage < enemyBaseDamage) {
      state.winner = 0;
      state.mode = 'victory';
    } else if (enemyBaseDamage < playerBaseDamage) {
      state.winner = 1;
      state.mode = 'victory';
    } else {
      if (state.matchStats) {
        const playerUnitDamage = state.matchStats.damageDealtByPlayer;
        const enemyUnitDamage = state.matchStats.damageToPlayerBase;
        
        if (playerUnitDamage > enemyUnitDamage) {
          state.winner = 0;
          state.mode = 'victory';
        } else if (enemyUnitDamage > playerUnitDamage) {
          state.winner = 1;
          state.mode = 'victory';
        } else {
          state.winner = -1;
          state.mode = 'victory';
        }
      } else {
        state.winner = -1;
        state.mode = 'victory';
      }
    }
  }
}

export function spawnUnit(state: GameState, owner: number, type: UnitType, spawnPos: { x: number; y: number }, rallyPos: { x: number; y: number }): boolean {
  const def = UNIT_DEFINITIONS[type];

  if (state.players[owner].photons < def.cost) return false;
  if (!state.settings.enabledUnits.has(type)) return false;

  state.players[owner].photons -= def.cost;

  if (state.matchStats && owner === 0) {
    state.matchStats.unitsTrainedByPlayer += 1;
    state.matchStats.photonsSpentByPlayer += def.cost;
  }

  if (owner === 0) {
    soundManager.playUnitTrain();
  }

  // Clamp the rally point so new units don't get stuck on boundaries or obstacles.
  const safeRallyPos = getSafeRallyPosition(state, spawnPos, rallyPos);

  const unit: Unit = {
    id: generateId(),
    type,
    owner,
    position: spawnPos,
    hp: def.hp,
    maxHp: def.hp,
    armor: def.armor,
    commandQueue: [{ type: 'move', position: safeRallyPos }],
    damageMultiplier: 1.0,
    distanceTraveled: 0,
    distanceCredit: 0,
    abilityCooldown: 0,
    attackCooldown: 0, // Initialize attack cooldown
  };
  
  // Initialize particles for all units with different particle counts based on unit type
  const particleCounts: Record<UnitType, number> = {
    marine: 12,      // Ranged attacker - moderate particle count
    warrior: 16,     // Melee bruiser - more particles for intimidation
    snaker: 10,      // Fast harassment - fewer particles for speed aesthetic
    tank: 20,        // Heavy tank - most particles for imposing presence
    scout: 8,        // Fast scout - minimal particles for stealth aesthetic
    artillery: 14,   // Long-range - moderate-high particles for power
    medic: 12,       // Support unit - moderate particles with healing theme
    interceptor: 14, // Fast attacker - moderate-high particles for aggressive look
    berserker: 18,   // Heavy melee - lots of particles for rage effect
    assassin: 10,    // Fast melee - fewer particles for stealth/speed
    juggernaut: 22,  // Heaviest unit - most particles for imposing presence
    striker: 14,     // Medium melee - moderate particles for whirlwind effect
  };
  unit.particles = createParticlesForUnit(unit, particleCounts[type]);

  state.units.push(unit);
  
  // Create spawn effect
  const color = state.players[owner].color;
  createSpawnEffect(state, spawnPos, color);
  createEnergyPulse(state, spawnPos, color, 2.0, 0.5);
  
  return true;
}
