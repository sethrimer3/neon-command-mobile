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
  Particle,
  Projectile,
} from './types';
import { distance, normalize, scale, add, subtract, generateId } from './gameUtils';
import { checkObstacleCollision } from './maps';
import { soundManager } from './sound';

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

// Projectile constants
const PROJECTILE_SPEED = 15; // meters per second
const PROJECTILE_LIFETIME = 2.0; // seconds before projectile disappears
const MELEE_EFFECT_DURATION = 0.2; // seconds for melee attack visual
const LASER_BEAM_DURATION = 0.5; // seconds for laser beam visual

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
  
  return {
    id: generateId(),
    position: { ...sourceUnit.position },
    velocity: scale(direction, PROJECTILE_SPEED),
    target,
    damage,
    owner: sourceUnit.owner,
    color,
    lifetime: PROJECTILE_LIFETIME,
    createdAt: Date.now(),
    sourceUnit: sourceUnit.id,
    targetUnit: targetUnit?.id,
  };
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
            target.hp -= projectile.damage;
            createDamageNumber(state, projectile.position, projectile.damage, projectile.color);
            
            if (state.matchStats && projectile.owner === 0) {
              state.matchStats.damageDealtByPlayer += projectile.damage;
            }
          }
        } else {
          // Check for any unit hit in the area - only hit the first one found
          const enemies = state.units.filter((u) => u.owner !== projectile.owner && u.hp > 0);
          let hitEnemy = false;
          
          for (const enemy of enemies) {
            if (distance(enemy.position, projectile.position) < UNIT_SIZE_METERS / 2) {
              enemy.hp -= projectile.damage;
              createDamageNumber(state, projectile.position, projectile.damage, projectile.color);
              
              if (state.matchStats && projectile.owner === 0) {
                state.matchStats.damageDealtByPlayer += projectile.damage;
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
                base.hp -= projectile.damage;
                
                if (state.matchStats) {
                  if (base.owner === 0) {
                    state.matchStats.damageToPlayerBase += projectile.damage;
                  } else {
                    state.matchStats.damageToEnemyBase += projectile.damage;
                  }
                  
                  if (projectile.owner === 0) {
                    state.matchStats.damageDealtByPlayer += projectile.damage;
                  }
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
  
  // Remove collided/expired projectiles
  state.projectiles = state.projectiles.filter((p) => !projectilesToRemove.has(p.id));
}

export function updateGame(state: GameState, deltaTime: number): void {
  if (state.mode !== 'game') return;

  state.elapsedTime += deltaTime;

  updateIncome(state, deltaTime);
  updateUnits(state, deltaTime);
  updateBases(state, deltaTime);
  updateProjectiles(state, deltaTime);
  updateCombat(state, deltaTime);
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

function updateUnits(state: GameState, deltaTime: number): void {
  state.units.forEach((unit) => {
    if (unit.abilityCooldown > 0) {
      unit.abilityCooldown = Math.max(0, unit.abilityCooldown - deltaTime);
    }

    updateAbilityEffects(unit, state, deltaTime);
    
    // Update particle physics for marines
    if (unit.type === 'marine') {
      updateParticles(unit, deltaTime);
    }
    
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

    if (unit.commandQueue.length === 0) return;

    const currentNode = unit.commandQueue[0];

    if (currentNode.type === 'move') {
      const dist = distance(unit.position, currentNode.position);
      const def = UNIT_DEFINITIONS[unit.type];

      if (dist < 0.1) {
        unit.commandQueue.shift();
        return;
      }

      const direction = normalize(subtract(currentNode.position, unit.position));
      const movement = scale(direction, def.moveSpeed * deltaTime);

      const moveDist = Math.min(distance(unit.position, add(unit.position, movement)), dist);
      const newPosition = add(unit.position, scale(direction, moveDist));
      
      if (!checkObstacleCollision(newPosition, UNIT_SIZE_METERS / 2, state.obstacles)) {
        unit.position = newPosition;
      } else {
        unit.commandQueue.shift();
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
    } else if (currentNode.type === 'ability') {
      const dist = distance(unit.position, currentNode.position);
      if (dist > 0.1) {
        const def = UNIT_DEFINITIONS[unit.type];
        const direction = normalize(subtract(currentNode.position, unit.position));
        const movement = scale(direction, def.moveSpeed * deltaTime);
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
          const damage = 40 * unit.damageMultiplier * deltaTime;
          enemy.hp -= damage;
          
          if (state.matchStats && unit.owner === 0) {
            state.matchStats.damageDealtByPlayer += damage;
          }
        }
      });

      const enemyBases = state.bases.filter((b) => b.owner !== unit.owner);
      enemyBases.forEach((base) => {
        if (distance(base.position, unit.bombardmentActive!.targetPos) <= 3) {
          const damage = 80 * unit.damageMultiplier * deltaTime;
          base.hp -= damage;
          
          if (state.matchStats && unit.owner === 0) {
            state.matchStats.damageDealtByPlayer += damage;
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
          target.hp -= missile.damage;
          
          if (state.matchStats && unit.owner === 0) {
            state.matchStats.damageDealtByPlayer += missile.damage;
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

    if (!base.movementTarget) return;

    const dist = distance(base.position, base.movementTarget);
    if (dist < 0.1) {
      base.movementTarget = null;
      return;
    }

    const direction = normalize(subtract(base.movementTarget, base.position));
    const movement = scale(direction, 1.0 * deltaTime);
    base.position = add(base.position, movement);
  });
}

function executeAbility(state: GameState, unit: Unit, node: CommandNode): void {
  if (node.type !== 'ability') return;
  if (unit.abilityCooldown > 0) return;

  const def = UNIT_DEFINITIONS[unit.type];

  soundManager.playAbility();

  if (unit.type === 'marine') {
    executeBurstFire(state, unit, node.direction);
    unit.abilityCooldown = def.abilityCooldown;
  } else if (unit.type === 'warrior') {
    executeExecuteDash(state, unit, node.position);
    unit.abilityCooldown = def.abilityCooldown;
  } else if (unit.type === 'snaker') {
    unit.lineJumpTelegraph = {
      startTime: Date.now(),
      endPos: add(unit.position, scale(normalize(node.direction), Math.min(distance({ x: 0, y: 0 }, node.direction), 10))),
      direction: normalize(node.direction),
    };
    unit.abilityCooldown = def.abilityCooldown;
  } else if (unit.type === 'tank') {
    executeShieldDome(state, unit);
    unit.abilityCooldown = def.abilityCooldown;
  } else if (unit.type === 'scout') {
    executeCloak(state, unit);
    unit.abilityCooldown = def.abilityCooldown;
  } else if (unit.type === 'artillery') {
    executeArtilleryBombardment(state, unit, node.position);
    unit.abilityCooldown = def.abilityCooldown;
  } else if (unit.type === 'medic') {
    executeHealPulse(state, unit);
    unit.abilityCooldown = def.abilityCooldown;
  } else if (unit.type === 'interceptor') {
    executeMissileBarrage(state, unit, node.direction);
    unit.abilityCooldown = def.abilityCooldown;
  }
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
    const enemies = state.units.filter((u) => u.owner !== unit.owner && !u.cloaked);
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
      // Reset attack cooldown
      unit.attackCooldown = 1.0 / def.attackRate;
      
      if (def.attackType === 'ranged') {
        // Spawn projectile for ranged attacks
        const targetPos = target.position;
        const targetUnit = 'type' in target ? (target as Unit) : undefined;
        const projectile = createProjectile(state, unit, targetPos, targetUnit);
        state.projectiles.push(projectile);
        
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
  });

  const beforeFilter = state.units.length;
  const unitsByOwner = state.units.reduce((acc, u) => {
    acc[u.owner] = (acc[u.owner] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  
  const oldUnits = [...state.units];
  state.units = state.units.filter((u) => u.hp > 0);
  
  // Create impact effects for dead units and screen shake for multiple deaths
  const deadUnits = oldUnits.filter(u => u.hp <= 0);
  if (deadUnits.length > 0) {
    deadUnits.forEach(u => {
      const color = state.players[u.owner].color;
      createImpactEffect(state, u.position, color, 1.2);
      createExplosionParticles(state, u.position, color, 12);
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

function checkVictory(state: GameState): void {
  state.bases.forEach((base) => {
    if (base.hp <= 0) {
      soundManager.playBaseDestroyed();
      // Big screen shake for base destruction
      createScreenShake(state, SCREEN_SHAKE_BASE_DESTROY_INTENSITY, SCREEN_SHAKE_DURATION_LONG);
      // Big impact effect for base destruction
      const color = state.players[base.owner === 0 ? 1 : 0].color; // Use attacker's color
      createImpactEffect(state, base.position, color, 4.0);
      createExplosionParticles(state, base.position, color, 24);
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

  const unit: Unit = {
    id: generateId(),
    type,
    owner,
    position: spawnPos,
    hp: def.hp,
    maxHp: def.hp,
    commandQueue: [{ type: 'move', position: rallyPos }],
    damageMultiplier: 1.0,
    distanceTraveled: 0,
    distanceCredit: 0,
    abilityCooldown: 0,
    attackCooldown: 0, // Initialize attack cooldown
  };
  
  // Initialize particles for marines
  if (type === 'marine') {
    unit.particles = createParticlesForUnit(unit, 12); // Increased from 10 to 12 for more visible effect
  }

  state.units.push(unit);
  
  // Create spawn effect
  const color = state.players[owner].color;
  createSpawnEffect(state, spawnPos, color);
  createEnergyPulse(state, spawnPos, color, 2.0, 0.5);
  
  return true;
}
