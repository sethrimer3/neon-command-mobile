import {
  GameState,
  Unit,
  Base,
  UnitType,
  Vector2,
  UNIT_DEFINITIONS,
  STRUCTURE_DEFINITIONS,
  CommandNode,
  PROMOTION_DISTANCE_THRESHOLD,
  PROMOTION_MULTIPLIER,
  QUEUE_BONUS_PER_NODE,
  BASE_SIZE_METERS,
  UNIT_SIZE_METERS,
  MINING_DRONE_SIZE_MULTIPLIER,
  MINING_DEPOT_SIZE_METERS,
  ABILITY_MAX_RANGE,
  ABILITY_LASER_DAMAGE,
  ABILITY_LASER_WIDTH,
  ABILITY_LASER_DURATION,
  ABILITY_LASER_BASE_DAMAGE_MULTIPLIER,
  Particle,
  Projectile,
  ProjectileKind,
  Shell,
  ResourceOrb,
  FACTION_DEFINITIONS,
  UnitModifier,
  QUEUE_MAX_LENGTH,
  BASE_TYPE_DEFINITIONS,
} from './types';
import { distance, normalize, scale, add, subtract, generateId, getPlayfieldRotationRadians } from './gameUtils';
import { checkObstacleCollision } from './maps';
import { soundManager } from './sound';
import { createSpawnEffect, createHitSparks, createAbilityEffect, createEnhancedDeathExplosion, createScreenFlash, createLaserParticles, createBounceParticles, createMuzzleFlash } from './visualEffects';
import { ObjectPool } from './objectPool';

// Projectile constants - must be declared before object pool
const PROJECTILE_SPEED = 15; // meters per second
const PROJECTILE_LIFETIME = 2.0; // seconds before projectile disappears
const MELEE_EFFECT_DURATION = 0.2; // seconds for melee attack visual
const LASER_BEAM_DURATION = 0.5; // seconds for laser beam visual

// Blade ability constants
const BLADE_SWORD_SWING_DURATION_FIRST = 0.45; // seconds for first 210° swing
const BLADE_SWORD_SWING_DURATION_SECOND = 0.40; // seconds for second 180° swing
const BLADE_SWORD_SWING_DURATION_THIRD = 0.50; // seconds for third 360° spin
const BLADE_SWORD_SWING_PAUSE = 1.0; // seconds to pause between individual combo swings for particle catch-up
const BLADE_SWORD_SEQUENCE_RESET_TIME = 1.0; // seconds to pause after the third swing before allowing a new combo
const BLADE_SWORD_HOLD_RESET_DELAY = 1.0; // seconds to hold the sword angle after the final swing before resting
const BLADE_SWORD_LAG_HISTORY_DURATION = 1.2; // seconds of history to retain for Blade movement lag
const BLADE_KNIFE_ANGLES = [-10, -5, 0, 5, 10]; // degrees for volley spread
const BLADE_KNIFE_SHOT_INTERVAL = 0.06; // seconds between knives
const BLADE_KNIFE_SCRUNCH_DURATION = 0.12; // seconds to compress sword particles
const BLADE_KNIFE_BASE_SPEED = 20; // base knife speed before arrow magnitude scaling
const BLADE_KNIFE_LIFETIME = 1.4; // seconds knives persist before disappearing
const BLADE_KNIFE_DAMAGE = 6; // base damage per knife before multiplier
const BLADE_KNIFE_START_OFFSET = UNIT_SIZE_METERS * 0.4; // offset from unit center for knife spawn

// Dagger ability constants
const DAGGER_KNIFE_DELAY = 2.0; // seconds before the knife is thrown after reveal
const DAGGER_REVEAL_AFTER_THROW = 1.0; // seconds visible after throwing before recloaking
const DAGGER_KNIFE_RANGE = 10; // distance the knife travels
const DAGGER_KNIFE_SPEED = 18; // knife travel speed
const DAGGER_KNIFE_DAMAGE = 8; // base damage per knife before multiplier
const DAGGER_KNIFE_LIFETIME = 1.4; // seconds knives persist before disappearing
const DAGGER_KNIFE_START_OFFSET = UNIT_SIZE_METERS * 0.35; // offset from unit center for knife spawn

// Tank projectile attraction constants
const TANK_PROJECTILE_ATTRACTION_RADIUS = 6; // meters within which tanks attract enemy projectiles
const TANK_PROJECTILE_ATTRACTION_STRENGTH = 6; // velocity pull strength toward tanks

// Shell ejection constants for marine firing
const SHELL_EJECTION_SPEED = 3.8; // meters per second
const SHELL_EJECTION_OFFSET = UNIT_SIZE_METERS * 0.4; // offset from unit center
const SHELL_EJECTION_ANGLE_VARIANCE = 0.25; // radians for ejection wobble
const SHELL_EJECTION_SPEED_VARIANCE = 0.35; // percent variance in speed
const SHELL_LIFETIME = 1.2; // seconds before shell disappears
const SHELL_COLLISION_RADIUS = 0.18; // meters for shell-field particle collision
const SHELL_BOUNCE_DAMPING = 0.6; // velocity damping after bounce
const SHELL_MOMENTUM_TRANSFER = 0.4; // velocity transfer factor to field particles
const SHELL_MASS = 0.02; // small mass for shell physics

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

// Apply shield dome modifiers for melee/ranged damage when allies are inside active shields.
function getShieldDamageMultiplier(state: GameState, targetUnit: Unit, attackType: 'melee' | 'ranged'): number {
  const shieldProviders = state.units.filter((ally) => 
    ally.owner === targetUnit.owner &&
    ally.shieldActive &&
    distance(ally.position, targetUnit.position) <= ally.shieldActive.radius
  );

  if (shieldProviders.length === 0) {
    return 1;
  }

  const multipliers = shieldProviders.map((ally) => {
    if (attackType === 'ranged') {
      return ally.shieldActive?.rangedDamageMultiplier ?? 1;
    }
    return ally.shieldActive?.meleeDamageMultiplier ?? 1;
  });

  return Math.min(...multipliers, 1);
}

// Helper to filter out cloaked enemies for auto-targeted abilities.
function getTargetableEnemies(state: GameState, unit: Unit): Unit[] {
  return state.units.filter((enemy) => enemy.owner !== unit.owner && !enemy.cloaked);
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
    kind: 'standard',
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
    projectile.kind = 'standard';
  },
  100, // Initial pool size
  500  // Max pool size
);

// Unit collision constants
const UNIT_COLLISION_RADIUS = UNIT_SIZE_METERS / 2; // Minimum distance between unit centers
const UNIT_COLLISION_SQUEEZE_FACTOR = 0.75; // Allow units to squeeze past each other (75% of full diameter - more permissive for smoother flow)
const ARRIVAL_DISTANCE_THRESHOLD = 0.1; // Distance threshold for considering a unit has arrived at destination
const COLLISION_PUSH_STRENGTH = 0.6; // Strength of local collision push to keep units from stacking
const COLLISION_PUSH_MAX_DISTANCE = 0.25; // Maximum push distance per update for gentle separation

// Helper function to calculate effective collision radius
function getCollisionRadius(): number {
  return (UNIT_COLLISION_RADIUS * 2) * UNIT_COLLISION_SQUEEZE_FACTOR;
}

// Flocking/Boids constants for smooth group movement (StarCraft-like)
const SEPARATION_RADIUS = 1.5; // Distance to maintain from nearby units
const SEPARATION_FORCE = 3.0; // Strength of separation force (reduced from 8.0 to prevent violent oscillations)
const SEPARATION_FORCE_PATH = 1.5; // Reduced separation force when following paths to allow tighter groups
const SEPARATION_ALONG_PATH_FACTOR = 0.3; // Separation force multiplier along path direction (30%)
const SEPARATION_PERPENDICULAR_FACTOR = 1.0; // Separation force multiplier perpendicular to path (100%)
const SEPARATION_MIN_DISTANCE = 0.05; // Minimum distance for separation calculation (prevents division by zero)
const COHESION_RADIUS = 4.0; // Distance to check for group cohesion
const COHESION_FORCE = 1.0; // Strength of cohesion force (reduced from 2.0 for gentler grouping)
const COHESION_FORCE_PATH = 2.0; // Increased cohesion when following paths to keep units together along the line
const ALIGNMENT_RADIUS = 3.0; // Distance to check for velocity alignment
const ALIGNMENT_FORCE = 0.8; // Strength of alignment force (reduced from 1.5 for smoother alignment)
const ALIGNMENT_FORCE_PATH = 1.2; // Increased alignment when following paths for better coordination
const FLOCKING_MAX_FORCE = 3.0; // Maximum magnitude of flocking forces (reduced from 5.0 to prevent extreme forces)
const FLOCKING_MAX_FORCE_PATH = 2.5; // Reduced max force for paths to prevent excessive lateral deviation
const MIN_FORCE_THRESHOLD = 0.01; // Minimum force magnitude to apply
const FLOCKING_FORCE_SMOOTHING = 0.7; // Smoothing factor for force changes (0=instant, 1=no change) - prevents violent oscillations
const BASE_DIRECTION_WEIGHT_NORMAL = 10.0; // Base direction strength for normal movement (10x stronger than flocking)
const BASE_DIRECTION_WEIGHT_PATH = 12.0; // Base direction strength for path following (12x stronger for tighter adherence)

// Jitter/wiggle constants for stuck unit recovery
const JITTER_ACTIVATION_RATIO = 0.5; // Activate jitter at 50% of stuck timeout
const JITTER_RADIUS = 0.2; // Size of jitter wiggle circle in meters
const JITTER_INCREMENT = 0.1; // Speed of jitter cycle (radians per frame)
const JITTER_MOVEMENT_DISTANCE = 0.1; // Distance to move per jitter attempt

// Particle physics constants
const PARTICLE_ATTRACTION_STRENGTH = 6.0; // How strongly particles are attracted to their unit
const PARTICLE_DAMPING = 0.92; // Velocity damping factor - reduces velocity to prevent excessive speeds
// Scale orbit distance with unit size so particles stay proportionate to unit silhouettes.
const PARTICLE_ORBIT_DISTANCE = UNIT_SIZE_METERS * 0.8; // Desired orbit distance from unit center
// Scale minimum velocity to keep particles moving proportionally around larger units.
const PARTICLE_MIN_VELOCITY = 2.5 * UNIT_SIZE_METERS; // Minimum velocity to keep particles moving
const PARTICLE_ORBITAL_SPEED = 2.0; // Speed of orbital rotation around unit
// Scale orbital force with unit size to maintain similar orbital tension at larger radii.
const PARTICLE_ORBITAL_FORCE = 1.2 * UNIT_SIZE_METERS; // Force applied for orbital motion
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

// Rally point spread constants for spawned units
const RALLY_POINT_SPREAD_RADIUS = 1.5; // meters - radius around rally point where units will be distributed

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
  const collisionRadius = getCollisionRadius();
  
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

// Check if a friendly unit is occupying a target position
// Returns true if a friendly unit is within arrival distance of the target
function isFriendlyUnitAtPosition(unit: Unit, targetPosition: Vector2, allUnits: Unit[]): boolean {
  for (const otherUnit of allUnits) {
    // Skip checking against self
    if (otherUnit.id === unit.id) continue;
    
    // Only check friendly units
    if (otherUnit.owner !== unit.owner) continue;
    
    // Check if the other unit is "on top of" the target position (has arrived there)
    const distToTarget = distance(otherUnit.position, targetPosition);
    if (distToTarget < ARRIVAL_DISTANCE_THRESHOLD) {
      return true;
    }
  }
  return false;
}

// Check if a unit has arrived at its target position
// Considers both direct arrival and arrival when a friendly unit is blocking the target
function hasUnitArrivedAtPosition(
  unit: Unit,
  targetPosition: Vector2,
  currentDistance: number,
  allUnits: Unit[]
): boolean {
  // Standard arrival: within threshold distance of target
  if (currentDistance < ARRIVAL_DISTANCE_THRESHOLD) {
    return true;
  }
  
  // Alternative arrival: close enough to a friendly unit occupying the target
  if (isFriendlyUnitAtPosition(unit, targetPosition, allUnits) && 
      currentDistance < getCollisionRadius()) {
    return true;
  }
  
  return false;
}

/**
 * Move a unit toward a target position using standard movement logic.
 * Mirrors regular move behavior so ability anchors behave like normal commands.
 * @param state - Current game state for collision/pathing context
 * @param unit - Unit to move
 * @param targetPosition - Destination to move toward
 * @param deltaTime - Elapsed time in seconds for this frame
 */
function moveUnitTowardPosition(
  state: GameState,
  unit: Unit,
  targetPosition: Vector2,
  deltaTime: number
): void {
  const dist = distance(unit.position, targetPosition);
  const def = UNIT_DEFINITIONS[unit.type];

  // Determine a movement direction, factoring in flocking and obstacle avoidance.
  let direction = normalize(subtract(targetPosition, unit.position));
  direction = applyFlockingBehavior(unit, direction, state.units);

  const alternativePath = findPathAroundObstacle(unit, targetPosition, state.obstacles);
  if (alternativePath) {
    direction = alternativePath;
  }

  if (unit.jitterOffset !== undefined) {
    const jitteredDirection = applyJitterMovement(unit, direction, state.units, state.obstacles);
    if (jitteredDirection) {
      direction = jitteredDirection;
    }
  }

  // Align unit orientation with its travel direction for consistent visuals.
  updateUnitRotation(unit, direction, deltaTime);

  // Use constant top speed instead of acceleration
  const movement = scale(direction, def.moveSpeed * deltaTime);
  const moveDist = Math.min(distance(unit.position, add(unit.position, movement)), dist);
  const newPosition = add(unit.position, scale(direction, moveDist));

  // Apply local collision push to prevent stacking while moving to the anchor.
  const adjustedPosition = applyLocalCollisionPush(unit, newPosition, state.units);
  const collisionResult = checkUnitCollisionBlocking(unit, adjustedPosition, state.units, state.obstacles);

  if (!collisionResult.blocked) {
    unit.position = adjustedPosition;
    unit.stuckTimer = 0;
    unit.lastPosition = { ...unit.position };
    unit.jitterOffset = undefined;
  } else {
    // Slow down when blocked and track stuck state to enable jitter recovery.
    unit.currentSpeed = Math.max(0, (unit.currentSpeed || 0) * COLLISION_DECELERATION_FACTOR);
    updateStuckDetection(unit, deltaTime);
    return;
  }

  // Reward movement distance so ability positioning still contributes to promotions.
  const queueMovementNodes = unit.commandQueue.filter((n) => n.type === 'move' || n.type === 'attack-move').length;
  const creditMultiplier = 1.0 + QUEUE_BONUS_PER_NODE * queueMovementNodes;
  unit.distanceCredit += moveDist * creditMultiplier;

  while (unit.distanceCredit >= PROMOTION_DISTANCE_THRESHOLD) {
    unit.distanceCredit -= PROMOTION_DISTANCE_THRESHOLD;
    // Damage multiplier from movement disabled
    // unit.damageMultiplier *= PROMOTION_MULTIPLIER;
  }

  unit.distanceTraveled += moveDist;
}

// Collision check that blocks movement when any unit or obstacle overlap is detected
// Returns { blocked: boolean }
function checkUnitCollisionBlocking(
  unit: Unit,
  desiredPosition: Vector2,
  allUnits: Unit[],
  obstacles: import('./maps').Obstacle[]
): { blocked: boolean } {
  const collisionRadius = getCollisionRadius();
  
  // Check obstacle collision first
  if (checkObstacleCollision(desiredPosition, UNIT_SIZE_METERS / 2, obstacles)) {
    return { blocked: true };
  }

  // Unit collisions are handled via local avoidance rather than hard blocking.
  return { blocked: false };
}

/**
 * Nudges a desired position away from nearby units to prevent stacking.
 * Uses a capped push force so units can still flow past each other smoothly.
 * @param unit - Unit attempting to move
 * @param desiredPosition - Proposed new position for the unit
 * @param allUnits - All units in the simulation for local avoidance
 * @returns Adjusted position that is gently pushed away from neighbors
 */
function applyLocalCollisionPush(
  unit: Unit,
  desiredPosition: Vector2,
  allUnits: Unit[]
): Vector2 {
  const collisionRadius = getCollisionRadius();
  let pushVector = { x: 0, y: 0 };
  let pushCount = 0;

  for (const otherUnit of allUnits) {
    if (otherUnit.id === unit.id) continue;
    
    // Mining drones don't collide with other mining drones
    if (unit.type === 'miningDrone' && otherUnit.type === 'miningDrone') continue;

    const dist = distance(desiredPosition, otherUnit.position);
    if (dist > 0 && dist < collisionRadius) {
      // Push away more strongly the closer the units are.
      const overlap = collisionRadius - dist;
      const away = normalize(subtract(desiredPosition, otherUnit.position));
      pushVector = add(pushVector, scale(away, overlap));
      pushCount += 1;
    }
  }

  if (pushCount === 0) {
    return desiredPosition;
  }

  // Average and clamp the push so adjustments remain smooth.
  pushVector = scale(pushVector, 1 / pushCount);
  const pushMagnitude = Math.min(
    COLLISION_PUSH_MAX_DISTANCE,
    distance({ x: 0, y: 0 }, pushVector) * COLLISION_PUSH_STRENGTH
  );

  if (pushMagnitude < MIN_FORCE_THRESHOLD) {
    return desiredPosition;
  }

  return add(desiredPosition, scale(normalize(pushVector), pushMagnitude));
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
      
      // If stuck for too long, try to wiggle out before canceling
      if (unit.stuckTimer >= STUCK_TIMEOUT * JITTER_ACTIVATION_RATIO && unit.stuckTimer < STUCK_TIMEOUT) {
        // Apply jitter to help unstick (activation at 50% of timeout period)
        if (!unit.jitterOffset) {
          unit.jitterOffset = 0;
        }
      }
      
      // If stuck for too long after trying jitter, cancel command queue
      if (unit.stuckTimer >= STUCK_TIMEOUT) {
        markQueueForCancellation(unit);
      }
    } else {
      // Unit moved enough - reset stuck timer and jitter
      unit.stuckTimer = 0;
      unit.lastPosition = { ...unit.position };
      unit.jitterOffset = undefined;
    }
  }
}

/**
 * Apply jitter movement to help stuck units find a way out
 * @param unit - The unit that's stuck
 * @param baseDirection - The direction unit is trying to move
 * @param allUnits - All units for collision checking
 * @param obstacles - All obstacles for collision checking
 * @returns Modified direction with jitter applied, or null if no valid jitter found
 */
function applyJitterMovement(
  unit: Unit,
  baseDirection: Vector2,
  allUnits: Unit[],
  obstacles: import('./maps').Obstacle[]
): Vector2 | null {
  if (!unit.jitterOffset) {
    unit.jitterOffset = 0;
  }
  
  // Increment jitter offset for cycling through positions
  unit.jitterOffset += JITTER_INCREMENT;
  
  // Try circular jitter pattern around the stuck position
  const jitterAngle = unit.jitterOffset * Math.PI * 2;
  const jitterOffset = {
    x: Math.cos(jitterAngle) * JITTER_RADIUS,
    y: Math.sin(jitterAngle) * JITTER_RADIUS
  };
  
  // Apply jitter to base direction
  const jitteredDirection = normalize(add(baseDirection, jitterOffset));
  const jitteredPosition = add(unit.position, scale(jitteredDirection, JITTER_MOVEMENT_DISTANCE));
  
  // Check if jittered position is valid
  if (!checkObstacleCollision(jitteredPosition, UNIT_SIZE_METERS / 2, obstacles) &&
      !checkUnitCollision(jitteredPosition, unit.id, allUnits)) {
    return jitteredDirection;
  }
  
  return null;
}

// Pathfinding constants
const PATHFINDING_LOOKAHEAD_DISTANCE = 2.0; // How far ahead to check for obstacles
const PATHFINDING_ANGLE_STEP = Math.PI / 8; // 22.5 degrees - smaller angle increments for smoother paths
const PATHFINDING_MAX_ANGLES = 6; // Try up to 6 angles on each side (more attempts to find paths)

/**
 * Calculate separation force to avoid crowding nearby units (boids algorithm)
 * @param unit - The unit calculating separation
 * @param allUnits - All units in the game
 * @returns Separation force vector
 */
function calculateSeparation(unit: Unit, allUnits: Unit[], isFollowingPath: boolean = false, pathDirection?: Vector2): Vector2 {
  let separationForce = { x: 0, y: 0 };
  let count = 0;
  
  // Use reduced separation force when following paths
  const separationStrength = isFollowingPath ? SEPARATION_FORCE_PATH : SEPARATION_FORCE;
  
  for (const other of allUnits) {
    // Skip self and enemy units
    if (other.id === unit.id || other.owner !== unit.owner) continue;
    
    const dist = distance(unit.position, other.position);
    // Only apply separation within the separation radius and above minimum distance
    if (dist < SEPARATION_RADIUS && dist >= SEPARATION_MIN_DISTANCE) {
      // Calculate vector away from other unit
      const away = subtract(unit.position, other.position);
      
      // Use smooth cubic falloff that provides continuous separation force
      // This prevents the "dead zone trap" while still being gentle at close range
      // Formula: weight = (1 - dist/radius)³ gives strong force at close range
      // but tapers off smoothly, preventing oscillations
      const normalizedDist = dist / SEPARATION_RADIUS;
      const base = 1 - normalizedDist;
      let weight = base * base * base; // Cubic falloff - more efficient than Math.pow
      
      // When following a path, reduce separation perpendicular to path direction
      // This allows units to be closer when moving along the same line
      if (isFollowingPath && pathDirection) {
        const normalizedAway = normalize(away);
        const normalizedPath = normalize(pathDirection);
        // Calculate how perpendicular the separation is to the path (0 = parallel, 1 = perpendicular)
        const perpendicularity = Math.abs(normalizedAway.x * normalizedPath.y - normalizedAway.y * normalizedPath.x);
        // Reduce separation force along the path direction (when perpendicularity is low)
        // This allows units to tolerate being closer when moving in the same direction
        // Linear interpolation: along-path factor when parallel, perpendicular factor when perpendicular
        weight *= SEPARATION_ALONG_PATH_FACTOR + (SEPARATION_PERPENDICULAR_FACTOR - SEPARATION_ALONG_PATH_FACTOR) * perpendicularity;
      }
      
      const weightedAway = scale(normalize(away), weight);
      separationForce = add(separationForce, weightedAway);
      count++;
    }
  }
  
  if (count > 0) {
    // Average the forces
    separationForce = scale(separationForce, 1 / count);
    // Normalize and apply force strength
    if (distance({ x: 0, y: 0 }, separationForce) > MIN_FORCE_THRESHOLD) {
      separationForce = scale(normalize(separationForce), separationStrength);
    }
  }
  
  return separationForce;
}

/**
 * Calculate cohesion force to stay near group center (boids algorithm)
 * @param unit - The unit calculating cohesion
 * @param allUnits - All units in the game
 * @param isFollowingPath - Whether the unit is following a path
 * @returns Cohesion force vector
 */
function calculateCohesion(unit: Unit, allUnits: Unit[], isFollowingPath: boolean = false): Vector2 {
  let centerOfMass = { x: 0, y: 0 };
  let count = 0;
  
  // Use increased cohesion force when following paths
  const cohesionStrength = isFollowingPath ? COHESION_FORCE_PATH : COHESION_FORCE;
  
  for (const other of allUnits) {
    // Skip self and enemy units
    if (other.id === unit.id || other.owner !== unit.owner) continue;
    // Only consider units with same command (moving together)
    if (other.commandQueue.length === 0) continue;
    
    const dist = distance(unit.position, other.position);
    if (dist < COHESION_RADIUS) {
      centerOfMass = add(centerOfMass, other.position);
      count++;
    }
  }
  
  if (count > 0) {
    // Calculate average position
    centerOfMass = scale(centerOfMass, 1 / count);
    // Create force toward center
    const cohesionForce = subtract(centerOfMass, unit.position);
    const cohesionMagnitude = distance({ x: 0, y: 0 }, cohesionForce);
    if (cohesionMagnitude > MIN_FORCE_THRESHOLD) {
      // Apply weaker force at longer distances for gentler cohesion
      const normalizedDist = Math.min(cohesionMagnitude / COHESION_RADIUS, 1.0);
      const strength = cohesionStrength * normalizedDist; // Linear falloff
      return scale(normalize(cohesionForce), strength);
    }
  }
  
  return { x: 0, y: 0 };
}

/**
 * Calculate alignment force to match velocity of nearby units (boids algorithm)
 * @param unit - The unit calculating alignment
 * @param allUnits - All units in the game
 * @param currentDirection - Current movement direction
 * @param isFollowingPath - Whether the unit is following a path
 * @returns Alignment force vector
 */
function calculateAlignment(unit: Unit, allUnits: Unit[], currentDirection: Vector2, isFollowingPath: boolean = false): Vector2 {
  let averageDirection = { x: 0, y: 0 };
  let count = 0;
  
  // Use increased alignment force when following paths
  const alignmentStrength = isFollowingPath ? ALIGNMENT_FORCE_PATH : ALIGNMENT_FORCE;
  
  for (const other of allUnits) {
    // Skip self and enemy units
    if (other.id === unit.id || other.owner !== unit.owner) continue;
    // Only consider units that are moving
    if (other.commandQueue.length === 0) continue;
    
    const dist = distance(unit.position, other.position);
    if (dist < ALIGNMENT_RADIUS && other.commandQueue.length > 0) {
      const otherTarget = other.commandQueue[0];
      if (otherTarget.type === 'move' || otherTarget.type === 'attack-move') {
        const otherDirection = normalize(subtract(otherTarget.position, other.position));
        averageDirection = add(averageDirection, otherDirection);
        count++;
      } else if (otherTarget.type === 'follow-path') {
        // For path following, use the direction to the current waypoint
        if (otherTarget.path.length > 0) {
          const otherDirection = normalize(subtract(otherTarget.path[0], other.position));
          averageDirection = add(averageDirection, otherDirection);
          count++;
        }
      }
    }
  }
  
  if (count > 0) {
    // Calculate average direction
    averageDirection = scale(averageDirection, 1 / count);
    const avgMagnitude = distance({ x: 0, y: 0 }, averageDirection);
    if (avgMagnitude > MIN_FORCE_THRESHOLD) {
      averageDirection = normalize(averageDirection);
      // Create steering force toward average direction
      const alignmentForce = subtract(averageDirection, currentDirection);
      const alignmentMagnitude = distance({ x: 0, y: 0 }, alignmentForce);
      if (alignmentMagnitude > MIN_FORCE_THRESHOLD) {
        // Weaker alignment force for gentler direction changes
        return scale(normalize(alignmentForce), alignmentStrength * Math.min(alignmentMagnitude, 1.0));
      }
    }
  }
  
  return { x: 0, y: 0 };
}

/**
 * Helper function to clamp a force vector to a maximum magnitude
 * @param force - The force vector to clamp
 * @param maxMagnitude - Maximum allowed magnitude
 * @returns Clamped force vector and its magnitude
 */
function clampForce(force: Vector2, maxMagnitude: number): { force: Vector2; magnitude: number } {
  const magnitude = distance({ x: 0, y: 0 }, force);
  if (magnitude > maxMagnitude) {
    return {
      force: scale(normalize(force), maxMagnitude),
      magnitude: maxMagnitude
    };
  }
  return { force, magnitude };
}

/**
 * Apply flocking forces to a movement direction for smooth group movement
 * @param unit - The unit to apply flocking to
 * @param baseDirection - The base movement direction (toward target)
 * @param allUnits - All units in the game
 * @param isFollowingPath - Whether the unit is following a path
 * @param pathDirection - The direction of the path (for path-aware separation)
 * @returns Modified direction with flocking applied
 */
function applyFlockingBehavior(unit: Unit, baseDirection: Vector2, allUnits: Unit[], isFollowingPath: boolean = false, pathDirection?: Vector2): Vector2 {
  // Calculate all three flocking forces with path-awareness
  const separation = calculateSeparation(unit, allUnits, isFollowingPath, pathDirection);
  const cohesion = calculateCohesion(unit, allUnits, isFollowingPath);
  const alignment = calculateAlignment(unit, allUnits, baseDirection, isFollowingPath);
  
  // Combine flocking forces
  let flockingForce = { x: 0, y: 0 };
  flockingForce = add(flockingForce, separation);
  flockingForce = add(flockingForce, cohesion);
  flockingForce = add(flockingForce, alignment);
  
  // Use path-specific max force when following paths
  const maxForce = isFollowingPath ? FLOCKING_MAX_FORCE_PATH : FLOCKING_MAX_FORCE;
  
  // Clamp flocking force to max magnitude
  let clampResult = clampForce(flockingForce, maxForce);
  flockingForce = clampResult.force;
  
  // Prevent flocking forces from pushing units backward relative to their movement direction
  // This fixes the bug where units in large groups start moving backward
  // Ensure base direction is not zero before attempting projection
  const baseMagnitude = distance({ x: 0, y: 0 }, baseDirection);
  if (baseMagnitude > MIN_FORCE_THRESHOLD) {
    // Normalize base direction for accurate projection math
    const normalizedBase = normalize(baseDirection);
    
    // Calculate dot product to check if flocking force opposes base direction
    const dot = flockingForce.x * normalizedBase.x + flockingForce.y * normalizedBase.y;
    // Only apply projection if force is significant and pointing backward
    if (dot < 0 && clampResult.magnitude > MIN_FORCE_THRESHOLD) {
      // Flocking force has a backward component - project it to be perpendicular to base direction
      // This allows units to move sideways (to avoid each other) but prevents backward motion
      // Projection formula: proj_B(A) = (A · B̂) * B̂ where B̂ is normalized base direction
      // When dot < 0, projection points backward (opposite to base direction)
      // perpendicular = flockingForce - projection removes the backward component
      const projection = scale(normalizedBase, dot);
      flockingForce = subtract(flockingForce, projection);
      
      // Re-clamp after projection
      clampResult = clampForce(flockingForce, maxForce);
      flockingForce = clampResult.force;
    }
  }
  
  // Apply force smoothing to prevent oscillations
  if (unit.previousFlockingForce) {
    // Blend previous force with current force for smooth transitions
    flockingForce = {
      x: unit.previousFlockingForce.x * FLOCKING_FORCE_SMOOTHING + flockingForce.x * (1 - FLOCKING_FORCE_SMOOTHING),
      y: unit.previousFlockingForce.y * FLOCKING_FORCE_SMOOTHING + flockingForce.y * (1 - FLOCKING_FORCE_SMOOTHING)
    };
  }
  
  // Store clamped and smoothed force for next frame
  unit.previousFlockingForce = { ...flockingForce };
  
  // Combine forces with base direction
  // Base direction should have stronger weight to ensure units still move toward their goal
  // Scale base direction by a factor to make it the dominant force
  // Use even stronger base direction weight for path following to reduce lateral deviation
  const BASE_DIRECTION_WEIGHT = isFollowingPath ? BASE_DIRECTION_WEIGHT_PATH : BASE_DIRECTION_WEIGHT_NORMAL;
  let finalDirection = scale(baseDirection, BASE_DIRECTION_WEIGHT);
  finalDirection = add(finalDirection, flockingForce);
  
  // Normalize to maintain consistent speed
  if (distance({ x: 0, y: 0 }, finalDirection) > MIN_FORCE_THRESHOLD) {
    return normalize(finalDirection);
  }
  
  return baseDirection;
}

/**
 * Advance through reached waypoints and return a lookahead target to smooth path turns.
 * @param unitPosition - Current unit position
 * @param path - Mutable list of waypoints to follow
 * @param lookaheadDistance - Distance ahead along the path to target
 * @param reachRadius - Distance threshold for consuming waypoints
 * @returns Target point along the path for smoother steering
 */
function getPathLookaheadTarget(
  unitPosition: Vector2,
  path: Vector2[],
  lookaheadDistance: number,
  reachRadius: number
): Vector2 {
  // Consume any waypoints that are already within the reach radius.
  while (path.length > 0 && distance(unitPosition, path[0]) <= reachRadius) {
    path.shift();
  }

  // If the path is exhausted, return the current position as a safe fallback.
  if (path.length === 0) {
    return unitPosition;
  }

  let remainingDistance = lookaheadDistance;
  let segmentStart = unitPosition;

  // Walk the polyline and find the point at the requested lookahead distance.
  for (let i = 0; i < path.length; i++) {
    const segmentEnd = path[i];
    const segmentLength = distance(segmentStart, segmentEnd);

    if (segmentLength <= MIN_FORCE_THRESHOLD) {
      segmentStart = segmentEnd;
      continue;
    }

    if (segmentLength >= remainingDistance) {
      const ratio = remainingDistance / segmentLength;
      return {
        x: segmentStart.x + (segmentEnd.x - segmentStart.x) * ratio,
        y: segmentStart.y + (segmentEnd.y - segmentStart.y) * ratio
      };
    }

    remainingDistance -= segmentLength;
    segmentStart = segmentEnd;
  }

  // If the lookahead distance extends beyond the final waypoint, use the last point.
  return path[path.length - 1];
}

/**
 * Finds an alternative path around obstacles using enhanced angle-based pathfinding.
 * Tries more angles with smaller increments for smoother pathfinding.
 * @param unit - The unit trying to move
 * @param target - The target position
 * @param obstacles - Array of obstacles to avoid
 * @returns Alternative direction to move, or null if no path found
 */
function findPathAroundObstacle(
  unit: Unit,
  target: Vector2,
  obstacles: import('./maps').Obstacle[]
): Vector2 | null {
  const directDirection = normalize(subtract(target, unit.position));
  const unitRadius = UNIT_SIZE_METERS / 2;
  
  // Check if direct path is clear
  const lookaheadPos = add(unit.position, scale(directDirection, PATHFINDING_LOOKAHEAD_DISTANCE));
  if (!checkObstacleCollision(lookaheadPos, unitRadius, obstacles)) {
    return null; // Direct path is clear, no need for pathfinding
  }
  
  // Calculate direction to target once for reuse
  const toTarget = subtract(target, unit.position);
  
  // Try alternative angles to find a clear path
  // Alternate between left and right to find the shortest path around
  for (let i = 1; i <= PATHFINDING_MAX_ANGLES; i++) {
    const angle = PATHFINDING_ANGLE_STEP * i;
    
    // Try right side first
    const rightAngle = Math.atan2(directDirection.y, directDirection.x) + angle;
    const rightDir = { x: Math.cos(rightAngle), y: Math.sin(rightAngle) };
    const rightPos = add(unit.position, scale(rightDir, PATHFINDING_LOOKAHEAD_DISTANCE));
    
    if (!checkObstacleCollision(rightPos, unitRadius, obstacles)) {
      // Check that this direction generally moves toward target
      const dotProduct = rightDir.x * toTarget.x + rightDir.y * toTarget.y;
      if (dotProduct > 0) {
        return rightDir;
      }
    }
    
    // Try left side
    const leftAngle = Math.atan2(directDirection.y, directDirection.x) - angle;
    const leftDir = { x: Math.cos(leftAngle), y: Math.sin(leftAngle) };
    const leftPos = add(unit.position, scale(leftDir, PATHFINDING_LOOKAHEAD_DISTANCE));
    
    if (!checkObstacleCollision(leftPos, unitRadius, obstacles)) {
      // Check that this direction generally moves toward target
      const dotProduct = leftDir.x * toTarget.x + leftDir.y * toTarget.y;
      if (dotProduct > 0) {
        return leftDir;
      }
    }
  }
  
  return null; // No clear path found
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

/**
 * Record a time-stamped snapshot of Blade movement so sword particles can lag behind motion.
 * Keeps a short history buffer for sampling delayed positions in the renderer.
 * @param unit - Unit to snapshot (only the Blade uses this history)
 * @param timestamp - Time in milliseconds for the snapshot
 */
function recordBladeTrailHistory(unit: Unit, timestamp: number): void {
  if (unit.type !== 'warrior') {
    return;
  }

  if (!unit.bladeTrailHistory) {
    unit.bladeTrailHistory = [];
  }

  // Store the latest transform to drive per-particle movement lag.
  unit.bladeTrailHistory.push({
    timestamp,
    position: { ...unit.position },
    rotation: unit.rotation ?? 0,
  });

  // Trim old samples so the buffer stays bounded for performance.
  const cutoffTime = timestamp - BLADE_SWORD_LAG_HISTORY_DURATION * 1000;
  unit.bladeTrailHistory = unit.bladeTrailHistory.filter((sample) => sample.timestamp >= cutoffTime);
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
function createProjectile(
  state: GameState,
  sourceUnit: Unit,
  target: Vector2,
  targetUnit?: Unit,
  options?: {
    speed?: number;
    damage?: number;
    kind?: ProjectileKind;
    lifetime?: number;
    startOffset?: number;
  }
): Projectile {
  const direction = normalize(subtract(target, sourceUnit.position));
  const def = UNIT_DEFINITIONS[sourceUnit.type];
  const damage = options?.damage ?? (def.attackDamage * sourceUnit.damageMultiplier);
  const color = state.players[sourceUnit.owner].color;
  const baseSpeed = options?.speed ?? PROJECTILE_SPEED;
  const projectileSpeed = baseSpeed;
  const startOffset = options?.startOffset ?? 0;
  
  // Acquire projectile from pool and initialize it
  const projectile = projectilePool.acquire();
  projectile.id = generateId();
  projectile.position.x = sourceUnit.position.x + direction.x * startOffset;
  projectile.position.y = sourceUnit.position.y + direction.y * startOffset;
  projectile.velocity = scale(direction, projectileSpeed);
  projectile.target = target;
  projectile.damage = damage;
  projectile.owner = sourceUnit.owner;
  projectile.color = color;
  projectile.lifetime = options?.lifetime ?? PROJECTILE_LIFETIME;
  projectile.createdAt = Date.now();
  projectile.sourceUnit = sourceUnit.id;
  projectile.targetUnit = targetUnit?.id;
  projectile.kind = options?.kind ?? 'standard';
  
  return projectile;
}

// Create a shell casing ejected from a marine shot
function createEjectedShell(unit: Unit, firingDirection: Vector2): Shell {
  const now = Date.now();
  const fallbackDirection = firingDirection.x === 0 && firingDirection.y === 0 ? { x: 1, y: 0 } : firingDirection;
  const forward = normalize(fallbackDirection);
  const side = normalize({ x: -forward.y, y: forward.x });
  // Always eject shells to the marine's right-hand side for consistent feedback.
  const sideSign = 1;
  const baseEjection = normalize(add(scale(side, sideSign), scale(forward, 0.25)));
  const baseAngle = Math.atan2(baseEjection.y, baseEjection.x);
  const angle = baseAngle + (Math.random() - 0.5) * 2 * SHELL_EJECTION_ANGLE_VARIANCE;
  const speed = SHELL_EJECTION_SPEED * (1 + (Math.random() - 0.5) * SHELL_EJECTION_SPEED_VARIANCE);

  return {
    id: generateId(),
    position: add(unit.position, scale(side, sideSign * SHELL_EJECTION_OFFSET)),
    velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 8,
    createdAt: now,
    lifetime: SHELL_LIFETIME,
    mass: SHELL_MASS,
    owner: unit.owner,
  };
}

/**
 * Applies an instant marine ranged hit so bullets register immediately without travel time.
 * Creates impact feedback, damage numbers, and bounce particles at the target location.
 * @param state - Current game state to mutate
 * @param unit - Marine unit firing the shot
 * @param target - Unit or base being hit
 * @param direction - Normalized direction of the shot for ricochet feedback
 */
function applyInstantMarineHit(state: GameState, unit: Unit, target: Unit | Base, direction: Vector2): void {
  const def = UNIT_DEFINITIONS[unit.type];
  const color = state.players[unit.owner].color;
  const impactPosition = { ...target.position };
  const incomingDirection = normalize(direction);
  const baseDamage = def.attackDamage * unit.damageMultiplier;

  // Always show a small impact ring at the hit position for instantaneous feedback.
  createImpactEffect(state, impactPosition, color, 0.8);

  if ('type' in target) {
    const targetUnit = target as Unit;
    const targetDef = UNIT_DEFINITIONS[targetUnit.type];
    const shieldMultiplier = getShieldDamageMultiplier(state, targetUnit, 'ranged');
    const finalDamage = calculateDamageWithArmor(baseDamage, targetUnit.armor, false, targetDef.modifiers) * shieldMultiplier;

    targetUnit.hp -= finalDamage;
    createDamageNumber(state, impactPosition, finalDamage, color);
    createHitSparks(state, impactPosition, color, 6);
    // Spawn ricochet bullets on every marine hit to keep the impact visible.
    createBounceParticles(state, impactPosition, incomingDirection, color, 2);

    if (state.matchStats && unit.owner === 0) {
      state.matchStats.damageDealtByPlayer += finalDamage;
    }
    return;
  }

  const targetBase = target as Base;

  // Respect base shields so marine hits still flash without applying damage.
  if (targetBase.shieldActive && Date.now() < targetBase.shieldActive.endTime) {
    createHitSparks(state, impactPosition, state.players[targetBase.owner].color, 12);
    return;
  }

  const finalDamage = calculateDamageWithArmor(baseDamage, targetBase.armor, false);
  targetBase.hp -= finalDamage;
  createHitSparks(state, impactPosition, color, 8);
  // Show the ricochet at the base impact for marine shots as well.
  createBounceParticles(state, impactPosition, incomingDirection, color, 2);

  if (state.matchStats) {
    if (targetBase.owner === 0) {
      state.matchStats.damageToPlayerBase += finalDamage;
    } else {
      state.matchStats.damageToEnemyBase += finalDamage;
    }

    if (unit.owner === 0) {
      state.matchStats.damageDealtByPlayer += finalDamage;
    }
  }
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

// Create a resource orb when a non-mining-drone unit dies
function createResourceOrb(state: GameState, position: Vector2, ownerColor: string, enemyColor: string): void {
  if (!state.resourceOrbs) {
    state.resourceOrbs = [];
  }
  
  // Mix the two colors for the orb - use a neutral glowing color
  const mixColor = 'oklch(0.70 0.20 150)'; // A neutral teal/purple glow
  
  state.resourceOrbs.push({
    id: generateId(),
    position: { ...position },
    color: mixColor,
    createdAt: Date.now(),
    glowPhase: Math.random() * Math.PI * 2,
    ownerColor: ownerColor,
    killerColor: enemyColor,
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
    // Only create trails for fast units (dagger, interceptor, snaker)
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

// Update sprite corner trails for all units
function updateSpriteCornerTrails(state: GameState): void {
  if (!state.spriteCornerTrails) {
    state.spriteCornerTrails = [];
  }
  
  const now = Date.now();
  const SPRITE_CORNER_TRAIL_DURATION = 0.3; // seconds - shorter than motion trails
  const UNIT_SPRITE_HALF_SIZE = UNIT_SIZE_METERS * 1.55 / 2; // Half of sprite size (matches UNIT_SPRITE_SCALE * UNIT_SIZE_METERS)
  const MINING_DRONE_SPRITE_HALF_SIZE = UNIT_SIZE_METERS * MINING_DRONE_SIZE_MULTIPLIER * 1.35 / 2; // For mining drones
  
  // Update trails for each unit
  state.units.forEach((unit) => {
    // Skip mining drones for now as they have different sprite scaling
    if (unit.type === 'miningDrone') {
      return;
    }
    
    // Check if unit is moving
    const isMoving = unit.commandQueue.length > 0 || (unit.currentSpeed && unit.currentSpeed > 0.5);
    if (!isMoving) return;
    
    // Get or create trail for this unit
    let trail = state.spriteCornerTrails?.find(t => t.unitId === unit.id);
    if (!trail) {
      trail = {
        unitId: unit.id,
        leftCornerPositions: [],
        rightCornerPositions: [],
        color: state.players[unit.owner].color,
      };
      state.spriteCornerTrails!.push(trail);
    }
    
    // Calculate back corner positions based on unit rotation
    // Sprite rendering adds a PI/2 offset to align sprite-forward (up) with unit-forward direction.
    const rotation = unit.rotation || 0;
    const playfieldRotation = getPlayfieldRotationRadians();
    
    // The total rotation determines which way the unit/sprite is facing
    const totalRotation = rotation + playfieldRotation;
    
    // Get sprite size for this unit type
    const spriteHalfSize = unit.type === 'miningDrone' ? MINING_DRONE_SPRITE_HALF_SIZE : UNIT_SPRITE_HALF_SIZE;
    
    // The back of the unit is opposite to its forward direction
    // Since sprites are rendered with an additional PI/2 rotation offset, we need to account for that
    const backDirection = totalRotation + Math.PI + Math.PI / 2; // Back of the sprite
    const perpendicular = totalRotation + Math.PI / 2; // Left-right axis relative to sprite orientation
    
    // Back center point of the sprite
    const backCenterX = unit.position.x + Math.cos(backDirection) * spriteHalfSize;
    const backCenterY = unit.position.y + Math.sin(backDirection) * spriteHalfSize;
    
    // Calculate left and right corner offsets from back center
    const cornerOffset = spriteHalfSize * 0.7; // Corners are 70% of the way to the side edges
    
    const leftCornerPos = {
      x: backCenterX + Math.cos(perpendicular) * cornerOffset,
      y: backCenterY + Math.sin(perpendicular) * cornerOffset,
    };
    
    const rightCornerPos = {
      x: backCenterX - Math.cos(perpendicular) * cornerOffset,
      y: backCenterY - Math.sin(perpendicular) * cornerOffset,
    };
    
    // Add current positions to trails
    trail.leftCornerPositions.push({
      pos: leftCornerPos,
      timestamp: now,
    });
    
    trail.rightCornerPositions.push({
      pos: rightCornerPos,
      timestamp: now,
    });
    
    // Remove old positions
    trail.leftCornerPositions = trail.leftCornerPositions.filter(
      p => (now - p.timestamp) / 1000 < SPRITE_CORNER_TRAIL_DURATION
    );
    trail.rightCornerPositions = trail.rightCornerPositions.filter(
      p => (now - p.timestamp) / 1000 < SPRITE_CORNER_TRAIL_DURATION
    );
  });
  
  // Clean up trails for dead units
  const unitIds = new Set(state.units.map(u => u.id));
  state.spriteCornerTrails = state.spriteCornerTrails.filter(t => unitIds.has(t.unitId));
}

// Pull enemy projectiles toward nearby tanks to simulate passive magnetic defense.
function applyTankProjectileAttraction(state: GameState, projectile: Projectile, deltaTime: number): void {
  const enemyTanks = state.units.filter((unit) => unit.type === 'tank' && unit.owner !== projectile.owner && unit.hp > 0);

  let closestTank: Unit | null = null;
  let closestDistance = Infinity;

  enemyTanks.forEach((tank) => {
    const dist = distance(projectile.position, tank.position);
    if (dist < closestDistance) {
      closestDistance = dist;
      closestTank = tank;
    }
  });

  if (!closestTank || closestDistance > TANK_PROJECTILE_ATTRACTION_RADIUS) {
    return;
  }

  const pullStrength = TANK_PROJECTILE_ATTRACTION_STRENGTH * (1 - closestDistance / TANK_PROJECTILE_ATTRACTION_RADIUS);
  const pullDirection = normalize(subtract(closestTank.position, projectile.position));
  const pull = scale(pullDirection, pullStrength * deltaTime);

  projectile.velocity.x += pull.x;
  projectile.velocity.y += pull.y;
}

// Update projectiles - movement and collision
function updateProjectiles(state: GameState, deltaTime: number): void {
  const now = Date.now();
  
  // Update positions
  state.projectiles.forEach((projectile) => {
    applyTankProjectileAttraction(state, projectile, deltaTime);
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
            const shieldMultiplier = getShieldDamageMultiplier(state, target, 'ranged');
            const finalDamage = calculateDamageWithArmor(projectile.damage, target.armor, false, def.modifiers) * shieldMultiplier;
            target.hp -= finalDamage;
            createDamageNumber(state, projectile.position, finalDamage, projectile.color);
            createHitSparks(state, projectile.position, projectile.color, 6);
            
            // Create bounce particles if target has armor
            if (target.armor > 0) {
              const incomingDirection = normalize(projectile.velocity);
              createBounceParticles(state, projectile.position, incomingDirection, projectile.color, 3);
            }
            
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
              const shieldMultiplier = getShieldDamageMultiplier(state, enemy, 'ranged');
              const finalDamage = calculateDamageWithArmor(projectile.damage, enemy.armor, false, def.modifiers) * shieldMultiplier;
              enemy.hp -= finalDamage;
              createDamageNumber(state, projectile.position, finalDamage, projectile.color);
              createHitSparks(state, projectile.position, projectile.color, 6);
              
              // Create bounce particles if enemy has armor
              if (enemy.armor > 0) {
                const incomingDirection = normalize(projectile.velocity);
                createBounceParticles(state, projectile.position, incomingDirection, projectile.color, 3);
              }
              
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

// Update shell casings and handle collisions with field particles
function updateShells(state: GameState, deltaTime: number): void {
  if (!state.shells || state.shells.length === 0) return;

  const now = Date.now();
  const remainingShells: Shell[] = [];

  state.shells.forEach((shell) => {
    shell.position.x += shell.velocity.x * deltaTime;
    shell.position.y += shell.velocity.y * deltaTime;
    shell.rotation += shell.rotationSpeed * deltaTime;

    if (state.fieldParticles && state.fieldParticles.length > 0) {
      for (const particle of state.fieldParticles) {
        const dist = distance(shell.position, particle.position);
        const collisionDist = SHELL_COLLISION_RADIUS + particle.size;

        if (dist > 0 && dist < collisionDist) {
          const normal = normalize(subtract(shell.position, particle.position));
          const preBounceVelocity = { ...shell.velocity };
          const dot = shell.velocity.x * normal.x + shell.velocity.y * normal.y;

          // Reflect shell velocity across the collision normal
          shell.velocity.x = shell.velocity.x - 2 * dot * normal.x;
          shell.velocity.y = shell.velocity.y - 2 * dot * normal.y;
          shell.velocity.x *= SHELL_BOUNCE_DAMPING;
          shell.velocity.y *= SHELL_BOUNCE_DAMPING;

          // Transfer momentum into the ambient particle
          particle.velocity.x += preBounceVelocity.x * SHELL_MOMENTUM_TRANSFER;
          particle.velocity.y += preBounceVelocity.y * SHELL_MOMENTUM_TRANSFER;

          // Push shell out of overlap to prevent sticking
          shell.position = add(particle.position, scale(normal, collisionDist));
        }
      }
    }

    const age = (now - shell.createdAt) / 1000;
    if (age <= shell.lifetime) {
      remainingShells.push(shell);
    }
  });

  state.shells = remainingShells;
}

/**
 * Update chess mode turn timer and execute pending commands when turn ends
 */
function updateChessMode(state: GameState, deltaTime: number): void {
  // Only proceed if chess mode is enabled in settings
  if (!state.settings.chessMode) return;
  
  // Initialize chess mode state if not already initialized
  if (!state.chessMode) {
    state.chessMode = {
      enabled: true,
      turnDuration: 10.0, // 10 seconds per turn
      turnStartTime: state.elapsedTime,
      turnPhase: 'planning',
      pendingCommands: new Map(),
    };
    return;
  }
  
  const turnElapsed = state.elapsedTime - state.chessMode.turnStartTime;
  
  // Check if turn has completed
  if (turnElapsed >= state.chessMode.turnDuration) {
    // Execute all pending commands
    executeChessModeCommands(state);
    
    // Start new turn
    state.chessMode.turnStartTime = state.elapsedTime;
    state.chessMode.turnPhase = 'planning';
    state.chessMode.pendingCommands.clear();
    
    // Play a sound to indicate turn transition
    soundManager.playCountdown();
  }
}

/**
 * Execute all pending chess mode commands by applying them to unit command queues
 */
function executeChessModeCommands(state: GameState): void {
  if (!state.chessMode) return;
  
  // Apply pending commands to each unit
  state.chessMode.pendingCommands.forEach((commands, unitId) => {
    const unit = state.units.find(u => u.id === unitId);
    if (unit && commands.length > 0) {
      // In chess mode, replace the entire queue with the new command
      // This is intentional: each turn executes exactly 1 new command per unit
      // Previous commands should be completed during the turn execution phase
      unit.commandQueue = [commands[0]]; // Only execute 1 command per turn as specified
      
      // Mark the start time for queue draw animation
      unit.queueDrawStartTime = Date.now();
    }
  });
}

// Constants for floater physics
const FLOATER_FRICTION = 0.95; // Friction to slow down floaters over time
const FLOATER_MAX_SPEED = 2.0; // Maximum speed of floaters in pixels per second
const FLOATER_PUSH_RADIUS = 30; // Radius in pixels within which units push floaters
const FLOATER_PUSH_FORCE = 50; // Force applied to push floaters

// Update background floaters with physics-based movement
function updateFloaters(state: GameState, deltaTime: number): void {
  if (!state.floaters || state.floaters.length === 0) return;
  
  // Use window dimensions as fallback if canvas dimensions not stored
  const canvasWidth = (typeof window !== 'undefined') ? window.innerWidth : 1920;
  const canvasHeight = (typeof window !== 'undefined') ? window.innerHeight : 1080;
  
  state.floaters.forEach(floater => {
    // Apply forces from units and projectiles
    state.units.forEach(unit => {
      const unitScreenPos = {
        x: unit.position.x * 20, // Convert to pixels (PIXELS_PER_METER)
        y: unit.position.y * 20,
      };
      
      const dx = floater.position.x - unitScreenPos.x;
      const dy = floater.position.y - unitScreenPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < FLOATER_PUSH_RADIUS && dist > 0) {
        // Calculate push force (stronger when closer)
        const forceMagnitude = (FLOATER_PUSH_FORCE / floater.mass) * (1 - dist / FLOATER_PUSH_RADIUS);
        const forceX = (dx / dist) * forceMagnitude;
        const forceY = (dy / dist) * forceMagnitude;
        
        // Apply force to velocity
        floater.velocity.x += forceX * deltaTime;
        floater.velocity.y += forceY * deltaTime;
      }
    });
    
    // Apply forces from projectiles (smaller push)
    state.projectiles.forEach(projectile => {
      const projScreenPos = {
        x: projectile.position.x * 20,
        y: projectile.position.y * 20,
      };
      
      const dx = floater.position.x - projScreenPos.x;
      const dy = floater.position.y - projScreenPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < FLOATER_PUSH_RADIUS / 2 && dist > 0) {
        const forceMagnitude = (FLOATER_PUSH_FORCE * 0.3 / floater.mass) * (1 - dist / (FLOATER_PUSH_RADIUS / 2));
        const forceX = (dx / dist) * forceMagnitude;
        const forceY = (dy / dist) * forceMagnitude;
        
        floater.velocity.x += forceX * deltaTime;
        floater.velocity.y += forceY * deltaTime;
      }
    });
    
    // Apply friction
    floater.velocity.x *= FLOATER_FRICTION;
    floater.velocity.y *= FLOATER_FRICTION;
    
    // Limit max speed
    const speed = Math.sqrt(floater.velocity.x ** 2 + floater.velocity.y ** 2);
    if (speed > FLOATER_MAX_SPEED) {
      floater.velocity.x = (floater.velocity.x / speed) * FLOATER_MAX_SPEED;
      floater.velocity.y = (floater.velocity.y / speed) * FLOATER_MAX_SPEED;
    }
    
    // Update position
    floater.position.x += floater.velocity.x * deltaTime * 60; // Scale by 60 for frame independence
    floater.position.y += floater.velocity.y * deltaTime * 60;
    
    // Wrap around screen edges
    if (floater.position.x < 0) floater.position.x = canvasWidth;
    if (floater.position.x > canvasWidth) floater.position.x = 0;
    if (floater.position.y < 0) floater.position.y = canvasHeight;
    if (floater.position.y > canvasHeight) floater.position.y = 0;
  });
}

export function updateGame(state: GameState, deltaTime: number): void {
  if (state.mode !== 'game') return;

  state.elapsedTime += deltaTime;

  // Update chess mode turn timer if enabled
  updateChessMode(state, deltaTime);

  updateIncome(state, deltaTime);
  updateFloaters(state, deltaTime); // Update background floaters
  updateUnits(state, deltaTime);
  updateBases(state, deltaTime);
  updateStructures(state, deltaTime);
  updateProjectiles(state, deltaTime);
  updateShells(state, deltaTime);
  updateCombat(state, deltaTime);
  cleanupDeadUnits(state); // Clean up dead units after combat
  cleanupDyingUnits(state); // Clean up dying units after animation completes
  updateExplosionParticles(state, deltaTime);
  updateEnergyPulses(state);
  updateHitSparks(state, deltaTime);
  updateMotionTrails(state);
  updateSpriteCornerTrails(state);
  checkTimeLimit(state);
  checkVictory(state);
}

function updateIncome(state: GameState, deltaTime: number): void {
  state.players.forEach((player, playerIndex) => {
    // Calculate mining income from active mining drones (only source of income)
    let miningIncome = 0;
    state.miningDepots.forEach((depot) => {
      if (depot.owner === playerIndex) {
        depot.deposits.forEach((deposit) => {
          const activeWorkers = (deposit.workerIds ?? []).filter((workerId) => {
            // Check if each worker is still alive
            const worker = state.units.find(u => u.id === workerId);
            return !!worker;
          });

          // Update worker list to remove dead drones
          deposit.workerIds = activeWorkers;

          // Each active drone adds +2 income
          miningIncome += activeWorkers.length * 2;
        });
      }
    });
    
    player.incomeRate = miningIncome;
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
const AVOIDANCE_HEADING_THRESHOLD = 0.5; // Dot product threshold to determine if unit is heading toward another (0.5 = ~60 degree cone)

function updateUnits(state: GameState, deltaTime: number): void {
  // First pass: detect stationary units that should move aside for moving units
  state.units.forEach((stationaryUnit) => {
    // Update return delay timer for units in temporary avoidance
    if (stationaryUnit.temporaryAvoidance) {
      stationaryUnit.temporaryAvoidance.returnDelay -= deltaTime;
      
      // Check if it's time to return to original position
      if (stationaryUnit.temporaryAvoidance.returnDelay <= 0) {
        // Return to original position
        stationaryUnit.commandQueue.push({
          type: 'move',
          position: stationaryUnit.temporaryAvoidance.originalPosition
        });
        stationaryUnit.temporaryAvoidance = undefined;
      }
      return;
    }
    
    // Skip units that are already moving
    if (stationaryUnit.commandQueue.length > 0) return;
    
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
      
      // If dot product exceeds threshold, moving unit is heading towards stationary unit
      if (dotProduct > AVOIDANCE_HEADING_THRESHOLD) {
        // Move stationary unit aside perpendicular to movement direction
        const perpendicular = { x: -movementDirection.y, y: movementDirection.x };
        const avoidancePos = add(stationaryUnit.position, scale(perpendicular, AVOIDANCE_MOVE_DISTANCE));
        
        // Check if avoidance position is valid (not in obstacle)
        if (!checkObstacleCollision(avoidancePos, UNIT_SIZE_METERS / 2, state.obstacles)) {
          // Store original position and set return delay
          stationaryUnit.temporaryAvoidance = {
            originalPosition: { x: stationaryUnit.position.x, y: stationaryUnit.position.y },
            returnDelay: AVOIDANCE_RETURN_DELAY
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
    const frameTime = Date.now();
    const finalizeBladeTrail = () => {
      recordBladeTrailHistory(unit, frameTime);
    };

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
      finalizeBladeTrail();
      return;
    }

    if (unit.commandQueue.length === 0) {
      // Mining drones automatically queue back and forth between depot and deposit
      if (unit.miningState) {
        const depot = state.miningDepots.find(d => d.id === unit.miningState?.depotId);
        const deposit = depot?.deposits.find(d => d.id === unit.miningState?.depositId);
        
        if (depot && deposit) {
          // Hold briefly to keep paired drones in alternating cadence
          if (unit.miningState.cadenceDelay && unit.miningState.cadenceDelay > 0) {
            unit.miningState.cadenceDelay = Math.max(0, unit.miningState.cadenceDelay - deltaTime);
            unit.stuckTimer = 0;
            unit.lastPosition = undefined;
            return;
          }

          if (unit.miningState.atDepot) {
            // Go to deposit
            unit.commandQueue.push({ type: 'move', position: deposit.position });
            unit.miningState.atDepot = false;
          } else {
            // Go back to depot
            unit.commandQueue.push({ type: 'move', position: depot.position });
            unit.miningState.atDepot = true;
          }
        }
      }
      
      // Reset stuck timer when no commands
      unit.stuckTimer = 0;
      unit.lastPosition = undefined;
      finalizeBladeTrail();
      return;
    }

    const currentNode = unit.commandQueue[0];

    if (currentNode.type === 'move') {
      const dist = distance(unit.position, currentNode.position);
      const def = UNIT_DEFINITIONS[unit.type];

      if (hasUnitArrivedAtPosition(unit, currentNode.position, dist, state.units)) {
        unit.commandQueue.shift();
        // Decelerate when reaching destination
        unit.currentSpeed = 0;
        // Reset stuck timer on successful completion
        unit.stuckTimer = 0;
        unit.lastPosition = undefined;
        unit.jitterOffset = undefined;
        finalizeBladeTrail();
        return;
      }

      let direction = normalize(subtract(currentNode.position, unit.position));
      
      // Apply flocking behavior for smooth group movement (like StarCraft)
      direction = applyFlockingBehavior(unit, direction, state.units);
      
      // Try pathfinding if direct path might be blocked
      const alternativePath = findPathAroundObstacle(unit, currentNode.position, state.obstacles);
      if (alternativePath) {
        direction = alternativePath;
      }
      
      // If stuck, try jitter movement to wiggle out
      if (unit.jitterOffset !== undefined) {
        const jitteredDirection = applyJitterMovement(unit, direction, state.units, state.obstacles);
        if (jitteredDirection) {
          direction = jitteredDirection;
        }
      }
      
      // Update unit rotation to face movement direction
      updateUnitRotation(unit, direction, deltaTime);
      
      // Use constant top speed instead of acceleration
      const movement = scale(direction, def.moveSpeed * deltaTime);

      const moveDist = Math.min(distance(unit.position, add(unit.position, movement)), dist);
      const newPosition = add(unit.position, scale(direction, moveDist));

      // Apply local collision push to keep units from stacking at shared goals.
      const adjustedPosition = applyLocalCollisionPush(unit, newPosition, state.units);

      // Check for collisions with any obstacles (unit overlap handled by local push)
      const collisionResult = checkUnitCollisionBlocking(unit, adjustedPosition, state.units, state.obstacles);
      
      if (!collisionResult.blocked) {
        // Use the desired position when clear
        unit.position = adjustedPosition;
        
        // Check if mining drone is near a resource orb and can collect it
        if (unit.type === 'miningDrone' && unit.miningState && !unit.miningState.carryingOrb && state.resourceOrbs) {
          const orbCollectionRadius = UNIT_SIZE_METERS * MINING_DRONE_SIZE_MULTIPLIER * 0.8;
          const nearbyOrb = state.resourceOrbs.find(orb => 
            distance(unit.position, orb.position) < orbCollectionRadius
          );
          
          if (nearbyOrb) {
            // Collect the orb
            unit.miningState.carryingOrb = true;
            unit.miningState.targetOrbId = nearbyOrb.id;
            // Remove orb from game state
            state.resourceOrbs = state.resourceOrbs.filter(o => o.id !== nearbyOrb.id);
            // Clear movement queue and go to depot
            unit.commandQueue = [];
            const depot = state.miningDepots.find(d => d.id === unit.miningState?.depotId);
            if (depot) {
              unit.commandQueue.push({ type: 'move', position: depot.position });
              unit.miningState.atDepot = false;
            }
            // Deselect this worker so other selected workers don't automatically follow
            state.selectedUnits.delete(unit.id);
          }
        }
        
        // Check if mining drone at depot can deposit the orb
        if (unit.type === 'miningDrone' && unit.miningState && unit.miningState.carryingOrb) {
          const depot = state.miningDepots.find(d => d.id === unit.miningState?.depotId);
          if (depot && distance(unit.position, depot.position) < MINING_DEPOT_SIZE_METERS * 0.6) {
            // Deposit the orb
            unit.miningState.carryingOrb = false;
            unit.miningState.targetOrbId = undefined;
            // Add secondary resource to player
            if (!state.players[unit.owner].secondaryResource) {
              state.players[unit.owner].secondaryResource = 0;
            }
            state.players[unit.owner].secondaryResource! += 1;
            // Resume normal mining operations
            unit.miningState.atDepot = true;
          }
        }
        
        // Reset stuck timer and jitter - unit is making progress
        unit.stuckTimer = 0;
        unit.lastPosition = { ...unit.position };
        unit.jitterOffset = undefined;
      } else {
        // Collision detected - slow down
        unit.currentSpeed = Math.max(0, (unit.currentSpeed || 0) * COLLISION_DECELERATION_FACTOR);
        
        // Track stuck state
        updateStuckDetection(unit, deltaTime);
        finalizeBladeTrail();
        return;
      }

      const queueMovementNodes = unit.commandQueue.filter((n) => n.type === 'move').length;
      const creditMultiplier = 1.0 + QUEUE_BONUS_PER_NODE * queueMovementNodes;
      unit.distanceCredit += moveDist * creditMultiplier;

      while (unit.distanceCredit >= PROMOTION_DISTANCE_THRESHOLD) {
        unit.distanceCredit -= PROMOTION_DISTANCE_THRESHOLD;
        // Damage multiplier from movement disabled
        // unit.damageMultiplier *= PROMOTION_MULTIPLIER;
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
      
      if (hasUnitArrivedAtPosition(unit, currentNode.position, dist, state.units)) {
        unit.commandQueue.shift();
        unit.currentSpeed = 0;
        unit.stuckTimer = 0;
        unit.lastPosition = undefined;
        unit.jitterOffset = undefined;
        finalizeBladeTrail();
        return;
      }

      let direction = normalize(subtract(currentNode.position, unit.position));
      
      // Apply flocking behavior for smooth group movement
      direction = applyFlockingBehavior(unit, direction, state.units);

      // Try pathfinding if direct path might be blocked
      const alternativePath = findPathAroundObstacle(unit, currentNode.position, state.obstacles);
      if (alternativePath) {
        direction = alternativePath;
      }
      
      // If stuck, try jitter movement
      if (unit.jitterOffset !== undefined) {
        const jitteredDirection = applyJitterMovement(unit, direction, state.units, state.obstacles);
        if (jitteredDirection) {
          direction = jitteredDirection;
        }
      }

      // Update unit rotation to face movement direction
      updateUnitRotation(unit, direction, deltaTime);
      
      // Use constant top speed instead of acceleration
      const movement = scale(direction, def.moveSpeed * deltaTime);

      const moveDist = Math.min(distance(unit.position, add(unit.position, movement)), dist);
      const newPosition = add(unit.position, scale(direction, moveDist));

      // Apply local collision push to keep attack-move units flowing through crowds.
      const adjustedPosition = applyLocalCollisionPush(unit, newPosition, state.units);

      // Check for collisions with any obstacles (unit overlap handled by local push)
      const collisionResult = checkUnitCollisionBlocking(unit, adjustedPosition, state.units, state.obstacles);
      
      if (!collisionResult.blocked) {
        // Use the desired position when clear
        unit.position = adjustedPosition;
        // Reset stuck timer and jitter
        unit.stuckTimer = 0;
        unit.lastPosition = { ...unit.position };
        unit.jitterOffset = undefined;
      } else {
        // Collision detected - slow down
        unit.currentSpeed = Math.max(0, (unit.currentSpeed || 0) * COLLISION_DECELERATION_FACTOR);
        
        // Track stuck state
        updateStuckDetection(unit, deltaTime);
        finalizeBladeTrail();
        return;
      }

      const queueMovementNodes = unit.commandQueue.filter((n) => n.type === 'move' || n.type === 'attack-move').length;
      const creditMultiplier = 1.0 + QUEUE_BONUS_PER_NODE * queueMovementNodes;
      unit.distanceCredit += moveDist * creditMultiplier;

      while (unit.distanceCredit >= PROMOTION_DISTANCE_THRESHOLD) {
        unit.distanceCredit -= PROMOTION_DISTANCE_THRESHOLD;
        // Damage multiplier from movement disabled
        // unit.damageMultiplier *= PROMOTION_MULTIPLIER;
      }

      unit.distanceTraveled += moveDist;
    } else if (currentNode.type === 'ability') {
      const dist = distance(unit.position, currentNode.position);

      // Only execute the ability once the unit reaches the queued anchor.
      if (!hasUnitArrivedAtPosition(unit, currentNode.position, dist, state.units)) {
        moveUnitTowardPosition(state, unit, currentNode.position, deltaTime);
        finalizeBladeTrail();
        return;
      }

      // Reset movement state once the unit reaches its ability anchor.
      unit.currentSpeed = 0;
      unit.stuckTimer = 0;
      unit.lastPosition = undefined;
      unit.jitterOffset = undefined;

      const abilityNode: CommandNode = { ...currentNode, position: currentNode.position };
      executeAbility(state, unit, abilityNode);
      unit.commandQueue.shift();
    } else if (currentNode.type === 'patrol') {
      // Patrol: move to patrol point, then add return command to create loop
      const dist = distance(unit.position, currentNode.position);
      
      if (hasUnitArrivedAtPosition(unit, currentNode.position, dist, state.units)) {
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
        unit.stuckTimer = 0;
        unit.lastPosition = undefined;
        unit.jitterOffset = undefined;
        finalizeBladeTrail();
        return;
      }

      const def = UNIT_DEFINITIONS[unit.type];
      let direction = normalize(subtract(currentNode.position, unit.position));
      
      // Apply flocking behavior for smooth group patrol movement
      direction = applyFlockingBehavior(unit, direction, state.units);
      
      // Try pathfinding if direct path might be blocked
      const alternativePath = findPathAroundObstacle(unit, currentNode.position, state.obstacles);
      if (alternativePath) {
        direction = alternativePath;
      }
      
      // If stuck, try jitter movement
      if (unit.jitterOffset !== undefined) {
        const jitteredDirection = applyJitterMovement(unit, direction, state.units, state.obstacles);
        if (jitteredDirection) {
          direction = jitteredDirection;
        }
      }
      
      const movement = scale(direction, def.moveSpeed * deltaTime);
      
      // Update unit rotation to face movement direction
      updateUnitRotation(unit, direction, deltaTime);
      
      const moveDist = Math.min(distance(unit.position, add(unit.position, movement)), dist);
      const newPosition = add(unit.position, scale(direction, moveDist));

      // Apply local collision push to keep patrol units from clumping.
      const adjustedPosition = applyLocalCollisionPush(unit, newPosition, state.units);

      // Check for collisions with any obstacles (unit overlap handled by local push)
      const collisionResult = checkUnitCollisionBlocking(unit, adjustedPosition, state.units, state.obstacles);
      
      if (!collisionResult.blocked) {
        unit.position = adjustedPosition;
        // Reset stuck timer and jitter
        unit.stuckTimer = 0;
        unit.lastPosition = { ...unit.position };
        unit.jitterOffset = undefined;
      } else {
        // Track stuck state
        updateStuckDetection(unit, deltaTime);
        finalizeBladeTrail();
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
        // Damage multiplier from movement disabled
        // unit.damageMultiplier *= PROMOTION_MULTIPLIER;
      }

      unit.distanceTraveled += moveDist;
    } else if (currentNode.type === 'follow-path') {
      // Follow path: move along a series of waypoints
      if (currentNode.path.length === 0) {
        // Path complete - remove command
        unit.commandQueue.shift();
        unit.currentSpeed = 0;
        unit.stuckTimer = 0;
        unit.lastPosition = undefined;
        unit.jitterOffset = undefined;
        finalizeBladeTrail();
        return;
      }
      
      const def = UNIT_DEFINITIONS[unit.type];
      
      // Use a lookahead target to avoid slowing down or stalling at sharp bends.
      const reachRadius = Math.max(0.5, def.moveSpeed * 0.1);
      const lookaheadDistance = Math.max(1.5, def.moveSpeed * 0.4);
      const lookaheadTarget = getPathLookaheadTarget(
        unit.position,
        currentNode.path,
        lookaheadDistance,
        reachRadius
      );

      // If the path is consumed, clear the command immediately.
      if (currentNode.path.length === 0) {
        unit.commandQueue.shift();
        unit.currentSpeed = 0;
        unit.stuckTimer = 0;
        unit.lastPosition = undefined;
        unit.jitterOffset = undefined;
        finalizeBladeTrail();
        return;
      }

      const dist = distance(unit.position, lookaheadTarget);
      let direction = normalize(subtract(lookaheadTarget, unit.position));
      
      // Apply flocking behavior for smooth group movement along path
      // Pass true for isFollowingPath and the current direction as pathDirection
      // This enables path-aware flocking that reduces lateral separation
      direction = applyFlockingBehavior(unit, direction, state.units, true, direction);
      
      // Try pathfinding if direct path might be blocked
      const alternativePath = findPathAroundObstacle(unit, lookaheadTarget, state.obstacles);
      if (alternativePath) {
        direction = alternativePath;
      }
      
      // If stuck, try jitter movement
      if (unit.jitterOffset !== undefined) {
        const jitteredDirection = applyJitterMovement(unit, direction, state.units, state.obstacles);
        if (jitteredDirection) {
          direction = jitteredDirection;
        }
      }
      
      // Update unit rotation to face movement direction
      updateUnitRotation(unit, direction, deltaTime);
      
      // Use constant top speed
      const movement = scale(direction, def.moveSpeed * deltaTime);
      const moveDist = Math.min(distance(unit.position, add(unit.position, movement)), dist);
      const newPosition = add(unit.position, scale(direction, moveDist));
      
      // Apply local collision push
      const adjustedPosition = applyLocalCollisionPush(unit, newPosition, state.units);
      
      // Check for collisions
      const collisionResult = checkUnitCollisionBlocking(unit, adjustedPosition, state.units, state.obstacles);
      
      if (!collisionResult.blocked) {
        unit.position = adjustedPosition;
        unit.stuckTimer = 0;
        unit.lastPosition = { ...unit.position };
        unit.jitterOffset = undefined;
      } else {
        // Collision detected - slow down
        unit.currentSpeed = Math.max(0, (unit.currentSpeed || 0) * COLLISION_DECELERATION_FACTOR);
        updateStuckDetection(unit, deltaTime);
        finalizeBladeTrail();
        return;
      }
      
      // Track distance traveled
      const queueMovementNodes = unit.commandQueue.filter((n) => 
        n.type === 'move' || n.type === 'attack-move' || n.type === 'patrol' || n.type === 'follow-path'
      ).length;
      const creditMultiplier = 1.0 + QUEUE_BONUS_PER_NODE * queueMovementNodes;
      unit.distanceCredit += moveDist * creditMultiplier;
      
      while (unit.distanceCredit >= PROMOTION_DISTANCE_THRESHOLD) {
        unit.distanceCredit -= PROMOTION_DISTANCE_THRESHOLD;
        // Damage multiplier from movement disabled
        // unit.damageMultiplier *= PROMOTION_MULTIPLIER;
      }
      
      unit.distanceTraveled += moveDist;
    }

    finalizeBladeTrail();
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

  if (unit.swordSwing && now > unit.swordSwing.startTime + unit.swordSwing.duration * 1000) {
    const completedSwing = unit.swordSwing;
    const swingEndTime = completedSwing.startTime + completedSwing.duration * 1000;
    const isFinalSwing = completedSwing.swingNumber === 3;

    // Preserve the sword angle after each swing so it doesn't snap back to the rest pose.
    unit.swordSwingHold = {
      swingType: completedSwing.swingType,
      releaseTime: isFinalSwing ? swingEndTime + BLADE_SWORD_HOLD_RESET_DELAY * 1000 : undefined,
    };
    unit.swordSwing = undefined;
  }

  if (unit.swordSwingHold?.releaseTime && now >= unit.swordSwingHold.releaseTime) {
    // Clear the hold after the final swing linger so the sword returns to its resting angle.
    unit.swordSwingHold = undefined;
  }

  if (unit.swordSwingCombo) {
    const combo = unit.swordSwingCombo;

    // Clear completed combos once the post-combo pause has elapsed.
    if (combo.nextSwingNumber === 0 && now >= combo.resetAvailableTime) {
      unit.swordSwingCombo = undefined;
    }

    // Start the next swing when the combo is queued and the prior swing has finished.
    if (combo.nextSwingNumber > 0 && !unit.swordSwing && now >= combo.nextSwingTime) {
      const swingSettings = getBladeSwingSettings(combo.nextSwingNumber);

      // Reset any lingering hold so the next swing animates from the combo sequence.
      unit.swordSwingHold = undefined;
      unit.swordSwing = {
        startTime: now,
        duration: swingSettings.duration,
        direction: combo.direction,
        swingType: swingSettings.swingType,
        swingNumber: combo.nextSwingNumber,
      };

      // Apply Blade damage at the start of each swing to match the attack cadence.
      if (unit.type === 'warrior') {
        applyBladeSwingDamage(state, unit, unit.swordSwing);
      }

      if (combo.nextSwingNumber < 3) {
        // Queue the next swing after a brief pause to keep the combo readable.
        combo.nextSwingNumber += 1;
        combo.nextSwingTime = now + (swingSettings.duration + BLADE_SWORD_SWING_PAUSE) * 1000;
        combo.resetAvailableTime = combo.nextSwingTime;
      } else {
        // Lock the combo until the short reset pause completes after the final spin.
        combo.nextSwingNumber = 0;
        combo.resetAvailableTime = now + (swingSettings.duration + BLADE_SWORD_SEQUENCE_RESET_TIME) * 1000;
        combo.nextSwingTime = combo.resetAvailableTime;
      }
    }
  }

  if (unit.bladeVolley) {
    const volley = unit.bladeVolley;
    if (now >= volley.nextShotTime && volley.shotsFired < BLADE_KNIFE_ANGLES.length) {
      // Emit knives in quick succession using the stored volley direction and magnitude.
      const angleOffset = BLADE_KNIFE_ANGLES[volley.shotsFired];
      fireBladeKnife(state, unit, volley.direction, volley.magnitude, angleOffset);
      volley.shotsFired += 1;
      volley.nextShotTime = now + BLADE_KNIFE_SHOT_INTERVAL * 1000;
    }

    if (volley.shotsFired >= BLADE_KNIFE_ANGLES.length && now > volley.nextShotTime) {
      unit.bladeVolley = undefined;
    }
  }

  if (unit.daggerAmbush) {
    const ambush = unit.daggerAmbush;

    if (!ambush.knifeFired && now >= ambush.throwTime) {
      // Throw the ambush knife after the reveal delay.
      fireDaggerKnife(state, unit, ambush.direction);
      ambush.knifeFired = true;
    }

    if (now >= ambush.recloakTime) {
      // Reapply permanent cloak after the post-throw reveal window.
      unit.daggerAmbush = undefined;
      unit.cloaked = { endTime: Number.POSITIVE_INFINITY };
    }
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
          const shieldMultiplier = getShieldDamageMultiplier(state, enemy, 'ranged');
          const finalDamage = calculateDamageWithArmor(damage, enemy.armor, false, def.modifiers) * shieldMultiplier;
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
          const shieldMultiplier = getShieldDamageMultiplier(state, target, 'ranged');
          const finalDamage = calculateDamageWithArmor(missile.damage, target.armor, false, def.modifiers) * shieldMultiplier;
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
      // Reset speed when not moving
      if (base.currentSpeed !== undefined && base.currentSpeed > 0) {
        base.currentSpeed = Math.max(0, base.currentSpeed - DECELERATION_RATE * deltaTime);
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
      // Reset speed when reaching target
      base.currentSpeed = 0;
      return;
    }

    // Get base type definition for movement speed
    const baseTypeDef = BASE_TYPE_DEFINITIONS[base.baseType];
    if (!baseTypeDef.canMove) {
      // Stationary base cannot move
      base.movementTarget = null;
      base.currentSpeed = 0;
      return;
    }

    // Activate shield for assault base when moving
    if (base.baseType === 'assault' && !base.shieldActive) {
      base.shieldActive = { endTime: Date.now() + 10000 }; // Shield lasts while moving
    }

    const direction = normalize(subtract(base.movementTarget, base.position));
    // Use baseTypeDef moveSpeed if > 0, otherwise use faction baseMoveSpeed
    const moveSpeed = baseTypeDef.moveSpeed > 0 ? baseTypeDef.moveSpeed : FACTION_DEFINITIONS[base.faction].baseMoveSpeed;
    
    // Initialize base current speed if needed
    if (base.currentSpeed === undefined) {
      base.currentSpeed = 0;
    }
    
    // Apply acceleration/deceleration to base movement
    const targetSpeed = moveSpeed;
    const speedDiff = targetSpeed - base.currentSpeed;
    
    if (speedDiff > 0) {
      // Accelerating
      const acceleration = Math.min(ACCELERATION_RATE * deltaTime, speedDiff);
      base.currentSpeed += acceleration;
    } else if (speedDiff < 0) {
      // Decelerating (shouldn't happen while moving, but for completeness)
      const deceleration = Math.max(-DECELERATION_RATE * deltaTime, speedDiff);
      base.currentSpeed += deceleration;
    }
    
    // Apply minimum speed threshold
    if (base.currentSpeed < MIN_SPEED_THRESHOLD) {
      base.currentSpeed = 0;
    }
    
    const movement = scale(direction, base.currentSpeed * deltaTime);
    base.position = add(base.position, movement);
    
    // Update shield endTime to keep it active while moving (assault base)
    if (base.shieldActive) {
      base.shieldActive.endTime = Date.now() + 100; // Keep extending while moving
    }
  });
}

function updateStructures(state: GameState, deltaTime: number): void {
  state.structures.forEach((structure) => {
    const structureDef = STRUCTURE_DEFINITIONS[structure.type];
    
    // Update attack cooldown
    if (structure.attackCooldown === undefined) {
      structure.attackCooldown = 0;
    }
    
    if (structure.attackCooldown > 0) {
      structure.attackCooldown = Math.max(0, structure.attackCooldown - deltaTime);
    }
    
    // Offensive tower - attack nearby enemies
    if (structure.type === 'offensive' || 
        structure.type === 'faction-radiant' || 
        structure.type === 'faction-aurum' || 
        structure.type === 'faction-solari') {
      if (structure.attackCooldown === 0 && structureDef.attackType === 'ranged') {
        // Find closest enemy unit or base within range
        let closestTarget: { position: Vector2; isUnit: boolean; id: string } | null = null;
        let closestDist = Infinity;
        
        // Check enemy units
        state.units.forEach((unit) => {
          if (unit.owner !== structure.owner && isVisibleToPlayer(unit.position, state)) {
            const dist = distance(structure.position, unit.position);
            if (dist <= structureDef.attackRange && dist < closestDist) {
              closestDist = dist;
              closestTarget = { position: unit.position, isUnit: true, id: unit.id };
            }
          }
        });
        
        // Check enemy bases
        state.bases.forEach((targetBase) => {
          if (targetBase.owner !== structure.owner) {
            const dist = distance(structure.position, targetBase.position);
            if (dist <= structureDef.attackRange && dist < closestDist) {
              closestDist = dist;
              closestTarget = { position: targetBase.position, isUnit: false, id: targetBase.id };
            }
          }
        });
        
        // Fire at closest target
        if (closestTarget !== null) {
          const direction = normalize(subtract(closestTarget.position, structure.position));
          const projectile = projectilePool.acquire();
          projectile.position = { ...structure.position };
          projectile.velocity = scale(direction, PROJECTILE_SPEED);
          projectile.target = { ...closestTarget.position };
          projectile.damage = structureDef.attackDamage;
          projectile.owner = structure.owner;
          projectile.color = state.players[structure.owner].color;
          projectile.lifetime = PROJECTILE_LIFETIME;
          projectile.createdAt = Date.now();
          projectile.sourceUnit = structure.id;
          if (closestTarget.isUnit) {
            projectile.targetUnit = closestTarget.id;
          }
          state.projectiles.push(projectile);
          
          // Add muzzle flash effect
          createMuzzleFlash(state, structure.position, direction, state.players[structure.owner].color);
          
          // Set cooldown
          structure.attackCooldown = 1 / structureDef.attackRate;
        }
      }
    }
    
    // Defensive tower - provide shield to nearby allies
    if (structure.type === 'defensive') {
      const SHIELD_RADIUS = 8; // meters
      const SHIELD_DURATION = 1.0; // seconds
      
      // Activate shield periodically
      if (structure.attackCooldown === 0) {
        structure.shieldActive = {
          endTime: Date.now() + SHIELD_DURATION * 1000,
          radius: SHIELD_RADIUS,
        };
        
        // Apply shield damage reduction to nearby allies
        state.units.forEach((unit) => {
          if (unit.owner === structure.owner) {
            const dist = distance(structure.position, unit.position);
            if (dist <= SHIELD_RADIUS) {
              // Give temporary shield buff
              if (!unit.shieldActive || Date.now() > unit.shieldActive.endTime) {
                unit.shieldActive = {
                  endTime: Date.now() + SHIELD_DURATION * 1000,
                  radius: 0,
                  rangedDamageMultiplier: 0.5, // Reduce ranged damage by 50%
                  meleeDamageMultiplier: 0.8, // Reduce melee damage by 20%
                };
              }
            }
          }
        });
        
        structure.attackCooldown = 5; // Shield pulse every 5 seconds
      }
    }
  });
  
  // Remove destroyed structures with explosion effects
  state.structures = state.structures.filter(s => {
    if (s.hp <= 0) {
      // Create destruction explosion (2.5x scale for building explosions)
      createEnhancedDeathExplosion(state, s.position, state.players[s.owner].color, 2.5);
      return false;
    }
    return true;
  });
}

function executeAbility(state: GameState, unit: Unit, node: CommandNode): void {
  if (node.type !== 'ability') return;

  soundManager.playAbility();

  // Execute generic laser ability for all units except the Blade (warrior) who throws knives instead
  if (unit.type !== 'warrior') {
    executeGenericLaser(state, unit, node.direction);
  }
  // Ability cooldowns are temporarily disabled, so keep cooldown cleared.
  unit.abilityCooldown = 0;
  
  // Keep existing specific abilities as additional effects
  if (unit.type === 'marine') {
    createAbilityEffect(state, unit, node.position, 'burst-fire');
    executeBurstFire(state, unit, node.direction);
  } else if (unit.type === 'warrior') {
    createAbilityEffect(state, unit, node.position, 'blade-volley');
    executeBladeVolley(state, unit, node.direction);
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
    executeDaggerAmbush(state, unit, node.direction);
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
  } else if (unit.type === 'luminary') {
    createAbilityEffect(state, unit, node.position, 'gravity-well');
    executeGravityWell(state, unit, node.position);
  } else if (unit.type === 'photon') {
    createAbilityEffect(state, unit, node.position, 'chain-lightning');
    executeChainLightning(state, unit, node.direction);
  } else if (unit.type === 'starborn') {
    createAbilityEffect(state, unit, node.position, 'orbital-strike');
    executeOrbitalStrike(state, unit, node.position);
  } else if (unit.type === 'prism') {
    createAbilityEffect(state, unit, node.position, 'light-refraction');
    executeLightRefraction(state, unit, node.direction);
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
      const shieldMultiplier = getShieldDamageMultiplier(state, enemy, 'ranged');
      const finalDamage = damage * shieldMultiplier;
      enemy.hp -= finalDamage;
      createHitSparks(state, enemy.position, laserColor, 6);
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += finalDamage;
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

function executeBladeVolley(state: GameState, unit: Unit, direction: { x: number; y: number }): void {
  const now = Date.now();
  const magnitude = distance({ x: 0, y: 0 }, direction);
  const normalized = normalize(direction);

  // Store volley timing so updateAbilityEffects can emit knives in sequence.
  unit.bladeVolley = {
    startTime: now,
    direction: normalized,
    magnitude,
    scrunchEndTime: now + BLADE_KNIFE_SCRUNCH_DURATION * 1000,
    nextShotTime: now + BLADE_KNIFE_SCRUNCH_DURATION * 1000,
    shotsFired: 0,
  };
}

// Spawn a single throwing knife projectile for the Blade volley.
function fireBladeKnife(state: GameState, unit: Unit, direction: Vector2, magnitude: number, angleOffset: number): void {
  const clampedMagnitude = Math.min(magnitude, ABILITY_MAX_RANGE);
  const speedScale = clampedMagnitude / ABILITY_MAX_RANGE;
  const baseAngle = direction.x === 0 && direction.y === 0 ? 0 : Math.atan2(direction.y, direction.x);
  const angle = baseAngle + (angleOffset * Math.PI) / 180;
  const throwDirection = { x: Math.cos(angle), y: Math.sin(angle) };
  const throwRange = Math.max(0.5, clampedMagnitude);
  const targetPos = add(unit.position, scale(throwDirection, throwRange));
  const damage = BLADE_KNIFE_DAMAGE * unit.damageMultiplier;
  const projectile = createProjectile(state, unit, targetPos, undefined, {
    speed: BLADE_KNIFE_BASE_SPEED * speedScale,
    damage,
    kind: 'knife',
    lifetime: BLADE_KNIFE_LIFETIME,
    startOffset: BLADE_KNIFE_START_OFFSET,
  });

  state.projectiles.push(projectile);
}

// Spawn a single throwing knife projectile for the Dagger ambush ability.
function fireDaggerKnife(state: GameState, unit: Unit, direction: Vector2): void {
  const throwDirection = direction.x === 0 && direction.y === 0 ? { x: 1, y: 0 } : normalize(direction);
  const targetPos = add(unit.position, scale(throwDirection, DAGGER_KNIFE_RANGE));
  const damage = DAGGER_KNIFE_DAMAGE * unit.damageMultiplier;
  const projectile = createProjectile(state, unit, targetPos, undefined, {
    speed: DAGGER_KNIFE_SPEED,
    damage,
    kind: 'knife',
    lifetime: DAGGER_KNIFE_LIFETIME,
    startOffset: DAGGER_KNIFE_START_OFFSET,
  });

  state.projectiles.push(projectile);
}

function executeBurstFire(state: GameState, unit: Unit, direction: { x: number; y: number }): void {
  const def = UNIT_DEFINITIONS.marine;
  const shotDamage = 2 * unit.damageMultiplier;
  const maxRange = def.attackRange;

  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  const enemyBases = state.bases.filter((b) => b.owner !== unit.owner);

  const dir = normalize(direction);

  for (let i = 0; i < 10; i++) {
    if (!state.shells) {
      state.shells = [];
    }
    state.shells.push(createEjectedShell(unit, dir));

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
      const targetUnit = hitTarget as Unit;
      const shieldMultiplier = getShieldDamageMultiplier(state, targetUnit, 'ranged');
      const finalDamage = shotDamage * shieldMultiplier;
      targetUnit.hp -= finalDamage;
      
      // Create hit spark effect
      createHitSparks(state, hitTarget.position, state.players[unit.owner].color, 4);
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += finalDamage;
      }
    }
  }
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
    rangedDamageMultiplier: 0.5,
    meleeDamageMultiplier: 1,
  };
}

function executeDaggerAmbush(state: GameState, unit: Unit, direction: Vector2): void {
  const now = Date.now();

  // Reveal immediately, then schedule the delayed knife throw and recloak.
  unit.cloaked = undefined;
  unit.daggerAmbush = {
    throwTime: now + DAGGER_KNIFE_DELAY * 1000,
    recloakTime: now + (DAGGER_KNIFE_DELAY + DAGGER_REVEAL_AFTER_THROW) * 1000,
    direction: normalize(direction),
    knifeFired: false,
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
  const enemies = getTargetableEnemies(state, unit);
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
  const enemies = getTargetableEnemies(state, unit);
  
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
    const targetUnit = target as Unit;
    const damage = 50 * unit.damageMultiplier;
    const shieldMultiplier = getShieldDamageMultiplier(state, targetUnit, 'ranged');
    const finalDamage = damage * shieldMultiplier;
    targetUnit.hp -= finalDamage;
    createHitSparks(state, target.position, state.players[unit.owner].color, 8);
    createEnergyPulse(state, target.position, state.players[unit.owner].color, 1.5, 0.3);
    
    if (state.matchStats && unit.owner === 0) {
      state.matchStats.damageDealtByPlayer += finalDamage;
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
  const enemies = getTargetableEnemies(state, unit);
  
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
    meleeDamageMultiplier: 0.3,
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
    meleeDamageMultiplier: 0.3,
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

// Luminary - Gravity Well: Pull enemies toward a point and hold them briefly
function executeGravityWell(state: GameState, unit: Unit, targetPos: { x: number; y: number }): void {
  const PULL_RADIUS = 8; // Radius to detect enemies
  const PULL_FORCE = 0.8; // Strength of pull per frame
  const PULL_DURATION = 3000; // Duration in milliseconds
  const HOLD_RADIUS = 2.5; // Enemies within this radius are held in place
  
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  const affectedEnemies: Unit[] = [];
  
  // Find enemies in range
  enemies.forEach((enemy) => {
    if (distance(enemy.position, targetPos) <= PULL_RADIUS) {
      affectedEnemies.push(enemy);
    }
  });
  
  createEnergyPulse(state, targetPos, state.players[unit.owner].color, PULL_RADIUS, 0.5);
  
  // Apply pull effect over time
  const pullInterval = setInterval(() => {
    affectedEnemies.forEach((enemy) => {
      // Check if enemy still exists
      if (!state.units.includes(enemy)) return;
      
      const dist = distance(enemy.position, targetPos);
      
      // Hold enemies in place if they're at the center
      if (dist < HOLD_RADIUS) {
        enemy.currentSpeed = 0;
      } else {
        // Pull toward center
        const direction = normalize(subtract(targetPos, enemy.position));
        enemy.position.x += direction.x * PULL_FORCE;
        enemy.position.y += direction.y * PULL_FORCE;
        
        // Visual feedback
        if (Math.random() < 0.3) {
          createHitSparks(state, enemy.position, state.players[unit.owner].color, 2);
        }
      }
    });
  }, 50); // Update every 50ms for smooth pulling
  
  // End pull effect after duration
  setTimeout(() => {
    clearInterval(pullInterval);
    affectedEnemies.forEach((enemy) => {
      if (state.units.includes(enemy)) {
        enemy.currentSpeed = undefined; // Restore normal speed
      }
    });
    createEnergyPulse(state, targetPos, state.players[unit.owner].color, 3, 0.3);
  }, PULL_DURATION);
}

// Photon - Chain Lightning: Lightning that jumps between enemies
function executeChainLightning(state: GameState, unit: Unit, direction: { x: number; y: number }): void {
  const MAX_JUMPS = 5; // Maximum number of jumps
  const JUMP_RANGE = 6; // Maximum distance for jumps
  const BASE_DAMAGE = 30; // Base damage
  const DAMAGE_FALLOFF = 0.8; // Damage multiplier per jump
  
  const dir = normalize(direction);
  const enemies = state.units.filter((u) => u.owner !== unit.owner);
  
  // Find first target in direction
  let currentTarget: Unit | null = null;
  let shortestDist = Infinity;
  
  enemies.forEach((enemy) => {
    const toEnemy = subtract(enemy.position, unit.position);
    const dist = distance(unit.position, enemy.position);
    const projectedDist = toEnemy.x * dir.x + toEnemy.y * dir.y;
    const perpDist = Math.abs(toEnemy.x * dir.y - toEnemy.y * dir.x);
    
    // Check if enemy is in the general direction (within a cone)
    if (projectedDist > 0 && dist < 12 && perpDist < 3 && dist < shortestDist) {
      currentTarget = enemy;
      shortestDist = dist;
    }
  });
  
  if (!currentTarget) {
    createEnergyPulse(state, unit.position, state.players[unit.owner].color, 2, 0.3);
    return;
  }
  
  // Chain through targets
  const hitTargets = new Set<string>();
  let currentDamage = BASE_DAMAGE * unit.damageMultiplier;
  let jumpsRemaining = MAX_JUMPS;
  let lastPosition = unit.position;
  
  const processJump = (target: Unit) => {
    if (!target || hitTargets.has(target.id) || !state.units.includes(target)) {
      return null;
    }
    
    // Deal damage
    const shieldMultiplier = getShieldDamageMultiplier(state, target, 'ranged');
    const finalDamage = currentDamage * shieldMultiplier;
    target.hp -= finalDamage;
    hitTargets.add(target.id);
    
    // Visual effect
    createHitSparks(state, target.position, state.players[unit.owner].color, 8);
    
    // Track stats
    if (state.matchStats && unit.owner === 0) {
      state.matchStats.damageDealtByPlayer += finalDamage;
    }
    
    // Reduce damage for next jump
    currentDamage *= DAMAGE_FALLOFF;
    jumpsRemaining--;
    
    // Find next target
    if (jumpsRemaining > 0) {
      let nextTarget: Unit | null = null;
      let closestDist = Infinity;
      
      enemies.forEach((enemy) => {
        if (!hitTargets.has(enemy.id)) {
          const dist = distance(target.position, enemy.position);
          if (dist <= JUMP_RANGE && dist < closestDist) {
            nextTarget = enemy;
            closestDist = dist;
          }
        }
      });
      
      lastPosition = target.position;
      return nextTarget;
    }
    
    return null;
  };
  
  // Execute the chain
  let current: Unit | null = currentTarget;
  while (current && jumpsRemaining > 0) {
    current = processJump(current);
  }
  
  createEnergyPulse(state, lastPosition, state.players[unit.owner].color, 3, 0.6);
}

// Starborn - Orbital Strike: Call down a powerful beam from above at target location
function executeOrbitalStrike(state: GameState, unit: Unit, targetPos: { x: number; y: number }): void {
  const BEAM_DELAY = 1500; // Delay before beam impacts
  const BEAM_DURATION = 2000; // Duration of beam
  const BEAM_RADIUS = 2; // Radius of the beam
  const BEAM_DAMAGE = 50; // Base damage
  const BEAM_TICK_INTERVAL = 200; // Damage tick interval in ms
  
  // Visual telegraph
  unit.bombardmentActive = {
    endTime: Date.now() + BEAM_DELAY + BEAM_DURATION,
    targetPos,
    impactTime: Date.now() + BEAM_DELAY,
  };
  
  createEnergyPulse(state, targetPos, state.players[unit.owner].color, BEAM_RADIUS, 0.4);
  
  // Start dealing damage after delay
  setTimeout(() => {
    const damageInterval = setInterval(() => {
      const enemies = state.units.filter((u) => u.owner !== unit.owner);
      const enemyBases = state.bases.filter((b) => b.owner !== unit.owner);
      
      // Damage enemies in beam
      enemies.forEach((enemy) => {
        if (distance(enemy.position, targetPos) <= BEAM_RADIUS) {
          const tickDamage = (BEAM_DAMAGE / (BEAM_DURATION / BEAM_TICK_INTERVAL)) * unit.damageMultiplier;
          const shieldMultiplier = getShieldDamageMultiplier(state, enemy, 'ranged');
          const finalDamage = tickDamage * shieldMultiplier;
          enemy.hp -= finalDamage;
          
          if (Math.random() < 0.4) {
            createHitSparks(state, enemy.position, state.players[unit.owner].color, 3);
          }
          
          if (state.matchStats && unit.owner === 0) {
            state.matchStats.damageDealtByPlayer += finalDamage;
          }
        }
      });
      
      // Damage bases in beam
      enemyBases.forEach((base) => {
        if (distance(base.position, targetPos) <= BEAM_RADIUS) {
          const tickDamage = (BEAM_DAMAGE * 1.5) / (BEAM_DURATION / BEAM_TICK_INTERVAL) * unit.damageMultiplier;
          base.hp -= tickDamage;
          
          if (state.matchStats && unit.owner === 0) {
            state.matchStats.damageDealtByPlayer += tickDamage;
          }
        }
      });
      
      // Visual feedback
      if (Math.random() < 0.5) {
        createEnergyPulse(state, targetPos, state.players[unit.owner].color, BEAM_RADIUS * 0.8, 0.3);
      }
    }, BEAM_TICK_INTERVAL);
    
    // Stop dealing damage after duration
    setTimeout(() => {
      clearInterval(damageInterval);
      createEnergyPulse(state, targetPos, state.players[unit.owner].color, BEAM_RADIUS * 1.5, 0.6);
    }, BEAM_DURATION);
  }, BEAM_DELAY);
}

// Prism - Light Refraction: Split attacks into multiple beams that fan out
function executeLightRefraction(state: GameState, unit: Unit, direction: { x: number; y: number }): void {
  const NUM_BEAMS = 5; // Number of beams
  const SPREAD_ANGLE = Math.PI / 4; // 45 degrees total spread
  const BEAM_LENGTH = 9; // Length of each beam
  const BEAM_DAMAGE = 15; // Damage per beam
  
  const dir = normalize(direction);
  const baseAngle = Math.atan2(dir.y, dir.x);
  
  // Create multiple beams in a fan pattern
  for (let i = 0; i < NUM_BEAMS; i++) {
    const angleOffset = (i - (NUM_BEAMS - 1) / 2) * (SPREAD_ANGLE / (NUM_BEAMS - 1));
    const beamAngle = baseAngle + angleOffset;
    const beamDir = {
      x: Math.cos(beamAngle),
      y: Math.sin(beamAngle),
    };
    
    // Check for hits along this beam
    const enemies = state.units.filter((u) => u.owner !== unit.owner);
    enemies.forEach((enemy) => {
      const toEnemy = subtract(enemy.position, unit.position);
      const dist = distance(unit.position, enemy.position);
      
      if (dist > BEAM_LENGTH) return;
      
      const projectedDist = toEnemy.x * beamDir.x + toEnemy.y * beamDir.y;
      const perpDist = Math.abs(toEnemy.x * beamDir.y - toEnemy.y * beamDir.x);
      
      // Check if enemy is in this beam (narrow beam)
      if (projectedDist > 0 && projectedDist <= BEAM_LENGTH && perpDist < 0.5) {
        const damage = BEAM_DAMAGE * unit.damageMultiplier;
        const shieldMultiplier = getShieldDamageMultiplier(state, enemy, 'ranged');
        const finalDamage = damage * shieldMultiplier;
        enemy.hp -= finalDamage;
        createHitSparks(state, enemy.position, state.players[unit.owner].color, 4);
        
        if (state.matchStats && unit.owner === 0) {
          state.matchStats.damageDealtByPlayer += finalDamage;
        }
      }
    });
    
    // Visual effect for each beam
    const beamEndPos = {
      x: unit.position.x + beamDir.x * BEAM_LENGTH,
      y: unit.position.y + beamDir.y * BEAM_LENGTH,
    };
    createLaserParticles(state, unit.position, beamDir, BEAM_LENGTH, state.players[unit.owner].color);
  }
  
  createEnergyPulse(state, unit.position, state.players[unit.owner].color, 2, 0.5);
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
        meleeDamageMultiplier: 0.3,
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
    const enemyStructures = state.structures.filter((s) => s.owner !== unit.owner);

    let target: Unit | Base | import('./types').Structure | null = null;
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
      
      enemyStructures.forEach((structure) => {
        const dist = distance(unit.position, structure.position);
        const structureDef = STRUCTURE_DEFINITIONS[structure.type];
        const structureRadius = structureDef.size / 2;
        if (dist <= def.attackRange + structureRadius && dist < minDist) {
          minDist = dist;
          target = structure;
        }
      });
    }

    if (target) {
      performAttack(state, unit, target);
    }
  });
}

// Helper function to map combo swing number to animation settings.
function getBladeSwingSettings(swingNumber: number): { swingType: 'first' | 'second' | 'third'; duration: number } {
  if (swingNumber === 1) {
    return { swingType: 'first', duration: BLADE_SWORD_SWING_DURATION_FIRST };
  }

  if (swingNumber === 2) {
    return { swingType: 'second', duration: BLADE_SWORD_SWING_DURATION_SECOND };
  }

  return { swingType: 'third', duration: BLADE_SWORD_SWING_DURATION_THIRD };
}

// Helper function to queue the Blade sword swing animation with a 3-swing combo.
function createBladeSwing(unit: Unit, direction: Vector2): void {
  const now = Date.now();

  // If a combo is already running or cooling down, avoid restarting the swing sequence.
  if (unit.swordSwingCombo && now < unit.swordSwingCombo.resetAvailableTime) {
    return;
  }

  // Start (or restart) the combo so the update loop can play all three swings with pauses.
  unit.swordSwingCombo = {
    direction,
    nextSwingNumber: 1,
    nextSwingTime: now,
    resetAvailableTime: now,
  };
}

/**
 * Apply Blade combo damage for a single swing using a semicircle (swings 1-2) or full circle (swing 3).
 * @param state - Current game state for finding nearby enemies and bases
 * @param unit - Blade unit performing the swing
 * @param swing - Sword swing data including direction and swing number
 */
function applyBladeSwingDamage(state: GameState, unit: Unit, swing: { direction: Vector2; swingNumber: number }): void {
  const def = UNIT_DEFINITIONS[unit.type];
  const swingDirection = swing.direction.x === 0 && swing.direction.y === 0
    ? { x: Math.cos(unit.rotation ?? 0), y: Math.sin(unit.rotation ?? 0) }
    : normalize(swing.direction);
  const damage = def.attackDamage * unit.damageMultiplier;
  const useFullCircle = swing.swingNumber === 3;
  let closestTargetPos: Vector2 | null = null;
  let closestTargetDist = Number.POSITIVE_INFINITY;

  // Damage enemy units within the swing radius, filtering out cloaked and flying targets.
  state.units.forEach((enemy) => {
    if (enemy.owner === unit.owner || enemy.cloaked) {
      return;
    }

    const enemyDef = UNIT_DEFINITIONS[enemy.type];
    if (enemyDef.modifiers.includes('flying')) {
      return;
    }

    const dist = distance(unit.position, enemy.position);
    if (dist > def.attackRange) {
      return;
    }

    // For the first two swings, only hit targets in the forward semicircle.
    const dot = dist === 0 ? 0 : (enemy.position.x - unit.position.x) * swingDirection.x + (enemy.position.y - unit.position.y) * swingDirection.y;
    if (!useFullCircle && dot < 0) {
      return;
    }

    const shieldMultiplier = getShieldDamageMultiplier(state, enemy, 'melee');
    const finalDamage = damage * shieldMultiplier;
    enemy.hp -= finalDamage;
    createHitSparks(state, enemy.position, state.players[unit.owner].color, 6);

    if (dist < closestTargetDist) {
      closestTargetDist = dist;
      closestTargetPos = { ...enemy.position };
    }

    if (state.matchStats && unit.owner === 0) {
      state.matchStats.damageDealtByPlayer += finalDamage;
    }
  });

  // Damage enemy bases if the Blade can damage structures.
  if (def.canDamageStructures) {
    state.bases.forEach((base) => {
      if (base.owner === unit.owner) {
        return;
      }

      const baseRadius = BASE_SIZE_METERS / 2;
      const dist = distance(unit.position, base.position);
      if (dist > def.attackRange + baseRadius) {
        return;
      }

      // For the first two swings, only hit bases in the forward semicircle.
      const dot = (base.position.x - unit.position.x) * swingDirection.x + (base.position.y - unit.position.y) * swingDirection.y;
      if (!useFullCircle && dot < 0) {
        return;
      }

      // Skip damage when the base shield is active.
      if (base.shieldActive && Date.now() < base.shieldActive.endTime) {
        createHitSparks(state, base.position, state.players[base.owner].color, 12);
        return;
      }

      const prevHp = base.hp;
      base.hp -= damage;

      if (prevHp > 0 && base.hp < prevHp) {
        createImpactEffect(state, base.position, state.players[unit.owner].color, 2.5);
      }

      if (state.matchStats) {
        if (base.owner === 0) {
          state.matchStats.damageToPlayerBase += damage;
        } else {
          state.matchStats.damageToEnemyBase += damage;
        }

        if (unit.owner === 0) {
          state.matchStats.damageDealtByPlayer += damage;
        }
      }

      if (dist < closestTargetDist) {
        closestTargetDist = dist;
        closestTargetPos = { ...base.position };
      }
    });
  }

  // Trigger a melee impact effect toward the nearest valid target for feedback.
  if (closestTargetPos) {
    unit.meleeAttackEffect = {
      endTime: Date.now() + MELEE_EFFECT_DURATION * 1000,
      targetPos: { ...closestTargetPos },
    };
  }
}

// Helper function to perform an attack
function performAttack(state: GameState, unit: Unit, target: Unit | Base | import('./types').Structure): void {
  const def = UNIT_DEFINITIONS[unit.type];
  
  // Type guards for distinguishing target types
  const isUnit = (t: typeof target): t is Unit => 'type' in t && !('baseType' in t) && !('attackCooldown' in t && 'owner' in t && !('commandQueue' in t));
  const isBase = (t: typeof target): t is Base => 'baseType' in t;
  const isStructure = (t: typeof target): t is import('./types').Structure => !isUnit(t) && !isBase(t);
  
  // Reset attack cooldown
  unit.attackCooldown = 1.0 / def.attackRate;
  
  // Update rotation to face target
  const direction = normalize(subtract(target.position, unit.position));
  const targetRotation = Math.atan2(direction.y, direction.x);
  unit.rotation = targetRotation;
  
  if (def.attackType === 'ranged') {
    // Marines fire hitscan-style shots so bullets register instantly without visible travel.
    if (unit.type === 'marine') {
      applyInstantMarineHit(state, unit, target, direction);
    } else {
      // Spawn projectile for standard ranged attacks.
      const targetPos = target.position;
      const targetUnit = isUnit(target) ? target : undefined;
      const projectile = createProjectile(state, unit, targetPos, targetUnit);
      state.projectiles.push(projectile);
    }

    // Always eject a shell casing when a marine fires.
    if (unit.type === 'marine') {
      if (!state.shells) {
        state.shells = [];
      }
      state.shells.push(createEjectedShell(unit, direction));
    }
    
    // Create muzzle flash effect for visual feedback
    const color = state.players[unit.owner].color;
    createHitSparks(state, unit.position, color, 3);
    
    if (unit.owner === 0 && Math.random() < 0.3) {
      soundManager.playAttack();
    }
  } else if (def.attackType === 'melee') {
    if (unit.type === 'warrior') {
      // Blade uses a combo swing sequence, so damage is applied per swing instead of per target.
      createBladeSwing(unit, direction);
      return;
    }

    // Apply instant damage for melee and create visual effect
    let damage = def.attackDamage * unit.damageMultiplier;

    if (isUnit(target)) {
      const targetUnit = target;
      
      // Apply any active shield dome modifiers for melee hits.
      damage *= getShieldDamageMultiplier(state, targetUnit, 'melee');

      targetUnit.hp -= damage;
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += damage;
      }
      
      // Create melee attack visual effect
      unit.meleeAttackEffect = {
        endTime: Date.now() + MELEE_EFFECT_DURATION * 1000,
        targetPos: { ...targetUnit.position },
      };

      if (unit.type === 'warrior') {
        createBladeSwing(unit, direction);
      }
    } else if (isBase(target)) {
      const targetBase = target;
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

      if (unit.type === 'warrior') {
        createBladeSwing(unit, direction);
      }
    } else {
      // Target is a structure
      const targetStructure = target;
      const prevHp = targetStructure.hp;
      targetStructure.hp -= damage;
      
      // Create impact effect
      if (prevHp > 0 && targetStructure.hp < prevHp) {
        const color = state.players[unit.owner].color;
        createImpactEffect(state, targetStructure.position, color, 1.5);
      }
      
      if (state.matchStats && unit.owner === 0) {
        state.matchStats.damageDealtByPlayer += damage;
      }
      
      // Create melee attack visual effect
      unit.meleeAttackEffect = {
        endTime: Date.now() + MELEE_EFFECT_DURATION * 1000,
        targetPos: { ...targetStructure.position },
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
      
      // Create resource orb for all non-mining-drone units
      if (u.type !== 'miningDrone') {
        // Determine enemy color (the other player)
        const enemyColor = state.players[u.owner === 0 ? 1 : 0].color;
        createResourceOrb(state, u.position, color, enemyColor);
      }
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

  const unit: Unit = {
    id: generateId(),
    type,
    owner,
    position: spawnPos,
    hp: def.hp,
    maxHp: def.hp,
    armor: def.armor,
    commandQueue: [{ type: 'move', position: finalRallyPos }],
    damageMultiplier: 1.0,
    distanceTraveled: 0,
    distanceCredit: 0,
    abilityCooldown: 0,
    attackCooldown: 0, // Initialize attack cooldown
  };
  
  // Dagger units start permanently cloaked until they reveal for ambush attacks.
  if (type === 'scout') {
    unit.cloaked = { endTime: Number.POSITIVE_INFINITY };
  }

  // Initialize particles only for Solari faction units
  const solariUnits: Set<UnitType> = new Set(['flare', 'nova', 'eclipse', 'corona', 'supernova', 'zenith', 'pulsar', 'celestial', 'voidwalker', 'chronomancer', 'nebula', 'quasar', 'luminary', 'photon', 'starborn', 'prism']);
  
  if (solariUnits.has(type)) {
    const particleCounts: Partial<Record<UnitType, number>> = {
      flare: 10,
      nova: 16,
      eclipse: 12,
      corona: 18,
      supernova: 14,
      zenith: 12,
      pulsar: 14,
      celestial: 16,
      voidwalker: 12,
      chronomancer: 12,
      nebula: 14,
      quasar: 14,
      luminary: 13,
      photon: 11,
      starborn: 15,
      prism: 12,
    };
    unit.particles = createParticlesForUnit(unit, particleCounts[type] || 12);
  }

  state.units.push(unit);
  
  // Create spawn effect
  const color = state.players[owner].color;
  createSpawnEffect(state, spawnPos, color);
  createEnergyPulse(state, spawnPos, color, 2.0, 0.5);
  
  return true;
}
