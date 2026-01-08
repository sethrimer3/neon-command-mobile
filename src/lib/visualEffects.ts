/**
 * Enhanced visual effects system for aesthetic improvements
 */

import { GameState, Vector2, Unit } from './types';
import { generateId } from './gameUtils';

// Performance limits
const MAX_EXPLOSION_PARTICLES = 500; // Maximum particles to prevent performance issues
const MAX_HIT_SPARKS = 200;
const MAX_CELEBRATION_PARTICLES = 150;

// Spawn effect constants
const SPAWN_EFFECT_DURATION = 0.8; // seconds
const SPAWN_EFFECT_PARTICLE_COUNT = 20;
const SPAWN_EFFECT_RADIUS = 2; // meters

// Energy pulse constants
const ENERGY_PULSE_DURATION = 0.6; // seconds
const ENERGY_PULSE_MAX_RADIUS = 3; // meters

/**
 * Create a spawn effect when a unit is created
 */
export function createSpawnEffect(state: GameState, position: Vector2, color: string): void {
  if (!state.spawnEffects) {
    state.spawnEffects = [];
  }

  const spawnEffect = {
    id: generateId(),
    position: { ...position },
    color,
    startTime: Date.now(),
    duration: SPAWN_EFFECT_DURATION,
  };

  state.spawnEffects.push(spawnEffect);

  // Create energy pulse for spawn
  createEnergyPulse(state, position, color, ENERGY_PULSE_DURATION, ENERGY_PULSE_MAX_RADIUS);

  // Create particle burst
  createParticleBurst(state, position, color, SPAWN_EFFECT_PARTICLE_COUNT);
}

/**
 * Create an energy pulse effect
 */
export function createEnergyPulse(
  state: GameState, 
  position: Vector2, 
  color: string, 
  duration: number = ENERGY_PULSE_DURATION,
  maxRadius: number = ENERGY_PULSE_MAX_RADIUS
): void {
  if (!state.energyPulses) {
    state.energyPulses = [];
  }

  const pulse = {
    id: generateId(),
    position: { ...position },
    radius: 0,
    color,
    startTime: Date.now(),
    duration,
    maxRadius,
  };

  state.energyPulses.push(pulse);
}

/**
 * Create a burst of particles from a position
 */
export function createParticleBurst(
  state: GameState, 
  position: Vector2, 
  color: string, 
  count: number,
  speed: number = 5
): void {
  if (!state.explosionParticles) {
    state.explosionParticles = [];
  }

  // Check particle limit and skip if at max
  if (state.explosionParticles.length >= MAX_EXPLOSION_PARTICLES) {
    // Remove oldest particles to make room
    const toRemove = Math.max(0, state.explosionParticles.length + count - MAX_EXPLOSION_PARTICLES);
    state.explosionParticles.splice(0, toRemove);
  }

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const velocity = {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed,
    };

    const particle = {
      id: generateId(),
      position: { ...position },
      velocity,
      color,
      size: 0.1 + Math.random() * 0.15,
      lifetime: 0.5 + Math.random() * 0.5,
      createdAt: Date.now(),
      alpha: 1.0,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 10,
    };

    state.explosionParticles.push(particle);
  }
}

/**
 * Create hit spark effects when damage is dealt
 */
export function createHitSparks(
  state: GameState, 
  position: Vector2, 
  color: string, 
  count: number = 8
): void {
  if (!state.hitSparks) {
    state.hitSparks = [];
  }

  // Check particle limit
  if (state.hitSparks.length >= MAX_HIT_SPARKS) {
    const toRemove = Math.max(0, state.hitSparks.length + count - MAX_HIT_SPARKS);
    state.hitSparks.splice(0, toRemove);
  }

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const speed = 3 + Math.random() * 2;
    const velocity = {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed,
    };

    const spark = {
      id: generateId(),
      position: { ...position },
      velocity,
      color,
      size: 0.05 + Math.random() * 0.1,
      lifetime: 0.2 + Math.random() * 0.2,
      createdAt: Date.now(),
    };

    state.hitSparks.push(spark);
  }
}

/**
 * Create bounce particles for armored units
 * Bullets bounce off randomly within a 60-degree arc
 */
export function createBounceParticles(
  state: GameState,
  position: Vector2,
  incomingDirection: Vector2,
  color: string,
  count: number = 3
): void {
  if (!state.bounceParticles) {
    state.bounceParticles = [];
  }

  // Calculate the reflection direction (opposite of incoming)
  const reflectionAngle = Math.atan2(-incomingDirection.y, -incomingDirection.x);
  
  // 60-degree arc in radians (30 degrees on each side)
  const arcRange = Math.PI / 3; // 60 degrees
  
  for (let i = 0; i < count; i++) {
    // Random angle within the 60-degree arc
    const randomOffset = (Math.random() - 0.5) * arcRange;
    const bounceAngle = reflectionAngle + randomOffset;
    
    // Random speed for variety
    const speed = 4 + Math.random() * 3;
    const velocity = {
      x: Math.cos(bounceAngle) * speed,
      y: Math.sin(bounceAngle) * speed,
    };

    const particle = {
      id: generateId(),
      position: { ...position },
      velocity,
      color,
      size: 0.04 + Math.random() * 0.06,
      lifetime: 0.3 + Math.random() * 0.2,
      createdAt: Date.now(),
    };

    state.bounceParticles.push(particle);
  }
}

/**
 * Create enhanced death explosion with multiple layers
 */
export function createEnhancedDeathExplosion(
  state: GameState,
  position: Vector2,
  color: string,
  scale: number = 1.0
): void {
  // Create multiple particle bursts with varying speeds for layered effect
  createParticleBurst(state, position, color, 16 * scale, 8 * scale); // Fast burst
  createParticleBurst(state, position, color, 12 * scale, 4 * scale); // Medium burst
  createParticleBurst(state, position, color, 8 * scale, 2 * scale);  // Slow burst
  
  // Create expanding energy rings
  createEnergyPulse(state, position, color, 0.8, 2.5 * scale);
  
  // Secondary delayed pulse for extra impact
  setTimeout(() => {
    createEnergyPulse(state, position, color, 0.6, 1.8 * scale);
  }, 150);
}

/**
 * Create laser particle effects along a beam
 */
export function createLaserParticles(
  state: GameState,
  startPos: Vector2,
  direction: Vector2,
  length: number,
  color: string = 'oklch(0.70 0.30 320)'
): void {
  if (!state.explosionParticles) {
    state.explosionParticles = [];
  }

  const particleCount = Math.min(Math.floor(length * 3), 50); // Limit to 50 particles max
  
  for (let i = 0; i < particleCount; i++) {
    const progress = i / particleCount;
    const position = {
      x: startPos.x + direction.x * length * progress,
      y: startPos.y + direction.y * length * progress,
    };

    // Add some perpendicular spread
    const perpX = -direction.y;
    const perpY = direction.x;
    const spread = (Math.random() - 0.5) * 0.3;
    
    position.x += perpX * spread;
    position.y += perpY * spread;

    // Particles move outward from laser
    const velocity = {
      x: perpX * (Math.random() - 0.5) * 8 + direction.x * 2,
      y: perpY * (Math.random() - 0.5) * 8 + direction.y * 2,
    };

    const particle = {
      id: generateId(),
      position,
      velocity,
      color,
      size: 0.1 + Math.random() * 0.15,
      lifetime: 0.4 + Math.random() * 0.3,
      createdAt: Date.now() + i * 2, // Slight stagger
      alpha: 1.0,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 15,
    };

    state.explosionParticles.push(particle);
  }

  // Create energy pulse at start
  createEnergyPulse(state, startPos, color, 0.8, 3.0);
  
  // Create impact effect at end
  const endPos = {
    x: startPos.x + direction.x * length,
    y: startPos.y + direction.y * length,
  };
  createEnergyPulse(state, endPos, color, 0.6, 2.5);
  createParticleBurst(state, endPos, color, 25, 10);
}

/**
 * Create a screen flash effect for critical events
 */
export function createScreenFlash(
  state: GameState,
  color: string,
  intensity: number = 0.6,
  duration: number = 0.5
): void {
  state.screenFlash = {
    color,
    intensity,
    duration,
    startTime: Date.now(),
  };
}

/**
 * Create celebration particles for victory screen
 */
export function createCelebrationParticles(state: GameState, canvasWidth: number, canvasHeight: number): void {
  if (!state.celebrationParticles) {
    state.celebrationParticles = [];
  }

  // Create bursts of celebration particles from multiple positions
  const burstCount = 5;
  const particlesPerBurst = 20;

  for (let b = 0; b < burstCount; b++) {
    const burstX = (Math.random() * 0.6 + 0.2) * canvasWidth;
    const burstY = (Math.random() * 0.4 + 0.3) * canvasHeight;
    const burstPosition = { x: burstX / 20, y: burstY / 20 }; // Convert to game meters

    for (let i = 0; i < particlesPerBurst; i++) {
      const angle = (i / particlesPerBurst) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 5 + Math.random() * 8;
      const velocity = {
        x: Math.cos(angle) * speed,
        y: Math.sin(angle) * speed - 3, // Bias upward
      };

      // Randomize colors for celebration
      const colors = [
        'oklch(0.85 0.20 95)',  // Yellow
        'oklch(0.75 0.18 200)', // Cyan
        'oklch(0.70 0.20 140)', // Green
        'oklch(0.65 0.25 280)', // Purple
        'oklch(0.95 0.15 25)',  // Orange
      ];
      const color = colors[Math.floor(Math.random() * colors.length)];

      const particle = {
        id: generateId(),
        position: { ...burstPosition },
        velocity,
        color,
        size: 0.15 + Math.random() * 0.25,
        lifetime: 1.5 + Math.random() * 1.0,
        createdAt: Date.now() + b * 200, // Stagger bursts
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 8,
      };

      state.celebrationParticles.push(particle);
    }
  }

  // Create continuous fountain of particles from bottom
  const fountainParticles = 30;
  for (let i = 0; i < fountainParticles; i++) {
    const x = (0.3 + Math.random() * 0.4) * canvasWidth;
    const position = { x: x / 20, y: canvasHeight / 20 };
    
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI / 3;
    const speed = 10 + Math.random() * 8;
    const velocity = {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed,
    };

    const colors = [
      'oklch(0.85 0.20 95)',
      'oklch(0.75 0.18 200)',
      'oklch(0.70 0.20 140)',
    ];
    const color = colors[Math.floor(Math.random() * colors.length)];

    state.celebrationParticles.push({
      id: generateId(),
      position,
      velocity,
      color,
      size: 0.1 + Math.random() * 0.2,
      lifetime: 2.0 + Math.random() * 1.0,
      createdAt: Date.now() + Math.random() * 500,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 6,
    });
  }
}

/**
 * Update all visual effects
 */
export function updateVisualEffects(state: GameState, deltaTime: number): void {
  const now = Date.now();

  // Update energy pulses
  if (state.energyPulses) {
    state.energyPulses = state.energyPulses.filter((pulse) => {
      const elapsed = (now - pulse.startTime) / 1000;
      if (elapsed >= pulse.duration) {
        return false;
      }
      
      // Update pulse radius
      const progress = elapsed / pulse.duration;
      pulse.radius = pulse.maxRadius * progress;
      
      return true;
    });
  }

  // Update spawn effects
  if (state.spawnEffects) {
    state.spawnEffects = state.spawnEffects.filter((effect) => {
      const elapsed = (now - effect.startTime) / 1000;
      return elapsed < effect.duration;
    });
  }

  // Update explosion particles
  if (state.explosionParticles) {
    state.explosionParticles = state.explosionParticles.filter((particle) => {
      const elapsed = (now - particle.createdAt) / 1000;
      if (elapsed >= particle.lifetime) {
        return false;
      }

      // Update position
      particle.position.x += particle.velocity.x * deltaTime;
      particle.position.y += particle.velocity.y * deltaTime;

      // Apply gravity
      particle.velocity.y += 2 * deltaTime;

      // Apply damping
      particle.velocity.x *= 0.98;
      particle.velocity.y *= 0.98;

      // Update rotation
      if (particle.rotation !== undefined && particle.rotationSpeed !== undefined) {
        particle.rotation += particle.rotationSpeed * deltaTime;
      }

      // Fade out
      particle.alpha = 1.0 - (elapsed / particle.lifetime);

      return true;
    });
  }

  // Update hit sparks
  if (state.hitSparks) {
    state.hitSparks = state.hitSparks.filter((spark) => {
      const elapsed = (now - spark.createdAt) / 1000;
      if (elapsed >= spark.lifetime) {
        return false;
      }

      // Update position
      spark.position.x += spark.velocity.x * deltaTime;
      spark.position.y += spark.velocity.y * deltaTime;

      // Apply damping
      spark.velocity.x *= 0.95;
      spark.velocity.y *= 0.95;

      return true;
    });
  }

  // Update bounce particles
  if (state.bounceParticles) {
    state.bounceParticles = state.bounceParticles.filter((particle) => {
      const elapsed = (now - particle.createdAt) / 1000;
      if (elapsed >= particle.lifetime) {
        return false;
      }

      // Update position
      particle.position.x += particle.velocity.x * deltaTime;
      particle.position.y += particle.velocity.y * deltaTime;

      // Apply gravity
      particle.velocity.y += 3 * deltaTime;

      // Apply damping
      particle.velocity.x *= 0.96;
      particle.velocity.y *= 0.96;

      return true;
    });
  }

  // Update impact effects
  if (state.impactEffects) {
    state.impactEffects = state.impactEffects.filter((effect) => {
      const elapsed = (now - effect.startTime) / 1000;
      return elapsed < effect.duration;
    });
  }

  // Update damage numbers
  if (state.damageNumbers) {
    state.damageNumbers = state.damageNumbers.filter((dmg) => {
      const elapsed = (now - dmg.startTime) / 1000;
      if (elapsed >= dmg.duration) {
        return false;
      }

      // Float upward
      dmg.position.y -= 1 * deltaTime;

      return true;
    });
  }
  
  // Update celebration particles
  if (state.celebrationParticles) {
    state.celebrationParticles = state.celebrationParticles.filter((particle) => {
      const elapsed = (now - particle.createdAt) / 1000;
      if (elapsed >= particle.lifetime || elapsed < 0) {
        return false;
      }

      // Update position
      particle.position.x += particle.velocity.x * deltaTime;
      particle.position.y += particle.velocity.y * deltaTime;

      // Apply gravity
      particle.velocity.y += 8 * deltaTime;

      // Apply damping
      particle.velocity.x *= 0.98;
      particle.velocity.y *= 0.98;

      // Update rotation
      particle.rotation += particle.rotationSpeed * deltaTime;

      return true;
    });
  }
}

/**
 * Create charging/windup particle effect for abilities
 */
export function createAbilityCharge(
  state: GameState,
  position: Vector2,
  color: string,
  duration: number = 0.5
): void {
  if (!state.explosionParticles) {
    state.explosionParticles = [];
  }

  const particleCount = 12;
  
  // Check particle limit and skip if at max
  if (state.explosionParticles.length >= MAX_EXPLOSION_PARTICLES) {
    const toRemove = Math.max(0, state.explosionParticles.length + particleCount - MAX_EXPLOSION_PARTICLES);
    state.explosionParticles.splice(0, toRemove);
  }

  // Create converging particles that spiral into the position
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2;
    const startDistance = 3; // Start 3 meters away
    const startPos = {
      x: position.x + Math.cos(angle) * startDistance,
      y: position.y + Math.sin(angle) * startDistance,
    };
    
    // Velocity points towards center with spiral
    const spiralAngle = angle + Math.PI / 4;
    const velocity = {
      x: -Math.cos(spiralAngle) * (startDistance / duration),
      y: -Math.sin(spiralAngle) * (startDistance / duration),
    };

    const particle = {
      id: generateId(),
      position: startPos,
      velocity,
      color,
      size: 0.15,
      lifetime: duration,
      createdAt: Date.now(),
      alpha: 1.0,
      rotation: angle,
      rotationSpeed: 10,
    };

    state.explosionParticles.push(particle);
  }
}

/**
 * Create trail effect for fast-moving projectiles
 */
export function createTrailEffect(
  state: GameState,
  position: Vector2,
  velocity: Vector2,
  color: string
): void {
  if (!state.explosionParticles) {
    state.explosionParticles = [];
  }

  // Check particle limit before adding
  if (state.explosionParticles.length >= MAX_EXPLOSION_PARTICLES) {
    // Skip creating trail if at limit (trails are less critical than other effects)
    return;
  }

  // Create a trail particle behind the projectile
  const trailParticle = {
    id: generateId(),
    position: { ...position },
    velocity: { x: velocity.x * -0.2, y: velocity.y * -0.2 }, // Trail particles move slowly backward
    color,
    size: 0.08,
    lifetime: 0.3,
    createdAt: Date.now(),
    alpha: 0.6,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: 0,
  };

  state.explosionParticles.push(trailParticle);
}

/**
 * Create impact ripple effect
 */
export function createImpactRipple(
  state: GameState,
  position: Vector2,
  color: string,
  size: number = 2.0
): void {
  // Create multiple expanding rings with staggered start times
  for (let i = 0; i < 3; i++) {
    if (!state.energyPulses) {
      state.energyPulses = [];
    }
    
    const pulse = {
      id: generateId(),
      position: { ...position },
      radius: 0,
      color,
      startTime: Date.now() + i * 100, // Stagger the start times
      duration: 0.4,
      maxRadius: size,
    };
    
    state.energyPulses.push(pulse);
  }
  
  // Add impact particles
  createParticleBurst(state, position, color, 20, 8);
}

/**
 * Create healing sparkle particles
 */
export function createHealSparkles(
  state: GameState,
  position: Vector2,
  radius: number
): void {
  if (!state.explosionParticles) {
    state.explosionParticles = [];
  }

  const sparkleCount = 15;
  
  // Check particle limit before adding sparkles
  if (state.explosionParticles.length >= MAX_EXPLOSION_PARTICLES) {
    const toRemove = Math.max(0, state.explosionParticles.length + sparkleCount - MAX_EXPLOSION_PARTICLES);
    state.explosionParticles.splice(0, toRemove);
  }
  
  const now = Date.now();
  
  for (let i = 0; i < sparkleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    const sparklePos = {
      x: position.x + Math.cos(angle) * distance,
      y: position.y + Math.sin(angle) * distance,
    };
    
    // Sparkles float upward slowly
    const velocity = {
      x: (Math.random() - 0.5) * 0.5,
      y: -1 - Math.random() * 1.5,
    };

    const colors = [
      'oklch(0.80 0.20 140)', // Green
      'oklch(0.85 0.15 160)', // Light green
      'oklch(0.90 0.10 180)', // Cyan-green
    ];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const sparkle = {
      id: generateId(),
      position: sparklePos,
      velocity,
      color,
      size: 0.06 + Math.random() * 0.08,
      lifetime: 0.8 + Math.random() * 0.4,
      createdAt: now, // All created at same time
      alpha: 1.0,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 5,
    };

    state.explosionParticles.push(sparkle);
  }
}

/**
 * Create enhanced ability effect based on unit type
 */
export function createAbilityEffect(
  state: GameState,
  unit: Unit,
  position: Vector2,
  abilityType: string
): void {
  const color = unit.owner === 0 
    ? 'oklch(0.65 0.25 240)' 
    : 'oklch(0.62 0.28 25)';

  switch (abilityType) {
    case 'burst-fire':
      // Create rapid fire effect with charge-up
      createAbilityCharge(state, unit.position, color, 0.3);
      createEnergyPulse(state, unit.position, color, 0.3, 1.5);
      triggerBackgroundPush(unit.position, 8);
      break;
    
    case 'blade-volley':
      // Create a tight charge pulse to sell the blade compression
      createAbilityCharge(state, unit.position, color, 0.25);
      createEnergyPulse(state, unit.position, color, 0.4, 1.2);
      triggerBackgroundPush(unit.position, 6);
      break;
    
    case 'line-jump':
      // Create jump telegraph with charge particles
      createAbilityCharge(state, unit.position, 'oklch(0.75 0.18 200)', 0.4);
      createEnergyPulse(state, unit.position, 'oklch(0.75 0.18 200)', 0.5, 1);
      triggerBackgroundPush(unit.position, 6);
      break;
    
    case 'shield-dome':
      // Create shield activation with multiple pulses
      createEnergyPulse(state, unit.position, color, 0.5, 4);
      createEnergyPulse(state, unit.position, color, 0.7, 3.5);
      createParticleBurst(state, unit.position, color, 16, 4);
      triggerBackgroundPush(unit.position, 10);
      break;
    
    case 'cloak':
      // Create cloaking shimmer with inward particles
      createAbilityCharge(state, unit.position, color, 0.5);
      createParticleBurst(state, unit.position, color, 25, 3);
      triggerBackgroundPush(unit.position, 5);
      break;
    
    case 'bombardment':
      // Create targeting reticle effect with charge particles
      createAbilityCharge(state, position, 'oklch(0.70 0.30 25)', 0.6);
      createEnergyPulse(state, position, 'oklch(0.70 0.30 25)', 0.8, 3);
      triggerBackgroundPush(position, 12);
      break;
    
    case 'heal-pulse':
      // Create healing wave with sparkles
      createEnergyPulse(state, unit.position, 'oklch(0.70 0.20 140)', 0.6, 5);
      createEnergyPulse(state, unit.position, 'oklch(0.80 0.18 150)', 0.8, 4.5);
      createHealSparkles(state, unit.position, 3);
      triggerBackgroundPush(unit.position, 8);
      break;
    
    case 'missile-barrage':
      // Create launch effect with enhanced particles
      createEnergyPulse(state, unit.position, color, 0.4, 2);
      createParticleBurst(state, unit.position, color, 18, 8);
      createAbilityCharge(state, unit.position, color, 0.3);
      triggerBackgroundPush(unit.position, 10);
      break;
      
    case 'precision-shot':
      // Sniper-like charging effect
      createAbilityCharge(state, unit.position, color, 0.5);
      createEnergyPulse(state, unit.position, color, 0.3, 1.2);
      triggerBackgroundPush(unit.position, 7);
      break;
      
    case 'ground-slam':
      // Heavy impact effect
      createEnergyPulse(state, unit.position, color, 0.5, 3);
      createParticleBurst(state, unit.position, color, 30, 12);
      triggerBackgroundPush(unit.position, 15);
      break;
      
    case 'whirlwind':
      // Spinning particle effect
      createParticleBurst(state, unit.position, color, 25, 8);
      createEnergyPulse(state, unit.position, color, 0.6, 2.5);
      triggerBackgroundPush(unit.position, 9);
      break;
  }
}

/**
 * Trigger background particle push effect for menu screens
 * This will push galaxy formations and free particles when abilities are activated
 * Note: Only works when AnimatedBackground component is mounted (menu screens)
 */
export function triggerBackgroundPush(position: Vector2, force: number = 10): void {
  // Convert game coordinates to screen coordinates if needed
  // For now, we'll use the position as-is since this is primarily for menu effects
  // In the future, this could be enhanced to work with game-to-screen coordinate conversion
  
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('backgroundPush', {
      detail: { x: position.x, y: position.y, force }
    }));
  }
}
