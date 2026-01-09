import { Floater, Vector2, ARENA_WIDTH_METERS, ARENA_HEIGHT_METERS, GameState } from './types';
import { generateId, getArenaHeight } from './gameUtils';

// Floater constants
const FLOATER_COUNT = 25; // 20-30 floaters
const FLOATER_MIN_SIZE = 0.5;
const FLOATER_MAX_SIZE = 1.5;
const FLOATER_MIN_MASS = 0.5;
const FLOATER_MAX_MASS = 1.5;
const FLOATER_MIN_VELOCITY = 0.5; // meters per second
const FLOATER_MAX_VELOCITY = 2.0; // meters per second
const FLOATER_TARGET_OPACITY_MIN = 0.25;
const FLOATER_TARGET_OPACITY_MAX = 0.4;
const FLOATER_FADE_IN_SPEED = 0.3; // opacity increase per second
const FLOATER_TURBULENCE_STRENGTH = 0.5; // random drift strength
const FLOATER_DAMPING = 0.98; // velocity damping to keep speeds reasonable
const FLOATER_MAX_SPEED = 3.0; // maximum speed limit

// Connection constants
const CONNECTION_MAX_DISTANCE = 17.5; // 15-20 meters
const CONNECTION_MAX_PER_FLOATER = 4; // max 3-4 connections

// OKLCH color scheme - subtle blues/cyans at low saturation for sci-fi aesthetic
const FLOATER_COLORS = [
  'oklch(0.70 0.08 240)', // subtle blue
  'oklch(0.72 0.10 220)', // light blue
  'oklch(0.68 0.09 200)', // cyan
  'oklch(0.71 0.07 260)', // slight purple-blue
  'oklch(0.69 0.08 230)', // medium blue
];

/**
 * Initialize floaters distributed across the playfield
 */
export function initializeFloaters(): Floater[] {
  const floaters: Floater[] = [];
  const arenaHeight = getArenaHeight();
  
  for (let i = 0; i < FLOATER_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = FLOATER_MIN_VELOCITY + Math.random() * (FLOATER_MAX_VELOCITY - FLOATER_MIN_VELOCITY);
    
    floaters.push({
      id: generateId(),
      position: {
        x: Math.random() * ARENA_WIDTH_METERS,
        y: Math.random() * arenaHeight,
      },
      velocity: {
        x: Math.cos(angle) * speed,
        y: Math.sin(angle) * speed,
      },
      size: FLOATER_MIN_SIZE + Math.random() * (FLOATER_MAX_SIZE - FLOATER_MIN_SIZE),
      color: FLOATER_COLORS[Math.floor(Math.random() * FLOATER_COLORS.length)],
      opacity: 0, // Start invisible, will fade in
      mass: FLOATER_MIN_MASS + Math.random() * (FLOATER_MAX_MASS - FLOATER_MIN_MASS),
      targetOpacity: FLOATER_TARGET_OPACITY_MIN + Math.random() * (FLOATER_TARGET_OPACITY_MAX - FLOATER_TARGET_OPACITY_MIN),
    });
  }
  
  return floaters;
}

/**
 * Update floater physics and fade-in
 */
export function updateFloaters(state: GameState, deltaTime: number): void {
  if (!state.floaters) return;
  
  const arenaHeight = getArenaHeight();
  
  for (const floater of state.floaters) {
    // Apply velocity to position
    floater.position.x += floater.velocity.x * deltaTime;
    floater.position.y += floater.velocity.y * deltaTime;
    
    // Bounce off arena edges
    if (floater.position.x < 0) {
      floater.position.x = 0;
      floater.velocity.x = Math.abs(floater.velocity.x);
    } else if (floater.position.x > ARENA_WIDTH_METERS) {
      floater.position.x = ARENA_WIDTH_METERS;
      floater.velocity.x = -Math.abs(floater.velocity.x);
    }
    
    if (floater.position.y < 0) {
      floater.position.y = 0;
      floater.velocity.y = Math.abs(floater.velocity.y);
    } else if (floater.position.y > arenaHeight) {
      floater.position.y = arenaHeight;
      floater.velocity.y = -Math.abs(floater.velocity.y);
    }
    
    // Apply subtle random turbulence
    const turbulenceAngle = Math.random() * Math.PI * 2;
    const turbulenceForce = FLOATER_TURBULENCE_STRENGTH / floater.mass;
    floater.velocity.x += Math.cos(turbulenceAngle) * turbulenceForce * deltaTime;
    floater.velocity.y += Math.sin(turbulenceAngle) * turbulenceForce * deltaTime;
    
    // Apply damping to keep speeds reasonable
    floater.velocity.x *= FLOATER_DAMPING;
    floater.velocity.y *= FLOATER_DAMPING;
    
    // Clamp speed to maximum
    const speed = Math.sqrt(floater.velocity.x ** 2 + floater.velocity.y ** 2);
    if (speed > FLOATER_MAX_SPEED) {
      const scale = FLOATER_MAX_SPEED / speed;
      floater.velocity.x *= scale;
      floater.velocity.y *= scale;
    }
    
    // Gradually fade in opacity to target
    if (floater.opacity < floater.targetOpacity) {
      floater.opacity = Math.min(floater.targetOpacity, floater.opacity + FLOATER_FADE_IN_SPEED * deltaTime);
    }
  }
}

/**
 * Calculate connections between nearby floaters
 * Returns array of connection pairs with opacity based on distance
 */
export function calculateFloaterConnections(floaters: Floater[]): Array<{
  from: Floater;
  to: Floater;
  strength: number; // 0.0 to 1.0
}> {
  const connections: Array<{ from: Floater; to: Floater; strength: number }> = [];
  const connectionCounts = new Map<string, number>();
  
  // Initialize connection counts
  for (const floater of floaters) {
    connectionCounts.set(floater.id, 0);
  }
  
  // Check all pairs
  for (let i = 0; i < floaters.length; i++) {
    const floaterA = floaters[i];
    const countA = connectionCounts.get(floaterA.id) || 0;
    
    // Skip if already at max connections
    if (countA >= CONNECTION_MAX_PER_FLOATER) continue;
    
    for (let j = i + 1; j < floaters.length; j++) {
      const floaterB = floaters[j];
      const countB = connectionCounts.get(floaterB.id) || 0;
      
      // Skip if either floater is at max connections
      if (countB >= CONNECTION_MAX_PER_FLOATER) continue;
      
      // Calculate distance
      const dx = floaterB.position.x - floaterA.position.x;
      const dy = floaterB.position.y - floaterA.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Check if within connection range
      if (distance <= CONNECTION_MAX_DISTANCE) {
        // Calculate connection strength (1.0 at touching, 0.0 at max distance)
        const strength = 1.0 - (distance / CONNECTION_MAX_DISTANCE);
        
        connections.push({
          from: floaterA,
          to: floaterB,
          strength,
        });
        
        // Increment connection counts
        connectionCounts.set(floaterA.id, countA + 1);
        connectionCounts.set(floaterB.id, countB + 1);
        
        // Check if both floaters are now at max
        if (connectionCounts.get(floaterA.id)! >= CONNECTION_MAX_PER_FLOATER) {
          break;
        }
      }
    }
  }
  
  return connections;
}
