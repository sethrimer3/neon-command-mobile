import { Vector2, ARENA_WIDTH_METERS, ARENA_HEIGHT_METERS, ARENA_HEIGHT_METERS_MOBILE, PIXELS_PER_METER, RESOURCE_DEPOSIT_RING_RADIUS_METERS, UNIT_DEFINITIONS } from './types';

// Calculate viewport scale to fit the fixed arena to the viewport
let viewportScale = 1.0;
// Track the pixel offset for the letterboxed arena viewport
let viewportOffset: Vector2 = { x: 0, y: 0 };
// Track the pixel size of the arena viewport for camera math
let viewportDimensions = { width: 0, height: 0 };

// Detect whether we should rotate the playfield for desktop landscape setups
function shouldRotatePlayfield(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const isLandscape = window.innerWidth >= window.innerHeight;
  const hasFinePointer = window.matchMedia?.('(pointer: fine)').matches ?? false;
  return isLandscape && hasFinePointer;
}

// Provide the render-only rotation offset for the desktop playfield (in radians).
export function getPlayfieldRotationRadians(): number {
  // Rotate counter-clockwise on desktop landscape to match the rotated playfield view.
  return shouldRotatePlayfield() ? Math.PI / 2 : 0;
}

// Detect if we're on a mobile device (no fine pointer)
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const hasFinePointer = window.matchMedia?.('(pointer: fine)').matches ?? false;
  return !hasFinePointer;
}

// Get the appropriate arena height based on device type
export function getArenaHeight(): number {
  return isMobileDevice() ? ARENA_HEIGHT_METERS_MOBILE : ARENA_HEIGHT_METERS;
}

// Use portrait-oriented gameplay coordinates even when the playfield is rotated
export function shouldUsePortraitCoordinates(): boolean {
  if (shouldRotatePlayfield()) {
    return true;
  }

  return isPortraitOrientation();
}

export function updateViewportScale(width: number, height: number): void {
  // Validate inputs to prevent division by zero or invalid scale factors
  if (width <= 0 || height <= 0) {
    console.warn('Invalid viewport dimensions:', width, height);
    viewportScale = 1.0; // Fallback to 1:1 scale
    viewportOffset = { x: 0, y: 0 };
    viewportDimensions = { width, height };
    return;
  }
  
  // Swap arena dimensions when the playfield is rotated to keep it fully visible
  const shouldRotate = shouldRotatePlayfield();
  const arenaHeight = getArenaHeight();
  const arenaWidthMeters = shouldRotate ? arenaHeight : ARENA_WIDTH_METERS;
  const arenaHeightMeters = shouldRotate ? ARENA_WIDTH_METERS : arenaHeight;

  // Calculate scale factors for both dimensions
  const scaleX = width / (arenaWidthMeters * PIXELS_PER_METER);
  const scaleY = height / (arenaHeightMeters * PIXELS_PER_METER);
  
  // Use the smaller scale to ensure the entire arena fits in the viewport
  viewportScale = Math.min(scaleX, scaleY);
  
  // Calculate the letterboxed viewport size in pixels (post-rotation bounds)
  const viewportWidth = arenaWidthMeters * PIXELS_PER_METER * viewportScale;
  const viewportHeight = arenaHeightMeters * PIXELS_PER_METER * viewportScale;
  
  // Center the arena by computing the leftover margin on each axis
  viewportOffset = {
    x: (width - viewportWidth) / 2,
    y: (height - viewportHeight) / 2,
  };
  viewportDimensions = { width: viewportWidth, height: viewportHeight };
}

export function getViewportScale(): number {
  return viewportScale;
}

export function getViewportOffset(): Vector2 {
  // Return a copy to prevent accidental mutation of shared state
  return { ...viewportOffset };
}

export function getViewportDimensions(): { width: number; height: number } {
  // Return a copy to prevent accidental mutation of shared state
  return { ...viewportDimensions };
}

export function distance(a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function normalize(v: Vector2): Vector2 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function scale(v: Vector2, s: number): Vector2 {
  return { x: v.x * s, y: v.y * s };
}

export function add(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function metersToPixels(meters: number): number {
  return meters * PIXELS_PER_METER * viewportScale;
}

export function pixelsToMeters(pixels: number): number {
  return pixels / (PIXELS_PER_METER * viewportScale);
}

export function positionToPixels(pos: Vector2): Vector2 {
  // Anchor positions around the center so rotation stays aligned to the viewport
  const center = {
    x: viewportOffset.x + viewportDimensions.width / 2,
    y: viewportOffset.y + viewportDimensions.height / 2,
  };
  const arenaHeight = getArenaHeight();
  const arenaWidthPixels = ARENA_WIDTH_METERS * PIXELS_PER_METER * viewportScale;
  const arenaHeightPixels = arenaHeight * PIXELS_PER_METER * viewportScale;
  const dx = pos.x * PIXELS_PER_METER * viewportScale - arenaWidthPixels / 2;
  const dy = pos.y * PIXELS_PER_METER * viewportScale - arenaHeightPixels / 2;

  // Rotate the playfield for desktop landscape while preserving world coordinates
  if (shouldRotatePlayfield()) {
    // Rotate counter-clockwise so the arena's long edge spans the desktop width
    return {
      x: center.x - dy,
      y: center.y + dx,
    };
  }

  return {
    // Offset by the letterboxed viewport so arena stays centered
    x: center.x + dx,
    y: center.y + dy,
  };
}

export function pixelsToPosition(pixels: Vector2): Vector2 {
  // Anchor positions around the center so rotation stays aligned to the viewport
  const center = {
    x: viewportOffset.x + viewportDimensions.width / 2,
    y: viewportOffset.y + viewportDimensions.height / 2,
  };
  const arenaHeight = getArenaHeight();
  const arenaWidthPixels = ARENA_WIDTH_METERS * PIXELS_PER_METER * viewportScale;
  const arenaHeightPixels = arenaHeight * PIXELS_PER_METER * viewportScale;
  const dx = pixels.x - center.x;
  const dy = pixels.y - center.y;
  const scale = PIXELS_PER_METER * viewportScale;

  // Undo the desktop rotation before converting back to world coordinates
  if (shouldRotatePlayfield()) {
    // Invert the counter-clockwise rotation applied in positionToPixels
    return {
      x: (arenaWidthPixels / 2 + dy) / scale,
      y: (arenaHeightPixels / 2 - dx) / scale,
    };
  }

  return {
    // Remove the letterboxed viewport offset before converting to meters
    x: (dx + arenaWidthPixels / 2) / scale,
    y: (dy + arenaHeightPixels / 2) / scale,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export function isPortraitOrientation(): boolean {
  return window.innerHeight > window.innerWidth;
}

/**
 * Calculate the default rally point for a base, which is 10 meters toward the enemy base
 */
export function calculateDefaultRallyPoint(basePosition: Vector2, enemyBasePosition: Vector2): Vector2 {
  const toEnemy = subtract(enemyBasePosition, basePosition);
  const dist = Math.sqrt(toEnemy.x * toEnemy.x + toEnemy.y * toEnemy.y);
  
  // If bases are at same position or very close, default to a direction (right)
  if (dist < 0.1) {
    return add(basePosition, { x: 10, y: 0 });
  }
  
  const direction = normalize(toEnemy);
  return add(basePosition, scale(direction, 10));
}

export function generateTopographyLines(canvasWidth: number, canvasHeight: number): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const numLines = 15 + Math.floor(Math.random() * 10); // 15-25 lines
  
  for (let i = 0; i < numLines; i++) {
    // Generate random contour lines that go roughly horizontal across the screen
    const y = Math.random() * canvasHeight;
    const points: Array<{ x: number; y: number }> = [];
    
    // Create a wavy line with random segments
    const numSegments = 8 + Math.floor(Math.random() * 8); // 8-16 segments
    for (let j = 0; j <= numSegments; j++) {
      const x = (j / numSegments) * canvasWidth;
      const yOffset = (Math.random() - 0.5) * 80; // Random vertical offset
      points.push({ x, y: y + yOffset });
    }
    
    // Connect the points to create line segments
    for (let j = 0; j < points.length - 1; j++) {
      lines.push({
        x1: points[j].x,
        y1: points[j].y,
        x2: points[j + 1].x,
        y2: points[j + 1].y,
      });
    }
  }
  
  return lines;
}

export function generateStarfield(canvasWidth: number, canvasHeight: number): Array<{
  x: number;
  y: number;
  size: number;
  brightness: number;
  twinkleSpeed: number;
  twinkleOffset: number;
}> {
  // Starfield constants
  const MIN_STARS = 100;
  const STAR_COUNT_VARIANCE = 50;
  const STAR_SIZE_MIN = 0.5;
  const STAR_SIZE_VARIANCE = 2;
  const STAR_BRIGHTNESS_MIN = 0.3;
  const STAR_BRIGHTNESS_VARIANCE = 0.7;
  const STAR_TWINKLE_SPEED_MIN = 0.5;
  const STAR_TWINKLE_SPEED_VARIANCE = 2;
  
  const stars: Array<{
    x: number;
    y: number;
    size: number;
    brightness: number;
    twinkleSpeed: number;
    twinkleOffset: number;
  }> = [];
  
  const numStars = MIN_STARS + Math.floor(Math.random() * STAR_COUNT_VARIANCE);
  
  for (let i = 0; i < numStars; i++) {
    const size = Math.random() * Math.random() * STAR_SIZE_VARIANCE; // Quadratic distribution for more small stars
    stars.push({
      x: Math.random() * canvasWidth,
      y: Math.random() * canvasHeight,
      size: STAR_SIZE_MIN + size,
      brightness: STAR_BRIGHTNESS_MIN + Math.random() * STAR_BRIGHTNESS_VARIANCE,
      twinkleSpeed: STAR_TWINKLE_SPEED_MIN + Math.random() * STAR_TWINKLE_SPEED_VARIANCE,
      twinkleOffset: Math.random() * Math.PI * 2,
    });
  }
  
  return stars;
}

// Object pool for particle reuse to improve performance
class ParticlePool {
  private pool: any[] = [];
  private maxSize: number = 500; // Limit pool size
  
  get(): any {
    return this.pool.pop() || null;
  }
  
  release(particle: any): void {
    if (this.pool.length < this.maxSize) {
      // Reset particle properties for reuse
      particle.id = '';
      particle.position = { x: 0, y: 0 };
      particle.velocity = { x: 0, y: 0 };
      particle.alpha = 1;
      particle.lifetime = 0;
      particle.createdAt = 0;
      this.pool.push(particle);
    }
  }
  
  clear(): void {
    this.pool = [];
  }
}

export const particlePool = new ParticlePool();

// Cloud generation constants
const MIN_NEBULA_CLOUDS = 5;
const MAX_ADDITIONAL_CLOUDS = 5;

// Generate nebula clouds for atmospheric background effect
export function generateNebulaClouds(canvasWidth: number, canvasHeight: number): Array<{
  x: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
  driftSpeed: number;
}> {
  const clouds: Array<{
    x: number;
    y: number;
    size: number;
    color: string;
    opacity: number;
    driftSpeed: number;
  }> = [];
  
  const numClouds = MIN_NEBULA_CLOUDS + Math.floor(Math.random() * MAX_ADDITIONAL_CLOUDS);
  const colors = [
    'rgba(65, 105, 225, ', // Royal blue
    'rgba(138, 43, 226, ', // Blue violet
    'rgba(75, 0, 130, ', // Indigo
    'rgba(123, 104, 238, ', // Medium slate blue
    'rgba(72, 61, 139, ', // Dark slate blue
  ];
  
  for (let i = 0; i < numClouds; i++) {
    clouds.push({
      x: Math.random() * canvasWidth,
      y: Math.random() * canvasHeight,
      size: 100 + Math.random() * 200,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 0.05 + Math.random() * 0.1,
      driftSpeed: 0.5 + Math.random() * 1.5,
    });
  }
  
  return clouds;
}

// Create mining depots in the corners of the map
export function createMiningDepots(arenaWidth: number, arenaHeight: number): import('./types').MiningDepot[] {
  const depots: import('./types').MiningDepot[] = [];
  const depositDistance = RESOURCE_DEPOSIT_RING_RADIUS_METERS; // Distance from depot center to deposits
  const margin = 8; // Margin from edges of arena
  
  // Define the 4 corner positions for depots
  // 2 depots for player (owner 0) at bottom, 2 for enemy (owner 1) at top
  const corners = [
    { x: margin, y: margin, owner: 1 }, // Top-left (enemy side)
    { x: arenaWidth - margin, y: margin, owner: 1 }, // Top-right (enemy side)
    { x: margin, y: arenaHeight - margin, owner: 0 }, // Bottom-left (player side)
    { x: arenaWidth - margin, y: arenaHeight - margin, owner: 0 }, // Bottom-right (player side)
  ];
  
  corners.forEach((corner, index) => {
    const depotId = generateId();
    const deposits: import('./types').ResourceDeposit[] = [];
    
    // Create 8 resource deposits in a ring around the depot
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const depositPos = {
        x: corner.x + Math.cos(angle) * depositDistance,
        y: corner.y + Math.sin(angle) * depositDistance,
      };
      
      deposits.push({
        id: generateId(),
        position: depositPos,
        depotId: depotId,
        workerIds: [],
      });
    }
    
    depots.push({
      id: depotId,
      position: { x: corner.x, y: corner.y },
      owner: corner.owner,
      deposits: deposits,
    });
  });
  
  return depots;
}

// Create initial mining drones on diagonal deposits (X shape: positions 1, 3, 5, 7)
export function createInitialMiningDrones(miningDepots: import('./types').MiningDepot[]): import('./types').Unit[] {
  const drones: import('./types').Unit[] = [];
  const diagonalPositions = [1, 3, 5, 7]; // Diagonal positions in the 0-7 ring
  const droneDefinition = UNIT_DEFINITIONS.miningDrone;
  
  miningDepots.forEach((depot) => {
    diagonalPositions.forEach((depositIndex) => {
      const deposit = depot.deposits[depositIndex];
      if (deposit) {
        const droneId = generateId();
        const drone: import('./types').Unit = {
          id: droneId,
          type: 'miningDrone',
          owner: depot.owner,
          position: { ...deposit.position },
          hp: droneDefinition.hp,
          maxHp: droneDefinition.hp,
          armor: droneDefinition.armor,
          commandQueue: [],
          damageMultiplier: 1.0,
          distanceTraveled: 0,
          distanceCredit: 0,
          abilityCooldown: 0,
          miningState: {
            depotId: depot.id,
            depositId: deposit.id,
            atDepot: false, // Start at deposit
          },
        };
        
        drones.push(drone);
        
        // Register this drone in the deposit's worker list
        if (!deposit.workerIds) {
          deposit.workerIds = [];
        }
        deposit.workerIds.push(droneId);
      }
    });
  });
  
  return drones;
}

/**
 * Check if a position is visible to the player under fog of war
 * @param position - The position to check
 * @param state - The game state containing player units and bases
 * @returns true if the position is visible to the player
 */
export function isVisibleToPlayer(position: Vector2, state: import('./types').GameState): boolean {
  const { FOG_OF_WAR_VISION_RANGE } = require('./types');
  
  if (!state.settings.enableFogOfWar) {
    return true; // Fog of war disabled, everything is visible
  }
  
  // Player's base provides vision
  const playerBase = state.bases.find(b => b.owner === 0);
  if (playerBase && distance(playerBase.position, position) <= FOG_OF_WAR_VISION_RANGE) {
    return true;
  }
  
  // Player's units provide vision
  for (const unit of state.units) {
    if (unit.owner === 0 && distance(unit.position, position) <= FOG_OF_WAR_VISION_RANGE) {
      return true;
    }
  }
  
  return false;
}
