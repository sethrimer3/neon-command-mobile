import {
  GameState,
  Unit,
  Base,
  BaseType,
  COLORS,
  UNIT_SIZE_METERS,
  BASE_SIZE_METERS,
  MINING_DEPOT_SIZE_METERS,
  RESOURCE_DEPOSIT_SIZE_METERS,
  MINING_DRONE_SIZE_MULTIPLIER,
  UNIT_DEFINITIONS,
  BLADE_SWORD_PARTICLE_COUNT,
  BLADE_SWORD_PARTICLE_SPACING_METERS,
  BLADE_SWORD_RANGE_METERS,
  LASER_RANGE,
  ABILITY_MAX_RANGE,
  ABILITY_LASER_DURATION,
  FACTION_DEFINITIONS,
  UnitType,
  UnitModifier,
  Vector2,
  CommandNode,
  ARENA_WIDTH_METERS,
  ARENA_HEIGHT_METERS,
  Floater,
  FOG_OF_WAR_VISION_RANGE,
} from './types';
import { positionToPixels, metersToPixels, distance, add, scale, normalize, subtract, getViewportOffset, getViewportDimensions, getArenaHeight, getPlayfieldRotationRadians, isVisibleToPlayer } from './gameUtils';
import { applyCameraTransform, removeCameraTransform, worldToScreen } from './camera';
import { Obstacle } from './maps';
import { MOTION_TRAIL_DURATION, QUEUE_FADE_DURATION, QUEUE_DRAW_DURATION, QUEUE_UNDRAW_DURATION } from './simulation';
import { getFormationName } from './formations';
import { calculateFloaterConnections } from './floaters';

// Asset base URL for all sprites
const assetBaseUrl = import.meta.env.BASE_URL;

// Load projectile sprites (projectile1-13)
const projectileSpritePaths: string[] = [];
for (let i = 1; i <= 13; i++) {
  projectileSpritePaths.push(`${assetBaseUrl}ASSETS/sprites/factions/radiant/projectiles/projectile${i}.svg`);
}

// Load laser sprites (3-part chain: beginning, middle, end)
const laserSpritePaths = {
  beginning: `${assetBaseUrl}ASSETS/sprites/factions/radiant/projectiles/laser1beginning.svg`,
  middle: `${assetBaseUrl}ASSETS/sprites/factions/radiant/projectiles/laser1middle.svg`,
  end: `${assetBaseUrl}ASSETS/sprites/factions/radiant/projectiles/laser1end.svg`,
};

// Sprite sizing constants so art assets scale consistently with gameplay units.
const UNIT_SPRITE_SCALE = 1.55;
const BASE_SPRITE_SCALE = 1.15;
const MINING_DRONE_SPRITE_SCALE = 1.35;
// Radiant sprites are authored facing "up" in texture space, so rotate to match the engine's forward direction.
const RADIANT_SPRITE_ROTATION_OFFSET = Math.PI / 2;

// Sprite asset paths for the Radiant faction (exclude "knots" files on purpose).
const radiantUnitSpritePaths: Partial<Record<UnitType, string>> = {
  marine: `${assetBaseUrl}ASSETS/sprites/factions/radiant/units/Marine.svg`,
  warrior: `${assetBaseUrl}ASSETS/sprites/factions/radiant/units/Blade.svg`,
  tank: `${assetBaseUrl}ASSETS/sprites/factions/radiant/units/Tank.svg`,
  scout: `${assetBaseUrl}ASSETS/sprites/factions/radiant/units/Dagger.svg`,
  artillery: `${assetBaseUrl}ASSETS/sprites/factions/radiant/units/Artillery.svg`,
  medic: `${assetBaseUrl}ASSETS/sprites/factions/radiant/units/Medic.svg`,
  interceptor: `${assetBaseUrl}ASSETS/sprites/factions/radiant/units/Interceptor.svg`,
  guardian: `${assetBaseUrl}ASSETS/sprites/factions/radiant/units/Guardian.svg`,
  marksman: `${assetBaseUrl}ASSETS/sprites/factions/radiant/units/Marksman.svg`,
  engineer: `${assetBaseUrl}ASSETS/sprites/factions/radiant/units/Engineer.svg`,
  skirmisher: `${assetBaseUrl}ASSETS/sprites/factions/radiant/units/skirmisher.svg`,
  paladin: `${assetBaseUrl}ASSETS/sprites/factions/radiant/units/Paladin.svg`,
};
const radiantBaseSpritePaths: Partial<Record<BaseType, string>> = {
  standard: `${assetBaseUrl}ASSETS/sprites/factions/radiant/bases/radiantBaseSimple.svg`,
  defense: `${assetBaseUrl}ASSETS/sprites/factions/radiant/bases/radiantBaseAdvanced.svg`,
};
const radiantMiningDroneSpritePath = `${assetBaseUrl}ASSETS/sprites/factions/radiant/mining/radiantMiningDrone.svg`;
// Cache sprite images so we only construct them once.
const spriteCache = new Map<string, HTMLImageElement>();
// Cache pre-tinted sprites so we can reuse colored variants across frames.
const tintedSpriteCache = new Map<string, HTMLCanvasElement>();
// Cache white outline sprites to avoid recreating them every frame.
const whiteOutlineSpriteCache = new Map<string, HTMLCanvasElement>();

// Create a canvas element for tinting without touching the main render surface.
const createTintCanvas = (): HTMLCanvasElement => {
  return document.createElement('canvas');
};

function getSpriteFromCache(path: string): HTMLImageElement {
  const cached = spriteCache.get(path);
  if (cached) {
    return cached;
  }
  const sprite = new Image();
  sprite.src = path;
  spriteCache.set(path, sprite);
  return sprite;
}

function isSpriteReady(sprite: HTMLImageElement): boolean {
  return sprite.complete && sprite.naturalWidth > 0;
}

/**
 * Creates (or reuses) a colorized sprite using an offscreen canvas to preserve transparency.
 * @param sprite - The base sprite image.
 * @param tintColor - The color used to tint white-shaded pixels.
 * @returns A canvas containing the tinted sprite.
 */
function getTintedSprite(sprite: HTMLImageElement, tintColor: string): HTMLCanvasElement | null {
  if (!isSpriteReady(sprite)) {
    return null;
  }

  const cacheKey = `${sprite.src}::${tintColor}`;
  const cached = tintedSpriteCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const canvas = createTintCanvas();
  canvas.width = sprite.naturalWidth;
  canvas.height = sprite.naturalHeight;
  const tintCtx = canvas.getContext('2d');
  if (!tintCtx) {
    return null;
  }

  // Draw the base sprite first so we can multiply the tint while keeping shading.
  tintCtx.clearRect(0, 0, canvas.width, canvas.height);
  tintCtx.drawImage(sprite, 0, 0);
  tintCtx.globalCompositeOperation = 'multiply';
  tintCtx.fillStyle = tintColor;
  tintCtx.fillRect(0, 0, canvas.width, canvas.height);
  // Reapply the sprite alpha so the tinted pixels only appear inside the silhouette.
  tintCtx.globalCompositeOperation = 'destination-in';
  tintCtx.drawImage(sprite, 0, 0);
  tintCtx.globalCompositeOperation = 'source-over';

  tintedSpriteCache.set(cacheKey, canvas);
  return canvas;
}

/**
 * Creates a white silhouette version of a sprite for outlining.
 * Uses caching to avoid recreating the same white outline multiple times.
 * @param sprite - The sprite image or canvas to outline.
 * @param spriteSource - The original sprite source for cache key (HTMLImageElement).
 * @param tintColor - The tint color used (for cache key).
 * @returns A canvas containing a white silhouette of the sprite.
 */
function getWhiteOutlineSprite(
  sprite: HTMLImageElement | HTMLCanvasElement,
  spriteSource: HTMLImageElement,
  tintColor: string
): HTMLCanvasElement {
  // Create a cache key that includes both sprite source and tint color
  const cacheKey = `${spriteSource.src}::${tintColor}::white`;
  
  // Check cache first
  const cached = whiteOutlineSpriteCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  const canvas = createTintCanvas();
  canvas.width = sprite.width;
  canvas.height = sprite.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return canvas;
  }
  
  // Draw the sprite
  ctx.drawImage(sprite, 0, 0);
  
  // Make it white by using composite operations
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  
  // Cache the result
  whiteOutlineSpriteCache.set(cacheKey, canvas);
  
  return canvas;
}

/**
 * Draws a sprite centered at the provided screen position with rotation, optional glow, and team tinting.
 * Includes a white outline around the sprite.
 * @param ctx - Canvas rendering context.
 * @param sprite - The sprite image to render.
 * @param center - Screen-space center point for the sprite.
 * @param size - Rendered sprite size in pixels.
 * @param rotation - Rotation in radians applied around the center.
 * @param tintColor - Team color used to tint white-shaded sprites.
 * @param enableGlow - Whether to apply a glow effect.
 */
function drawCenteredSprite(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLImageElement,
  center: Vector2,
  size: number,
  rotation: number,
  tintColor: string,
  enableGlow: boolean,
): void {
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(rotation);
  
  // Use a cached, tinted sprite so canvas composite operations don't affect the main scene.
  const tintedSprite = getTintedSprite(sprite, tintColor) ?? sprite;
  
  // Create white outline by drawing a white version of the sprite at offset positions
  const outlineWidth = 1.5; // Thin stroke width
  const whiteSprite = getWhiteOutlineSprite(tintedSprite, sprite, tintColor);
  
  // Draw white outline in 8 directions for a smooth outline
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const offsetX = Math.cos(angle) * outlineWidth;
    const offsetY = Math.sin(angle) * outlineWidth;
    ctx.drawImage(whiteSprite, -size / 2 + offsetX, -size / 2 + offsetY, size, size);
  }
  
  if (enableGlow) {
    // Apply glow so the base sprite gets a soft halo.
    ctx.shadowColor = tintColor;
    ctx.shadowBlur = 18;
  }
  
  // Draw the main sprite on top
  ctx.drawImage(tintedSprite, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function getUnitSizeMeters(unit: Unit): number {
  // Expand mining drones so their visuals match the larger resource structures.
  if (unit.type === 'miningDrone') {
    return UNIT_SIZE_METERS * MINING_DRONE_SIZE_MULTIPLIER;
  }

  return UNIT_SIZE_METERS;
}

function getRadiantUnitSpritePath(type: UnitType): string | null {
  return radiantUnitSpritePaths[type] ?? null;
}

function drawRadiantUnitSprite(
  ctx: CanvasRenderingContext2D,
  unit: Unit,
  screenPos: Vector2,
  color: string,
  state: GameState,
  renderRotation: number,
): boolean {
  if (unit.type === 'miningDrone') {
    const miningSprite = getSpriteFromCache(radiantMiningDroneSpritePath);
    if (!isSpriteReady(miningSprite)) {
      return false;
    }
    const spriteSize = metersToPixels(getUnitSizeMeters(unit)) * MINING_DRONE_SPRITE_SCALE;
    // Rotate mining drones so sprite-forward (up) matches the unit's forward direction.
    drawCenteredSprite(
      ctx,
      miningSprite,
      screenPos,
      spriteSize,
      renderRotation + RADIANT_SPRITE_ROTATION_OFFSET,
      color,
      !!state.settings.enableGlowEffects,
    );
    return true;
  }

  const spritePath = getRadiantUnitSpritePath(unit.type);
  if (!spritePath) {
    return false;
  }

  const sprite = getSpriteFromCache(spritePath);
  if (!isSpriteReady(sprite)) {
    return false;
  }

  const spriteSize = metersToPixels(getUnitSizeMeters(unit)) * UNIT_SPRITE_SCALE;
  // Rotate unit sprites so sprite-forward (up) matches the unit's forward direction.
  drawCenteredSprite(
    ctx,
    sprite,
    screenPos,
    spriteSize,
    renderRotation + RADIANT_SPRITE_ROTATION_OFFSET,
    color,
    !!state.settings.enableGlowEffects,
  );
  return true;
}

function drawRadiantBaseSprite(
  ctx: CanvasRenderingContext2D,
  base: Base,
  screenPos: Vector2,
  size: number,
  color: string,
  state: GameState,
): boolean {
  const spritePath = radiantBaseSpritePaths[base.baseType];
  if (!spritePath) {
    return false;
  }

  const sprite = getSpriteFromCache(spritePath);
  if (!isSpriteReady(sprite)) {
    return false;
  }

  const spriteSize = size * BASE_SPRITE_SCALE;
  drawCenteredSprite(ctx, sprite, screenPos, spriteSize, 0, color, !!state.settings.enableGlowEffects);
  return true;
}

// Helper function to get modifier icon emoji
function getModifierIcon(modifier: UnitModifier): string {
  switch (modifier) {
    case 'melee': return '⚔';
    case 'ranged': return '🏹';
    case 'flying': return '✈';
    case 'small': return '🐜';
    case 'healing': return '⚕';
  }
}

// FPS Counter constants
const FPS_GOOD_THRESHOLD = 55;
const FPS_OK_THRESHOLD = 30;
const FPS_COLOR_GOOD = 'oklch(0.70 0.20 140)';
const FPS_COLOR_OK = 'oklch(0.85 0.20 95)';
const FPS_COLOR_BAD = 'oklch(0.62 0.28 25)';

// Helper function to draw a star shape
function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outerRadius: number, innerRadius: number, points: number) {
  const step = Math.PI / points;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = i * step - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

// Helper function to draw a triangle shape (equilateral, pointing up)
function drawTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
  ctx.beginPath();
  // Point 1: Top (pointing up)
  ctx.moveTo(cx, cy - radius);
  // Point 2: Bottom right
  ctx.lineTo(cx + radius * Math.cos(Math.PI / 6), cy + radius * Math.sin(Math.PI / 6));
  // Point 3: Bottom left
  ctx.lineTo(cx - radius * Math.cos(Math.PI / 6), cy + radius * Math.sin(Math.PI / 6));
  ctx.closePath();
}

// Minimap constants
const MINIMAP_SIZE_RATIO = 0.2;
const MINIMAP_PADDING = 10;
const MINIMAP_BASE_SIZE = 8;
const MINIMAP_UNIT_SIZE = 2;
const MINIMAP_OBSTACLE_MIN_SIZE = 2;

// Culling constants
const OFFSCREEN_CULLING_MARGIN = 50; // pixels margin for culling off-screen objects

// Background floater constants
const FLOATER_BASE_RADIUS_METERS = 0.3; // Base size in meters for floater rendering

// Enhanced visual effect constants
const SELECTION_RING_EXPANSION_SPEED = 1.5; // Speed of expanding selection ring
const SELECTION_RING_MAX_SIZE = 1.8; // Maximum size multiplier for selection ring
const GLOW_PULSE_FREQUENCY = 1.5; // Hz for glow pulsing
const ABILITY_READY_PULSE_INTENSITY = 0.4; // Intensity of ability ready pulse
const MOTION_BLUR_SPEED_THRESHOLD = 1.5; // Minimum speed for motion blur to appear
const ABILITY_ARROW_LENGTH = 12; // Arrow length for ability command visualization
// Scale projectile visuals alongside unit sizing so bullets track the larger silhouettes.
const PROJECTILE_SIZE_METERS = UNIT_SIZE_METERS * 1.2;
const PROJECTILE_TRAIL_LENGTH_METERS = UNIT_SIZE_METERS * 0.9;
const PROJECTILE_OUTER_TRAIL_WIDTH_METERS = UNIT_SIZE_METERS * 0.3;

// Blade sword particle visuals
const BLADE_SWORD_PARTICLE_RADIUS_METERS = UNIT_SIZE_METERS * 0.18 * 0.75; // Reduce particle radius by 25% to keep the sword compact
const BLADE_SWORD_SWING_ARC = Math.PI * 1.2; // Wider arc for more visible swings
const BLADE_SWORD_WHIP_DELAY = 0.04; // seconds of delay per particle index for whip effect
const BLADE_SWORD_MOVEMENT_LAG_SECONDS = 0.1; // seconds of movement lag per particle index
// Blade sword rest position and swing arcs
const BLADE_SWORD_REST_ANGLE = -110 * Math.PI / 180; // 110 degrees clockwise from movement direction
const BLADE_SWORD_FIRST_SWING_ARC = 210 * Math.PI / 180; // 210 degree counterclockwise arc
const BLADE_SWORD_SECOND_SWING_ARC = 180 * Math.PI / 180; // 180 degree clockwise arc
const BLADE_SWORD_THIRD_SWING_ARC = 2 * Math.PI; // 360 degree full rotation
const PROJECTILE_INNER_TRAIL_WIDTH_METERS = UNIT_SIZE_METERS * 0.15;
const PROJECTILE_CORE_RADIUS_METERS = UNIT_SIZE_METERS * 0.25;
const PROJECTILE_CORE_INNER_RADIUS_METERS = UNIT_SIZE_METERS * 0.125;
// Scale unit-attached particle visuals with unit size for consistent glow and trails.
const UNIT_PARTICLE_BASE_SIZE_METERS = UNIT_SIZE_METERS * 0.15;
const UNIT_PARTICLE_TRAIL_WIDTH_METERS = UNIT_SIZE_METERS * 0.125;

// Helper function to get bright highlight color for team
function getTeamHighlightColor(owner: number): string {
  return owner === 0 
    ? 'oklch(0.95 0.15 240)' // Player color highlight
    : 'oklch(0.95 0.15 25)'; // Enemy color highlight
}

// Helper function to add alpha to color
function addAlphaToColor(color: string, alpha: number): string {
  // Handle OKLCH colors with optional alpha
  if (color.includes(' / ')) {
    // Replace existing alpha
    return color.replace(/ \/ [0-9.]+\)/, ` / ${alpha})`);
  } else if (color.endsWith(')')) {
    // Add alpha before closing parenthesis for OKLCH/RGB colors
    return color.slice(0, -1) + ` / ${alpha})`;
  }
  // For other color formats, return as-is and let canvas handle it with globalAlpha
  console.warn('Unexpected color format for alpha manipulation:', color);
  return color;
}

// Helper function to create a pale, bright line color based on the team's tint.
function getPaleBrightTeamColor(color: string, alpha: number): string {
  const oklchMatch = color.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+)?\)/);

  if (oklchMatch) {
    const lightness = Math.min(1, parseFloat(oklchMatch[1]) + 0.15);
    const chroma = Math.max(0, parseFloat(oklchMatch[2]) * 0.6);
    const hue = parseFloat(oklchMatch[3]);
    return `oklch(${lightness} ${chroma} ${hue} / ${alpha})`;
  }

  return addAlphaToColor(color, alpha);
}

// Helper function to get camera-adjusted positions for visibility tests and overlays
function getCameraAdjustedScreenPos(state: GameState, canvas: HTMLCanvasElement, worldPos: Vector2): Vector2 {
  const baseScreenPos = positionToPixels(worldPos);
  
  if (!state.camera) {
    return baseScreenPos;
  }
  
  return worldToScreen(baseScreenPos, state, canvas);
}

// Helper function to check if an object is visible on screen
function isOnScreen(
  position: Vector2,
  canvas: HTMLCanvasElement,
  state: GameState,
  margin: number = OFFSCREEN_CULLING_MARGIN
): boolean {
  const screenPos = getCameraAdjustedScreenPos(state, canvas, position);
  return screenPos.x >= -margin && 
         screenPos.x <= canvas.width + margin && 
         screenPos.y >= -margin && 
         screenPos.y <= canvas.height + margin;
}

// Helper function to conditionally apply glow/shadow effects based on settings
function applyGlowEffect(ctx: CanvasRenderingContext2D, state: GameState, color: string, blur: number): void {
  if (state.settings.enableGlowEffects) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
}

// Helper function to clear glow/shadow effects
function clearGlowEffect(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.settings.enableGlowEffects) {
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
}

// Helper function to create a radial gradient for fog of war vision
function createVisionGradient(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): CanvasGradient {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(0.7, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  return gradient;
}

// Helper function to draw fog of war overlay
function drawFogOfWar(ctx: CanvasRenderingContext2D, state: GameState, canvas: HTMLCanvasElement): void {
  if (!state.settings.enableFogOfWar) {
    return;
  }
  
  ctx.save();
  
  // Helper to get vision radius in pixels
  const getVisionRadius = () => metersToPixels(FOG_OF_WAR_VISION_RANGE) * (state.camera?.zoom || 1);
  
  // Step 1: Draw dim black fog for all unexplored areas (very dark, almost black)
  ctx.fillStyle = 'rgba(5, 5, 10, 0.92)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Step 2: Create an offscreen canvas for the explored mask
  const exploredCanvas = document.createElement('canvas');
  exploredCanvas.width = canvas.width;
  exploredCanvas.height = canvas.height;
  const exploredCtx = exploredCanvas.getContext('2d');
  if (!exploredCtx) {
    ctx.restore();
    return;
  }
  
  // Find player base once
  const playerBase = state.bases.find(b => b.owner === 0);
  const visionRadius = getVisionRadius();
  
  // Mark explored areas by drawing circles at player unit and base positions
  if (playerBase) {
    const screenPos = worldToScreen(playerBase.position, state, canvas);
    exploredCtx.fillStyle = 'rgba(255, 255, 255, 1)';
    exploredCtx.beginPath();
    exploredCtx.arc(screenPos.x, screenPos.y, visionRadius, 0, Math.PI * 2);
    exploredCtx.fill();
  }
  
  state.units.forEach(unit => {
    if (unit.owner === 0) {
      const screenPos = worldToScreen(unit.position, state, canvas);
      exploredCtx.fillStyle = 'rgba(255, 255, 255, 1)';
      exploredCtx.beginPath();
      exploredCtx.arc(screenPos.x, screenPos.y, visionRadius, 0, Math.PI * 2);
      exploredCtx.fill();
    }
  });
  
  // Use destination-out to remove black fog from explored areas
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(exploredCanvas, 0, 0);
  
  // Step 3: Draw purple fog over explored areas (but not currently visible)
  ctx.globalCompositeOperation = 'source-over';
  
  // Create a temporary canvas for purple fog
  const purpleCanvas = document.createElement('canvas');
  purpleCanvas.width = canvas.width;
  purpleCanvas.height = canvas.height;
  const purpleCtx = purpleCanvas.getContext('2d');
  if (purpleCtx) {
    // Use a brighter, more visible purple
    purpleCtx.fillStyle = 'rgba(80, 40, 120, 1)';
    purpleCtx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Clip it to explored areas
    purpleCtx.globalCompositeOperation = 'destination-in';
    purpleCtx.drawImage(exploredCanvas, 0, 0);
    
    // Draw it on main canvas with medium opacity
    ctx.globalAlpha = 0.65;
    ctx.drawImage(purpleCanvas, 0, 0);
    ctx.globalAlpha = 1.0;
  }
  
  // Draw swirling fog particles in explored areas
  if (state.fogParticles && state.settings.enableParticleEffects) {
    state.fogParticles.forEach(particle => {
      const screenPos = worldToScreen(particle.position, state, canvas);
      const size = metersToPixels(particle.size) * (state.camera?.zoom || 1);
      
      // Create purple particle with glow
      const gradient = ctx.createRadialGradient(screenPos.x, screenPos.y, 0, screenPos.x, screenPos.y, size * 2);
      gradient.addColorStop(0, `rgba(180, 120, 255, ${particle.opacity * 0.5})`);
      gradient.addColorStop(0.5, `rgba(140, 80, 220, ${particle.opacity * 0.25})`);
      gradient.addColorStop(1, 'rgba(80, 40, 150, 0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, size * 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  
  // Step 4: Cut out currently visible areas (clear vision)
  ctx.globalCompositeOperation = 'destination-out';
  
  // Draw vision circles for player base
  if (playerBase) {
    const screenPos = worldToScreen(playerBase.position, state, canvas);
    ctx.fillStyle = createVisionGradient(ctx, screenPos.x, screenPos.y, visionRadius);
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, visionRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Draw vision circles for player units
  state.units.forEach(unit => {
    if (unit.owner === 0) {
      const screenPos = worldToScreen(unit.position, state, canvas);
      ctx.fillStyle = createVisionGradient(ctx, screenPos.x, screenPos.y, visionRadius);
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, visionRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  
  ctx.restore();
}

export function renderGame(ctx: CanvasRenderingContext2D, state: GameState, canvas: HTMLCanvasElement, selectionRect?: { x1: number; y1: number; x2: number; y2: number } | null): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Apply screen shake if active
  let shakeX = 0;
  let shakeY = 0;
  if (state.screenShake) {
    const elapsed = (Date.now() - state.screenShake.startTime) / 1000;
    if (elapsed < state.screenShake.duration) {
      const progress = elapsed / state.screenShake.duration;
      const intensity = state.screenShake.intensity * (1 - progress); // Decay over time
      shakeX = (Math.random() - 0.5) * intensity;
      shakeY = (Math.random() - 0.5) * intensity;
      ctx.save();
      ctx.translate(shakeX, shakeY);
    } else {
      // Shake expired
      delete state.screenShake;
    }
  }

  drawBackground(ctx, canvas, state);
  
  // Draw background floaters (after background, before border)
  if (state.mode === 'game' || state.mode === 'countdown') {
    // Apply camera transform so the battlefield zooms/pans while the UI stays fixed
    if (state.camera) {
      applyCameraTransform(ctx, state, canvas);
    }
    drawBackgroundFloaters(ctx, state);
  }
  
  // Draw playfield border in game modes
  if (state.mode === 'game' || state.mode === 'countdown') {
    drawPlayfieldBorder(ctx, canvas);
  }

  if (state.mode === 'game' || state.mode === 'countdown') {
    drawObstacles(ctx, state);
    drawMiningDepots(ctx, state);
    drawResourceOrbs(ctx, state);
    drawBases(ctx, state);
    
    if (state.mode === 'game') {
      drawCommandQueues(ctx, state);
      drawMotionTrails(ctx, state);
      drawSpriteCornerTrails(ctx, state);
      drawProjectiles(ctx, state);
      drawShells(ctx, state);
      drawFieldParticles(ctx, state);
      drawUnits(ctx, state);
      drawExplosionParticles(ctx, state);
      drawHitSparks(ctx, state);
      drawBounceParticles(ctx, state);
      drawEnergyPulses(ctx, state);
      drawSpawnEffects(ctx, state);
      drawImpactEffects(ctx, state);
      drawDamageNumbers(ctx, state);
      drawSelectionIndicators(ctx, state);
      drawAbilityRangeIndicators(ctx, state);
      drawAbilityCastPreview(ctx, state);
      drawBaseAbilityPreview(ctx, state);
      drawVisualFeedback(ctx, state);
      
      // Draw fog of war overlay (before camera transform is removed)
      if (state.settings.enableFogOfWar) {
        drawFogOfWar(ctx, state, canvas);
      }
    }
    
    // Remove camera transform so screen-space UI does not zoom/pan
    if (state.camera) {
      removeCameraTransform(ctx);
    }
    
    if (state.mode === 'game') {
      if (selectionRect) {
        drawSelectionRect(ctx, selectionRect, state);
      }
      drawOffscreenZoomIndicators(ctx, state, canvas);
      drawHUD(ctx, state);
      drawMinimap(ctx, state, canvas);
    }
  }
  
  // Draw celebration particles for victory screen
  if (state.mode === 'victory') {
    drawCelebrationParticles(ctx, state);
  }
  
  // Restore context if shake was applied
  if (state.screenShake && (Date.now() - state.screenShake.startTime) / 1000 < state.screenShake.duration) {
    ctx.restore();
  }
  
  // Draw screen flash effect on top of everything
  if (state.screenFlash) {
    const elapsed = (Date.now() - state.screenFlash.startTime) / 1000;
    if (elapsed < state.screenFlash.duration) {
      const progress = elapsed / state.screenFlash.duration;
      const alpha = state.screenFlash.intensity * (1 - progress); // Fade out
      
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = state.screenFlash.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    } else {
      // Flash expired
      delete state.screenFlash;
    }
  }
}

// Draw off-screen unit/base indicators when zoomed in
function drawOffscreenZoomIndicators(ctx: CanvasRenderingContext2D, state: GameState, canvas: HTMLCanvasElement): void {
  if (!state.camera || state.camera.zoom <= 1.05) {
    return;
  }
  
  const viewportOffset = getViewportOffset();
  const viewportDimensions = getViewportDimensions();
  const bounds = {
    left: viewportOffset.x,
    right: viewportOffset.x + viewportDimensions.width,
    top: viewportOffset.y,
    bottom: viewportOffset.y + viewportDimensions.height,
  };
  
  // Fallback to full canvas when viewport dimensions are unavailable
  if (viewportDimensions.width === 0 || viewportDimensions.height === 0) {
    bounds.left = 0;
    bounds.right = canvas.width;
    bounds.top = 0;
    bounds.bottom = canvas.height;
  }
  
  const center = {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
  };
  
  const drawIndicator = (screenPos: Vector2, color: string, radius: number): void => {
    const dx = screenPos.x - center.x;
    const dy = screenPos.y - center.y;
    
    if (dx === 0 && dy === 0) {
      return;
    }
    
    const tX = dx > 0 ? (bounds.right - center.x) / dx : (bounds.left - center.x) / dx;
    const tY = dy > 0 ? (bounds.bottom - center.y) / dy : (bounds.top - center.y) / dy;
    const t = Math.min(tX, tY);
    const edgePoint = { x: center.x + dx * t, y: center.y + dy * t };
    
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    // Center the indicator on the edge so half the circle is clipped off-screen
    ctx.beginPath();
    ctx.arc(edgePoint.x, edgePoint.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  
  // Draw unit indicators first so bases stand out on top
  state.units.forEach((unit) => {
    const screenPos = getCameraAdjustedScreenPos(state, canvas, unit.position);
    const isVisible = screenPos.x >= bounds.left &&
      screenPos.x <= bounds.right &&
      screenPos.y >= bounds.top &&
      screenPos.y <= bounds.bottom;
    
    if (isVisible) {
      return;
    }
    
    drawIndicator(screenPos, state.players[unit.owner].color, 7);
  });
  
  state.bases.forEach((base) => {
    const screenPos = getCameraAdjustedScreenPos(state, canvas, base.position);
    const isVisible = screenPos.x >= bounds.left &&
      screenPos.x <= bounds.right &&
      screenPos.y >= bounds.top &&
      screenPos.y <= bounds.bottom;
    
    if (isVisible) {
      return;
    }
    
    drawIndicator(screenPos, state.players[base.owner].color, 12);
  });
}

function drawBackground(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, state?: GameState): void {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw nebula clouds for atmospheric effect
  if (state?.nebulaClouds && state.nebulaClouds.length > 0) {
    const time = Date.now() / 1000;
    state.nebulaClouds.forEach(cloud => {
      // Create slow drifting effect
      const driftX = Math.sin(time * cloud.driftSpeed * 0.1) * 20;
      const driftY = Math.cos(time * cloud.driftSpeed * 0.15) * 15;
      
      ctx.save();
      ctx.globalAlpha = cloud.opacity;
      
      // Create radial gradient for cloud
      const gradient = ctx.createRadialGradient(
        cloud.x + driftX, cloud.y + driftY, 0,
        cloud.x + driftX, cloud.y + driftY, cloud.size
      );
      gradient.addColorStop(0, cloud.color + (cloud.opacity * 0.8) + ')');
      gradient.addColorStop(0.5, cloud.color + (cloud.opacity * 0.4) + ')');
      gradient.addColorStop(1, cloud.color + '0)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(
        cloud.x + driftX - cloud.size,
        cloud.y + driftY - cloud.size,
        cloud.size * 2,
        cloud.size * 2
      );
      
      ctx.restore();
    });
  }

  // Draw animated starfield
  if (state?.stars && state.stars.length > 0) {
    const time = Date.now() / 1000;
    state.stars.forEach(star => {
      const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset) * 0.3 + 0.7;
      const alpha = star.brightness * twinkle;
      
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
      
      // Add subtle glow for larger stars
      if (star.size > 1.5 && state?.settings?.enableGlowEffects) {
        ctx.shadowColor = `rgba(200, 220, 255, ${alpha * 0.6})`;
        ctx.shadowBlur = star.size * 3;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });
  }

  // Draw topography lines if available
  if (state?.topographyLines && state.topographyLines.length > 0) {
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.15)'; // Gray with low opacity
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    state.topographyLines.forEach(line => {
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
      ctx.stroke();
    });
  }
}

/**
 * Draw background floaters with connecting lines
 * Should be called after drawBackground but before drawPlayfieldBorder
 */
function drawBackgroundFloaters(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Skip if floaters are undefined or disabled
  if (!state.floaters || state.floaters.length === 0) {
    return;
  }
  
  ctx.save();
  
  // Calculate connections between nearby floaters
  const connections = calculateFloaterConnections(state.floaters);
  
  // Draw connections first (lines)
  connections.forEach(connection => {
    const fromPixels = positionToPixels(connection.from.position);
    const toPixels = positionToPixels(connection.to.position);
    
    // Alpha based on connection strength (max 0.25 for connections)
    const alpha = connection.strength * 0.25;
    
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    // Line width scaled by viewport (~1-2px)
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(fromPixels.x, fromPixels.y);
    ctx.lineTo(toPixels.x, toPixels.y);
    ctx.stroke();
  });
  
  // Draw floaters second (hollow circles)
  state.floaters.forEach(floater => {
    const screenPos = positionToPixels(floater.position);
    
    // Radius scaled by floater.size and viewport (3-8 pixels typical)
    // Use metersToPixels to properly scale with viewport, with safety checks
    const scaledRadius = floater.size * metersToPixels(FLOATER_BASE_RADIUS_METERS);
    const radius = Math.max(3, Math.abs(scaledRadius)); // Ensure minimum 3px and positive
    
    // Stroke width proportional to radius (~20% of radius)
    const strokeWidth = Math.max(0.5, radius * 0.2);
    
    // White stroke at low opacity
    const alpha = floater.opacity * 0.3;
    if (alpha <= 0) return; // Skip if not visible yet
    
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = strokeWidth;
    
    // Draw hollow circle (stroke only, no fill)
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  });
  
  ctx.restore();
}

function drawPlayfieldBorder(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  // Use the letterboxed viewport offset so the border aligns with the arena
  const viewportOffset = getViewportOffset();
  const viewportDimensions = getViewportDimensions();
  // Use the rotated viewport dimensions so the border hugs the visible arena
  const playfieldWidthPixels = viewportDimensions.width || metersToPixels(ARENA_WIDTH_METERS);
  const playfieldHeightPixels = viewportDimensions.height || metersToPixels(getArenaHeight());
  
  // Border thickness is 1 meter
  const borderThickness = metersToPixels(1);
  
  ctx.save();
  
  // Draw the main border
  ctx.fillStyle = COLORS.borderMain;
  
  // Top border
  ctx.fillRect(viewportOffset.x, viewportOffset.y, playfieldWidthPixels, borderThickness);
  
  // Bottom border
  ctx.fillRect(
    viewportOffset.x,
    viewportOffset.y + playfieldHeightPixels - borderThickness,
    playfieldWidthPixels,
    borderThickness,
  );
  
  // Left border
  ctx.fillRect(viewportOffset.x, viewportOffset.y, borderThickness, playfieldHeightPixels);
  
  // Right border
  ctx.fillRect(
    viewportOffset.x + playfieldWidthPixels - borderThickness,
    viewportOffset.y,
    borderThickness,
    playfieldHeightPixels,
  );
  
  // Add inner highlight for depth effect
  // The inner rectangle is inset by borderThickness on all sides (2 * borderThickness for width/height)
  ctx.strokeStyle = COLORS.borderHighlight;
  ctx.lineWidth = 2;
  ctx.strokeRect(
    viewportOffset.x + borderThickness,
    viewportOffset.y + borderThickness,
    playfieldWidthPixels - borderThickness * 2,
    playfieldHeightPixels - borderThickness * 2,
  );
  
  // Add subtle outer shadow for depth effect
  ctx.strokeStyle = COLORS.borderShadow;
  ctx.lineWidth = 1;
  ctx.strokeRect(viewportOffset.x, viewportOffset.y, playfieldWidthPixels, playfieldHeightPixels);
  
  ctx.restore();
}

function drawObstacles(ctx: CanvasRenderingContext2D, state: GameState): void {
  state.obstacles.forEach((obstacle) => {
    // Skip drawing boundary obstacles (they're invisible)
    if (obstacle.type === 'boundary') return;
    
    const screenPos = positionToPixels(obstacle.position);
    const width = metersToPixels(obstacle.width);
    const height = metersToPixels(obstacle.height);

    ctx.save();
    ctx.translate(screenPos.x, screenPos.y);
    ctx.rotate(obstacle.rotation);

    if (obstacle.type === 'wall') {
      ctx.fillStyle = 'oklch(0.30 0.15 240)';
      ctx.strokeStyle = 'oklch(0.55 0.22 240)';
      ctx.lineWidth = 2;
      
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.strokeRect(-width / 2, -height / 2, width, height);
      
      applyGlowEffect(ctx, state, 'oklch(0.55 0.22 240)', 15);
      ctx.strokeRect(-width / 2, -height / 2, width, height);
      clearGlowEffect(ctx, state);
    } else if (obstacle.type === 'pillar') {
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, width / 2);
      gradient.addColorStop(0, 'oklch(0.45 0.20 280)');
      gradient.addColorStop(1, 'oklch(0.25 0.15 280)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, width / 2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = 'oklch(0.65 0.25 280)';
      ctx.lineWidth = 2;
      applyGlowEffect(ctx, state, 'oklch(0.65 0.25 280)', 20);
      ctx.stroke();
      clearGlowEffect(ctx, state);
    } else if (obstacle.type === 'debris') {
      ctx.fillStyle = 'oklch(0.35 0.12 25)';
      ctx.strokeStyle = 'oklch(0.58 0.20 25)';
      ctx.lineWidth = 1.5;
      
      ctx.beginPath();
      ctx.moveTo(-width / 2, -height / 3);
      ctx.lineTo(width / 3, -height / 2);
      ctx.lineTo(width / 2, height / 3);
      ctx.lineTo(-width / 3, height / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'oklch(0.58 0.20 25)';
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  });
}

function drawMiningDepots(ctx: CanvasRenderingContext2D, state: GameState): void {
  const DEPOT_SIZE = MINING_DEPOT_SIZE_METERS; // meters
  const DEPOSIT_SIZE = RESOURCE_DEPOSIT_SIZE_METERS; // meters
  
  state.miningDepots.forEach((depot) => {
    const depotScreenPos = positionToPixels(depot.position);
    const depotWidth = metersToPixels(DEPOT_SIZE);
    const depotHeight = metersToPixels(DEPOT_SIZE);

    // Draw the snapped mining preview line when dragging from this depot
    if (state.miningDragPreview?.depotId === depot.id) {
      const previewDeposit = depot.deposits.find((deposit) => deposit.id === state.miningDragPreview?.depositId);
      if (previewDeposit) {
        const depositScreenPos = positionToPixels(previewDeposit.position);
        ctx.save();
        ctx.strokeStyle = state.players[depot.owner].color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(depotScreenPos.x, depotScreenPos.y);
        ctx.lineTo(depositScreenPos.x, depositScreenPos.y);
        ctx.stroke();
        ctx.restore();
      }
    }
    
    // Draw the depot building
    ctx.save();
    
    // Depot base
    const depotColor = state.players[depot.owner].color;
    ctx.fillStyle = 'oklch(0.25 0.05 0)';
    ctx.strokeStyle = depotColor;
    ctx.lineWidth = 2;
    
    ctx.fillRect(depotScreenPos.x - depotWidth / 2, depotScreenPos.y - depotHeight / 2, depotWidth, depotHeight);
    ctx.strokeRect(depotScreenPos.x - depotWidth / 2, depotScreenPos.y - depotHeight / 2, depotWidth, depotHeight);
    
    // Add glow effect
    applyGlowEffect(ctx, state, depotColor, 10);
    ctx.strokeRect(depotScreenPos.x - depotWidth / 2, depotScreenPos.y - depotHeight / 2, depotWidth, depotHeight);
    clearGlowEffect(ctx, state);
    
    // Draw a center marker scaled to the depot footprint
    ctx.fillStyle = depotColor;
    ctx.beginPath();
    ctx.arc(depotScreenPos.x, depotScreenPos.y, metersToPixels(DEPOT_SIZE * 0.2), 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
    
    // Draw resource deposits around the depot
    depot.deposits.forEach((deposit) => {
      const depositScreenPos = positionToPixels(deposit.position);
      const depositWidth = metersToPixels(DEPOSIT_SIZE);
      
      ctx.save();
      
      // Deposit is a hexagon shape
      const workerCount = deposit.workerIds?.length ?? 0;
      const isOccupied = workerCount > 0;
      // 0 workers: darker, 1 worker: normal brightness, 2 workers: brightest
      const depositColor = workerCount >= 2
        ? 'oklch(0.90 0.22 95)' // Bright when 2 workers
        : workerCount === 1
          ? 'oklch(0.85 0.20 95)' // Normal brightness with 1 worker
          : 'oklch(0.40 0.15 95)'; // Darker when no workers
      
      ctx.fillStyle = depositColor;
      ctx.strokeStyle = depotColor;
      ctx.lineWidth = 1.5;
      
      // Draw hexagon
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = depositScreenPos.x + Math.cos(angle) * depositWidth / 2;
        const y = depositScreenPos.y + Math.sin(angle) * depositWidth / 2;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Add glow for occupied deposits
      if (isOccupied) {
        applyGlowEffect(ctx, state, depositColor, 8);
        ctx.stroke();
        clearGlowEffect(ctx, state);
      }
      
      ctx.restore();
    });
  });
}

function drawResourceOrbs(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.resourceOrbs || state.resourceOrbs.length === 0) return;
  
  const now = Date.now();
  
  state.resourceOrbs.forEach((orb) => {
    const screenPos = positionToPixels(orb.position);
    const age = (now - orb.createdAt) / 1000; // seconds
    
    // Pulsing glow effect
    const glowPhase = orb.glowPhase + age * 3; // 3 pulses per second
    const glowIntensity = 0.7 + Math.sin(glowPhase) * 0.3;
    
    // Draw the orb
    const orbSize = metersToPixels(0.4); // Small orb
    
    ctx.save();
    
    // Draw outer glow
    const gradient = ctx.createRadialGradient(screenPos.x, screenPos.y, 0, screenPos.x, screenPos.y, orbSize * 2);
    gradient.addColorStop(0, orb.color);
    gradient.addColorStop(0.5, orb.color.replace('0.70', String(0.50 * glowIntensity)));
    gradient.addColorStop(1, 'transparent');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, orbSize * 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw core orb
    ctx.fillStyle = orb.color;
    applyGlowEffect(ctx, state, orb.color, 15 * glowIntensity);
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, orbSize, 0, Math.PI * 2);
    ctx.fill();
    clearGlowEffect(ctx, state);
    
    // Draw a bright center
    const centerGradient = ctx.createRadialGradient(screenPos.x, screenPos.y, 0, screenPos.x, screenPos.y, orbSize * 0.5);
    centerGradient.addColorStop(0, 'oklch(0.95 0.10 150)');
    centerGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = centerGradient;
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, orbSize * 0.5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  });
}

function drawCommandQueues(ctx: CanvasRenderingContext2D, state: GameState): void {
  const time = Date.now() / 1000; // Calculate once for efficiency
  const currentTime = Date.now();
  
  // Helper function to draw a single unit's command queue with animation
  const drawUnitQueue = (unit: Unit) => {
    if (unit.commandQueue.length === 0) return;
    
    const color = state.players[unit.owner].color;
    
    // Calculate fade alpha if queue is being cancelled
    let fadeAlpha = 1.0;
    if (unit.queueFadeStartTime) {
      const fadeElapsed = (currentTime - unit.queueFadeStartTime) / 1000;
      fadeAlpha = Math.max(0, 1.0 - fadeElapsed / QUEUE_FADE_DURATION);
      
      // Clean up fade tracking after animation completes
      if (fadeAlpha <= 0) {
        unit.queueFadeStartTime = undefined;
      }
    }
    
    // Calculate draw progress (for draw-in or reverse un-draw animations)
    let drawProgress = 1.0; // Default: fully drawn
    if (unit.queueDrawStartTime) {
      const elapsed = (currentTime - unit.queueDrawStartTime) / 1000;
      if (unit.queueDrawReverse) {
        // Reverse animation: start from 1.0 and go to 0.0
        drawProgress = Math.max(0, 1.0 - elapsed / QUEUE_UNDRAW_DURATION);
      } else {
        // Forward animation: start from 0.0 and go to 1.0
        drawProgress = Math.min(1.0, elapsed / QUEUE_DRAW_DURATION);
        // Clean up once animation completes
        if (drawProgress >= 1.0) {
          unit.queueDrawStartTime = undefined;
        }
      }
    }
    
    // Calculate total path length to determine how much to draw
    const pathSegments: Array<{
      start: Vector2;
      end: Vector2;
      type: 'move' | 'ability' | 'attack-move' | 'patrol';
      node: CommandNode;
      index: number;
    }> = [];
    
    let totalLength = 0;
    let lastPos = unit.position;
    
    unit.commandQueue.forEach((node, index) => {
      const segmentStart = lastPos;
      const segmentEnd = node.position;
      const segmentLength = distance(segmentStart, segmentEnd);
      
      pathSegments.push({
        start: segmentStart,
        end: segmentEnd,
        type: node.type,
        node,
        index
      });
      
      totalLength += segmentLength;
      lastPos = segmentEnd;
    });
    
    // Calculate how much of the path to draw based on progress
    const drawLength = totalLength * drawProgress;
    let accumulatedLength = 0;
    
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.2 * fadeAlpha; // Queued lines: 20% opacity
    
    // Draw each segment up to the draw length
    for (const segment of pathSegments) {
      const segmentLength = distance(segment.start, segment.end);
      const segmentStartLength = accumulatedLength;
      const segmentEndLength = accumulatedLength + segmentLength;
      
      // Skip if this segment hasn't started drawing yet
      if (drawLength <= segmentStartLength) break;
      
      // Calculate how much of this segment to draw
      const segmentDrawLength = Math.min(drawLength - segmentStartLength, segmentLength);
      const segmentProgress = segmentDrawLength / segmentLength;
      
      // Calculate the actual end point for partial drawing
      const drawEnd = {
        x: segment.start.x + (segment.end.x - segment.start.x) * segmentProgress,
        y: segment.start.y + (segment.end.y - segment.start.y) * segmentProgress
      };
      
      const startScreen = positionToPixels(segment.start);
      const endScreen = positionToPixels(drawEnd);
      const fullEndScreen = positionToPixels(segment.end);
      
      if (segment.type === 'move') {
        // Draw path with glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(startScreen.x, startScreen.y);
        ctx.lineTo(endScreen.x, endScreen.y);
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Draw waypoint if segment is fully drawn
        if (segmentProgress >= 1.0) {
          const pulse = Math.sin(time * 2 + segment.index) * 0.3 + 0.7;
          ctx.globalAlpha = 0.6 * pulse * fadeAlpha; // Movement nodes: 60% opacity
          ctx.shadowColor = color;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(fullEndScreen.x, fullEndScreen.y, 4 + pulse * 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 0.2 * fadeAlpha; // Reset to queued line opacity
        }
      } else if (segment.type === 'ability' && segmentProgress >= 1.0) {
        // Only draw ability arrow if segment is fully drawn and node is ability type
        if (segment.node.type !== 'ability') continue;
        
        const dir = normalize(segment.node.direction);
        const arrowEnd = add(segment.end, scale(dir, 0.5));
        const arrowEndScreen = positionToPixels(arrowEnd);
        
        ctx.save();
        ctx.translate(arrowEndScreen.x, arrowEndScreen.y);
        const angle = Math.atan2(dir.y, dir.x);
        ctx.rotate(angle);
        
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.globalAlpha = 0.4 * fadeAlpha; // Ability casts: 40% opacity
        ctx.beginPath();
        ctx.moveTo(ABILITY_ARROW_LENGTH, 0);
        ctx.lineTo(0, -6);
        ctx.lineTo(0, 6);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
        ctx.globalAlpha = 0.2 * fadeAlpha; // Reset to queued line opacity
      } else if (segment.type === 'attack-move') {
        // Draw path line
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.4 * fadeAlpha;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(startScreen.x, startScreen.y);
        ctx.lineTo(endScreen.x, endScreen.y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw cross-hair if segment is fully drawn
        if (segmentProgress >= 1.0) {
          ctx.fillStyle = color;
          ctx.strokeStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 8;
          ctx.globalAlpha = 0.8 * fadeAlpha;
          
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(fullEndScreen.x, fullEndScreen.y, 8, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.moveTo(fullEndScreen.x - 10, fullEndScreen.y);
          ctx.lineTo(fullEndScreen.x + 10, fullEndScreen.y);
          ctx.moveTo(fullEndScreen.x, fullEndScreen.y - 10);
          ctx.lineTo(fullEndScreen.x, fullEndScreen.y + 10);
          ctx.stroke();
          
          const pulse = Math.sin(time * 3 + segment.index * 0.3) * 0.5 + 0.5;
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(fullEndScreen.x, fullEndScreen.y, 3 + pulse * 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 0.2 * fadeAlpha; // Reset to queued line opacity
      } else if (segment.type === 'patrol' && segmentProgress >= 1.0) {
        // Only draw patrol path if segment is fully drawn and node is patrol type
        if (segment.node.type !== 'patrol') continue;
        
        const returnScreenPos = positionToPixels(segment.node.returnPosition);
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5 * fadeAlpha;
        ctx.setLineDash([8, 4]);
        ctx.lineDashOffset = time * 20;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        
        ctx.beginPath();
        ctx.moveTo(fullEndScreen.x, fullEndScreen.y);
        ctx.lineTo(returnScreenPos.x, returnScreenPos.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        
        const pulse = Math.sin(time * 2.5) * 0.3 + 0.7;
        ctx.globalAlpha = 0.7 * pulse * fadeAlpha;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        
        const drawPatrolMarker = (x: number, y: number) => {
          ctx.save();
          ctx.translate(x, y);
          ctx.beginPath();
          ctx.moveTo(0, -6);
          ctx.lineTo(6, 0);
          ctx.lineTo(0, 6);
          ctx.lineTo(-6, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        };
        
        drawPatrolMarker(fullEndScreen.x, fullEndScreen.y);
        drawPatrolMarker(returnScreenPos.x, returnScreenPos.y);
        
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.2 * fadeAlpha; // Reset to queued line opacity
      }
      
      accumulatedLength += segmentLength;
    }
    
    ctx.globalAlpha = 1.0;
  };
  
  // Draw queues for all units
  state.units.forEach(drawUnitQueue);
  
  // Also draw queues for dying units (for reverse animation)
  if (state.dyingUnits && state.dyingUnits.length > 0) {
    state.dyingUnits.forEach(drawUnitQueue);
  }
  
  // Draw pending chess mode commands with different visual style
  if (state.settings.chessMode && state.chessMode && state.chessMode.pendingCommands.size > 0) {
    state.chessMode.pendingCommands.forEach((commands, unitId) => {
      const unit = state.units.find(u => u.id === unitId);
      if (!unit || commands.length === 0) return;
      
      const color = state.players[unit.owner].color;
      const command = commands[0]; // Only one command per turn
      
      // Draw pending command with pulsing dashed line
      const pulse = Math.sin(time * 4) * 0.3 + 0.7; // Fast pulse
      
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.5 * pulse; // Pulsing opacity
      ctx.setLineDash([8, 8]); // Dashed line
      
      const startPos = positionToPixels(unit.position);
      const endPos = positionToPixels(command.position);
      
      // Draw dashed line
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(startPos.x, startPos.y);
      ctx.lineTo(endPos.x, endPos.y);
      ctx.stroke();
      
      // Draw endpoint marker with different style
      ctx.globalAlpha = 0.7 * pulse;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(endPos.x, endPos.y, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw inner dot for contrast
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = 'white';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(endPos.x, endPos.y, 2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.setLineDash([]); // Reset dash
      ctx.restore();
    });
  }
}

function drawBases(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Keep sprite usage consistent with the settings toggle.
  const spritesEnabled = state.settings.enableSprites ?? true;

  state.bases.forEach((base) => {
    // Fog of war: hide enemy bases that are not visible to the player
    if (base.owner !== 0 && !isVisibleToPlayer(base.position, state)) {
      return;
    }
    
    let screenPos = positionToPixels(base.position);
    const size = metersToPixels(BASE_SIZE_METERS);
    const color = state.players[base.owner].color;

    if (state.matchStartAnimation && state.matchStartAnimation.phase === 'bases-sliding') {
      const elapsed = Date.now() - state.matchStartAnimation.startTime;
      const progress = Math.min(elapsed / 1500, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      // Check if we're in portrait mode
      const isPortrait = state.isPortrait || false;
      
      if (isPortrait) {
        // In portrait mode: player base comes from bottom, enemy from top
        if (base.owner === 0) {
          const startY = ctx.canvas.height + size;
          const endY = screenPos.y;
          screenPos = { x: screenPos.x, y: startY + (endY - startY) * easeProgress };
        } else {
          const startY = -size;
          const endY = screenPos.y;
          screenPos = { x: screenPos.x, y: startY + (endY - startY) * easeProgress };
        }
      } else {
        // In landscape mode: player base comes from left, enemy from right
        if (base.owner === 0) {
          const startX = -size;
          const endX = screenPos.x;
          screenPos = { x: startX + (endX - startX) * easeProgress, y: screenPos.y };
        } else {
          const startX = ctx.canvas.width + size;
          const endX = screenPos.x;
          screenPos = { x: startX + (endX - startX) * easeProgress, y: screenPos.y };
        }
      }
    }

    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    
    // Add pulsing glow effect
    const time = Date.now() / 1000;
    const pulseIntensity = Math.sin(time * 1.5) * 0.3 + 0.7; // Pulse between 0.4 and 1.0
    
    // Draw shield effect for mobile faction when shield is active
    if (base.shieldActive && Date.now() < base.shieldActive.endTime) {
      const shieldRadius = size * 0.8;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.6;
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, shieldRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.2;
      ctx.fill();
      ctx.restore();
    }

    const factionDef = FACTION_DEFINITIONS[base.faction];
    // Draw the sprite art for Radiant bases when enabled; fallback to vector base shapes otherwise.
    const spriteDrawn = spritesEnabled && base.faction === 'radiant'
      ? drawRadiantBaseSprite(ctx, base, screenPos, size, color, state)
      : false;
    
    if (base.isSelected) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 35 * pulseIntensity;
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.9;
      if (factionDef.baseShape === 'circle') {
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, size / 2, 0, Math.PI * 2);
        ctx.stroke();
      } else if (factionDef.baseShape === 'star') {
        drawStar(ctx, screenPos.x, screenPos.y, size / 2, size / 4, 5);
        ctx.stroke();
      } else if (factionDef.baseShape === 'triangle') {
        drawTriangle(ctx, screenPos.x, screenPos.y, size / 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(screenPos.x - size / 2, screenPos.y - size / 2, size, size);
      }

      // Add a larger secondary ring to make the selected base stand out
      ctx.globalAlpha = 0.45;
      if (factionDef.baseShape === 'circle') {
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, size * 0.65, 0, Math.PI * 2);
        ctx.stroke();
      } else if (factionDef.baseShape === 'star') {
        drawStar(ctx, screenPos.x, screenPos.y, size * 0.65, size * 0.33, 5);
        ctx.stroke();
      } else if (factionDef.baseShape === 'triangle') {
        drawTriangle(ctx, screenPos.x, screenPos.y, size * 0.65);
        ctx.stroke();
      } else {
        const expanded = size * 1.3;
        ctx.strokeRect(screenPos.x - expanded / 2, screenPos.y - expanded / 2, expanded, expanded);
      }
      ctx.restore();
    } else {
      // Add subtle pulsing glow even when not selected
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 10 * pulseIntensity;
      if (factionDef.baseShape === 'circle') {
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, size / 2, 0, Math.PI * 2);
        ctx.stroke();
      } else if (factionDef.baseShape === 'star') {
        drawStar(ctx, screenPos.x, screenPos.y, size / 2, size / 4, 5);
        ctx.stroke();
      } else if (factionDef.baseShape === 'triangle') {
        drawTriangle(ctx, screenPos.x, screenPos.y, size / 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(screenPos.x - size / 2, screenPos.y - size / 2, size, size);
      }
      ctx.restore();
    }

    // Add radial gradient background glow for aesthetic enhancement.
    if (state.settings.enableGlowEffects && !spriteDrawn) {
      ctx.save();
      const gradient = ctx.createRadialGradient(screenPos.x, screenPos.y, 0, screenPos.x, screenPos.y, size * 1.2);
      gradient.addColorStop(0, addAlphaToColor(color, 0.15 * pulseIntensity));
      gradient.addColorStop(0.5, addAlphaToColor(color, 0.08 * pulseIntensity));
      gradient.addColorStop(1, addAlphaToColor(color, 0));
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, size * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (!spriteDrawn) {
      ctx.globalAlpha = 0.3;
      if (factionDef.baseShape === 'circle') {
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (factionDef.baseShape === 'star') {
        drawStar(ctx, screenPos.x, screenPos.y, size / 2, size / 4, 5);
        ctx.fill();
      } else if (factionDef.baseShape === 'triangle') {
        drawTriangle(ctx, screenPos.x, screenPos.y, size / 2);
        ctx.fill();
      } else {
        ctx.fillRect(screenPos.x - size / 2, screenPos.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1.0;
      if (factionDef.baseShape === 'circle') {
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, size / 2, 0, Math.PI * 2);
        ctx.stroke();
      } else if (factionDef.baseShape === 'star') {
        drawStar(ctx, screenPos.x, screenPos.y, size / 2, size / 4, 5);
        ctx.stroke();
      } else if (factionDef.baseShape === 'triangle') {
        drawTriangle(ctx, screenPos.x, screenPos.y, size / 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(screenPos.x - size / 2, screenPos.y - size / 2, size, size);
      }
    }

    // Draw cannon indicator for defense base
    if (base.baseType === 'defense' && !spriteDrawn) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      
      // Draw turret on top of base
      const turretSize = size * 0.3;
      ctx.fillRect(screenPos.x - turretSize / 2, screenPos.y - turretSize / 2, turretSize, turretSize);
      
      // Draw cannon barrel pointing upwards (or towards nearest enemy if in range)
      const barrelLength = size * 0.4;
      const barrelWidth = 4;
      
      // For now, just point upwards
      ctx.fillRect(screenPos.x - barrelWidth / 2, screenPos.y - turretSize / 2 - barrelLength, barrelWidth, barrelLength);
      
      ctx.restore();
    }
    
    // Draw shield indicator for assault base
    if (base.baseType === 'assault' && !base.shieldActive && !spriteDrawn) {
      // Draw small shield icon to indicate it has shield ability
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.4;
      const shieldSize = size * 0.25;
      ctx.beginPath();
      ctx.arc(screenPos.x + size * 0.25, screenPos.y - size * 0.25, shieldSize, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    
    // Draw healing cross for support base
    if (base.baseType === 'support' && !spriteDrawn) {
      ctx.save();
      ctx.fillStyle = '#4ade80';
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      
      const crossSize = size * 0.2;
      const crossThickness = 3;
      
      // Draw cross
      ctx.fillRect(screenPos.x - crossThickness / 2, screenPos.y - crossSize / 2, crossThickness, crossSize);
      ctx.fillRect(screenPos.x - crossSize / 2, screenPos.y - crossThickness / 2, crossSize, crossThickness);
      
      ctx.restore();
    }

    if (state.mode === 'game' && (!state.matchStartAnimation || state.matchStartAnimation.phase === 'go')) {
      const doorSize = size / 3;
      const playerPhotons = state.players[base.owner].photons;

      const doorPositions = [
        { x: screenPos.x, y: screenPos.y - size / 2, type: state.settings.unitSlots.up },
        { x: screenPos.x - size / 2, y: screenPos.y, type: state.settings.unitSlots.left },
        { x: screenPos.x, y: screenPos.y + size / 2, type: state.settings.unitSlots.down },
        { x: screenPos.x + size / 2, y: screenPos.y, type: state.settings.unitSlots.right },
      ];

      doorPositions.forEach((door) => {
        const def = UNIT_DEFINITIONS[door.type];

        const canAfford = playerPhotons >= def.cost;

        if (canAfford && !base.isSelected) {
          ctx.save();
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 15 * pulseIntensity;
          ctx.globalAlpha = 0.6 + 0.2 * pulseIntensity;

          if (door.y < screenPos.y) {
            ctx.fillRect(door.x - doorSize / 2, door.y, doorSize, 3);
          } else if (door.y > screenPos.y) {
            ctx.fillRect(door.x - doorSize / 2, door.y - 3, doorSize, 3);
          } else if (door.x < screenPos.x) {
            ctx.fillRect(door.x, door.y - doorSize / 2, 3, doorSize);
          } else if (door.x > screenPos.x) {
            ctx.fillRect(door.x - 3, door.y - doorSize / 2, 3, doorSize);
          }

          ctx.restore();
        }
      });

      if (base.movementTarget) {
        const targetScreen = positionToPixels(base.movementTarget);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(targetScreen.x, targetScreen.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Draw rally point flag for selected bases
      if (base.isSelected) {
        const rallyScreen = positionToPixels(base.rallyPoint);
        const flagHeight = 20;
        const flagWidth = 15;
        
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
        
        // Draw flag pole
        ctx.beginPath();
        ctx.moveTo(rallyScreen.x, rallyScreen.y);
        ctx.lineTo(rallyScreen.x, rallyScreen.y - flagHeight);
        ctx.stroke();
        
        // Draw flag
        ctx.beginPath();
        ctx.moveTo(rallyScreen.x, rallyScreen.y - flagHeight);
        ctx.lineTo(rallyScreen.x + flagWidth, rallyScreen.y - flagHeight + flagWidth / 3);
        ctx.lineTo(rallyScreen.x, rallyScreen.y - flagHeight + flagWidth * 2 / 3);
        ctx.closePath();
        ctx.fill();
        
        // Draw line from base to rally point
        ctx.globalAlpha = 0.3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y);
        ctx.lineTo(rallyScreen.x, rallyScreen.y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.restore();
      }
      
      // Draw rally point preview when dragging
      if (state.rallyPointPreview && state.rallyPointPreview.baseId === base.id) {
        const previewRallyScreen = positionToPixels(state.rallyPointPreview.rallyPoint);
        const flagHeight = 20;
        const flagWidth = 15;
        
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5; // Semi-transparent for preview
        
        // Draw flag pole
        ctx.beginPath();
        ctx.moveTo(previewRallyScreen.x, previewRallyScreen.y);
        ctx.lineTo(previewRallyScreen.x, previewRallyScreen.y - flagHeight);
        ctx.stroke();
        
        // Draw flag
        ctx.beginPath();
        ctx.moveTo(previewRallyScreen.x, previewRallyScreen.y - flagHeight);
        ctx.lineTo(previewRallyScreen.x + flagWidth, previewRallyScreen.y - flagHeight + flagWidth / 3);
        ctx.lineTo(previewRallyScreen.x, previewRallyScreen.y - flagHeight + flagWidth * 2 / 3);
        ctx.closePath();
        ctx.fill();
        
        // Draw line from base to rally point with pulsing effect
        // Use elapsedTime for consistent animation timing across different frame rates
        ctx.globalAlpha = 0.4 + Math.sin(state.elapsedTime * 5) * 0.1; // Pulsing animation
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y);
        ctx.lineTo(previewRallyScreen.x, previewRallyScreen.y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.restore();
      }
      
      drawBaseHealthBar(ctx, base, screenPos, size, color, state);
    }
    
    // Draw laser beam if active
    if (base.laserBeam && Date.now() < base.laserBeam.endTime) {
      drawLaserBeam(ctx, base, screenPos, color);
    }
    
    // Draw regeneration pulse for support base
    if (base.regenerationPulse && Date.now() < base.regenerationPulse.endTime) {
      const elapsed = Date.now() - (base.regenerationPulse.endTime - 500); // 500ms duration
      const progress = elapsed / 500;
      const radius = metersToPixels(base.regenerationPulse.radius);
      
      ctx.save();
      ctx.strokeStyle = '#4ade80'; // Green color for healing
      ctx.lineWidth = 3;
      ctx.globalAlpha = (1 - progress) * 0.5; // Fade out as it expands
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, radius * progress, 0, Math.PI * 2);
      ctx.stroke();
      
      // Inner glow
      ctx.globalAlpha = (1 - progress) * 0.3;
      ctx.shadowColor = '#4ade80';
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.restore();
    }
  });
}

function drawBaseHealthBar(ctx: CanvasRenderingContext2D, base: Base, screenPos: { x: number; y: number }, baseSize: number, color: string, state: GameState): void {
  const barWidth = baseSize * 1.2;
  const barHeight = 8;
  const barX = screenPos.x - barWidth / 2;
  const barY = screenPos.y - baseSize / 2 - 20;
  const hpPercent = base.hp / base.maxHp;
  
  // Skip health bar if base is at full health and setting is enabled
  if (state.settings.showHealthBarsOnlyWhenDamaged && base.hp >= base.maxHp) {
    return;
  }
  
  ctx.save();
  
  ctx.fillStyle = 'oklch(0.20 0 0)';
  ctx.strokeStyle = 'oklch(0.45 0 0)';
  ctx.lineWidth = 1.5;
  ctx.fillRect(barX, barY, barWidth, barHeight);
  ctx.strokeRect(barX, barY, barWidth, barHeight);
  
  const gradient = ctx.createLinearGradient(barX, barY, barX + barWidth * hpPercent, barY);
  
  if (hpPercent > 0.6) {
    gradient.addColorStop(0, 'oklch(0.70 0.20 140)');
    gradient.addColorStop(1, 'oklch(0.65 0.22 145)');
  } else if (hpPercent > 0.3) {
    gradient.addColorStop(0, 'oklch(0.85 0.20 95)');
    gradient.addColorStop(1, 'oklch(0.78 0.22 85)');
  } else {
    gradient.addColorStop(0, 'oklch(0.62 0.28 25)');
    gradient.addColorStop(1, 'oklch(0.58 0.26 20)');
  }
  
  ctx.fillStyle = gradient;
  ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
  
  ctx.shadowColor = hpPercent > 0.6 ? 'oklch(0.70 0.20 140)' : hpPercent > 0.3 ? 'oklch(0.85 0.20 95)' : 'oklch(0.62 0.28 25)';
  ctx.shadowBlur = 8;
  ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
  ctx.shadowBlur = 0;
  
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.strokeRect(barX, barY, barWidth, barHeight);
  ctx.shadowBlur = 0;
  
  if (state.settings.showNumericHP) {
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 11px Space Mono, monospace';
    ctx.textAlign = 'right'; // Right-align text so it ends at the x-coordinate (positioning it to the left of the bar)
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'oklch(0 0 0)';
    ctx.shadowBlur = 3;
    // Position HP number to the left of the health bar
    ctx.fillText(`${Math.ceil(base.hp)} / ${base.maxHp}`, barX - 3, barY + barHeight / 2);
    ctx.shadowBlur = 0;
  }
  
  ctx.restore();
}

function drawLaserBeam(ctx: CanvasRenderingContext2D, base: Base, screenPos: { x: number; y: number }, color: string): void {
  if (!base.laserBeam) return;
  
  const direction = base.laserBeam.direction;
  const laserEnd = add(base.position, scale(direction, LASER_RANGE));
  const endScreenPos = positionToPixels(laserEnd);
  
  // Calculate beam fade based on remaining time
  const timeLeft = base.laserBeam.endTime - Date.now();
  const alpha = Math.min(1, timeLeft / 200); // Fade in last 200ms
  
  ctx.save();
  ctx.globalAlpha = alpha;
  
  // Try to use laser sprites
  const beginSprite = getSpriteFromCache(laserSpritePaths.beginning);
  const middleSprite = getSpriteFromCache(laserSpritePaths.middle);
  const endSprite = getSpriteFromCache(laserSpritePaths.end);
  
  const allSpritesReady = isSpriteReady(beginSprite) && isSpriteReady(middleSprite) && isSpriteReady(endSprite);
  
  if (allSpritesReady) {
    // Calculate angle for rotation
    const angle = Math.atan2(direction.y, direction.x);
    
    // Laser segment dimensions (in pixels)
    const segmentHeight = metersToPixels(0.5); // Width of the laser beam
    const beginWidth = metersToPixels(1.0); // Width of beginning segment
    const middleWidth = metersToPixels(1.0); // Width of middle segment
    const endWidth = metersToPixels(1.0); // Width of end segment
    
    // Calculate total laser length in pixels
    const totalLength = metersToPixels(LASER_RANGE);
    
    // Calculate how many middle segments we need
    const middleSegmentCount = Math.max(0, Math.floor((totalLength - beginWidth - endWidth) / middleWidth));
    const actualMiddleWidth = middleSegmentCount > 0 ? (totalLength - beginWidth - endWidth) / middleSegmentCount : 0;
    
    ctx.save();
    ctx.translate(screenPos.x, screenPos.y);
    ctx.rotate(angle);
    
    // Draw beginning segment
    ctx.drawImage(
      beginSprite,
      0,
      -segmentHeight / 2,
      beginWidth,
      segmentHeight
    );
    
    // Draw middle segments (repeated to fill the length)
    let currentX = beginWidth;
    for (let i = 0; i < middleSegmentCount; i++) {
      ctx.drawImage(
        middleSprite,
        currentX,
        -segmentHeight / 2,
        actualMiddleWidth,
        segmentHeight
      );
      currentX += actualMiddleWidth;
    }
    
    // Draw end segment
    ctx.drawImage(
      endSprite,
      currentX,
      -segmentHeight / 2,
      endWidth,
      segmentHeight
    );
    
    ctx.restore();
  } else {
    // Fallback to original line rendering if sprites not loaded
    // Draw main beam
    ctx.strokeStyle = COLORS.laser;
    ctx.lineWidth = 4;
    ctx.shadowColor = COLORS.laser;
    ctx.shadowBlur = 20;
    
    ctx.beginPath();
    ctx.moveTo(screenPos.x, screenPos.y);
    ctx.lineTo(endScreenPos.x, endScreenPos.y);
    ctx.stroke();
    
    // Draw bright core
    ctx.lineWidth = 2;
    ctx.shadowBlur = 30;
    ctx.strokeStyle = 'oklch(0.95 0.25 320)';
    
    ctx.beginPath();
    ctx.moveTo(screenPos.x, screenPos.y);
    ctx.lineTo(endScreenPos.x, endScreenPos.y);
    ctx.stroke();
  }
  
  ctx.restore();
}

function drawProjectiles(ctx: CanvasRenderingContext2D, state: GameState): void {
  state.projectiles.forEach((projectile, index) => {
    // Skip projectiles that are off-screen for performance
    if (!isOnScreen(projectile.position, ctx.canvas, state, OFFSCREEN_CULLING_MARGIN)) {
      return;
    }
    
    const screenPos = positionToPixels(projectile.position);
    
    ctx.save();
    
    // Calculate rotation angle based on velocity direction
    const angle = Math.atan2(projectile.velocity.y, projectile.velocity.x);
    
    // Translate to projectile position and rotate
    ctx.translate(screenPos.x, screenPos.y);
    ctx.rotate(angle);
    
    if (projectile.kind === 'knife') {
      // Draw slim knife silhouette with a pointed tip
      const bladeLength = 6;
      const bladeWidth = 2;
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.moveTo(bladeLength / 2, 0);
      ctx.lineTo(-bladeLength / 2, -bladeWidth / 2);
      ctx.lineTo(-bladeLength / 2, bladeWidth / 2);
      ctx.closePath();
      ctx.fill();
      
      ctx.strokeStyle = projectile.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-bladeLength / 2, 0);
      ctx.lineTo(-bladeLength / 2 - 2, 0);
      ctx.stroke();
    } else {
      // Try to render projectile sprite if available
      const spriteIndex = index % projectileSpritePaths.length;
      const spritePath = projectileSpritePaths[spriteIndex];
      const sprite = getSpriteFromCache(spritePath);
      
      if (isSpriteReady(sprite)) {
        // Render sprite with proper sizing
        const spriteSize = metersToPixels(UNIT_SIZE_METERS * 0.8); // Slightly smaller than units
        ctx.drawImage(
          sprite,
          -spriteSize / 2,
          -spriteSize / 2,
          spriteSize,
          spriteSize
        );
      } else {
        // Fallback to rectangle if sprite not loaded
        const bulletWidth = 4;
        const bulletHeight = 2;
        ctx.fillStyle = projectile.color;
        ctx.fillRect(-bulletWidth / 2, -bulletHeight / 2, bulletWidth, bulletHeight);
      }
    }
    
    ctx.restore();
  });
}

function drawShells(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.shells || state.shells.length === 0) return;
  if (!state.settings.enableParticleEffects) return;

  state.shells.forEach((shell) => {
    if (!isOnScreen(shell.position, ctx.canvas, state, OFFSCREEN_CULLING_MARGIN)) {
      return;
    }

    const screenPos = positionToPixels(shell.position);
    const shellWidth = 3;
    const shellHeight = 1.5;

    ctx.save();
    ctx.translate(screenPos.x, screenPos.y);
    ctx.rotate(shell.rotation);
    ctx.fillStyle = 'oklch(0.75 0.15 85)';
    ctx.fillRect(-shellWidth / 2, -shellHeight / 2, shellWidth, shellHeight);
    ctx.restore();
  });
}

// Helper function to calculate blade particle angle for a given swing state and progress
function calculateBladeSwingAngle(
  baseRotation: number,
  swingType: 'first' | 'second' | 'third',
  progress: number
): number {
  const restAngle = baseRotation + BLADE_SWORD_REST_ANGLE;
  
  if (swingType === 'first') {
    // First swing: 210-degree arc counterclockwise from rest position
    return restAngle + progress * BLADE_SWORD_FIRST_SWING_ARC;
  } else if (swingType === 'second') {
    // Second swing: 180-degree arc clockwise from end of first swing
    const firstSwingEnd = restAngle + BLADE_SWORD_FIRST_SWING_ARC;
    return firstSwingEnd - progress * BLADE_SWORD_SECOND_SWING_ARC;
  } else {
    // Third swing: 360-degree full rotation
    const secondSwingEnd = restAngle + BLADE_SWORD_FIRST_SWING_ARC - BLADE_SWORD_SECOND_SWING_ARC;
    return secondSwingEnd + progress * BLADE_SWORD_THIRD_SWING_ARC;
  }
}

/**
 * Sample the Blade movement history to retrieve a lagged transform for sword particles.
 * @param unit - Blade unit to sample
 * @param targetTime - Time in milliseconds to sample from history
 * @returns Lagged position and rotation to render against
 */
function sampleBladeTrail(unit: Unit, targetTime: number): { position: Vector2; rotation: number } {
  const history = unit.bladeTrailHistory;

  if (!history || history.length === 0) {
    return { position: unit.position, rotation: unit.rotation ?? 0 };
  }

  // Clamp to oldest/newest samples when requested time is outside the buffer.
  if (targetTime <= history[0].timestamp) {
    return { position: history[0].position, rotation: history[0].rotation };
  }
  const lastSample = history[history.length - 1];
  if (targetTime >= lastSample.timestamp) {
    return { position: lastSample.position, rotation: lastSample.rotation };
  }

  // Find the two samples surrounding the target time for interpolation.
  for (let i = history.length - 2; i >= 0; i -= 1) {
    const current = history[i];
    const next = history[i + 1];
    if (current.timestamp <= targetTime && next.timestamp >= targetTime) {
      const span = next.timestamp - current.timestamp || 1;
      const t = (targetTime - current.timestamp) / span;
      const position = {
        x: current.position.x + (next.position.x - current.position.x) * t,
        y: current.position.y + (next.position.y - current.position.y) * t,
      };
      const rotation = current.rotation + (next.rotation - current.rotation) * t;
      return { position, rotation };
    }
  }

  return { position: unit.position, rotation: unit.rotation ?? 0 };
}

function drawBladeSword(
  ctx: CanvasRenderingContext2D,
  unit: Unit,
  screenPos: { x: number; y: number },
  color: string,
  state: GameState
): void {
  const now = Date.now();
  const particleRadius = metersToPixels(BLADE_SWORD_PARTICLE_RADIUS_METERS);
  const particleSpacing = metersToPixels(BLADE_SWORD_PARTICLE_SPACING_METERS);
  const swing = unit.swordSwing;
  const swingHold = unit.swordSwingHold;
  // Determine if the Blade should extend by checking for valid melee targets nearby.
  const canHitEnemyInRange = state.units.some((enemy) => {
    if (enemy.owner === unit.owner || enemy.hp <= 0) {
      return false;
    }
    const enemyDef = UNIT_DEFINITIONS[enemy.type];
    if (enemyDef.modifiers.includes('flying')) {
      return false;
    }
    return distance(unit.position, enemy.position) <= BLADE_SWORD_RANGE_METERS;
  });
  const collapseSword = !canHitEnemyInRange && !swing && !swingHold && !unit.bladeVolley;
  const connectionColor = getPaleBrightTeamColor(color, 0.75);
  const collapsedOffset = particleSpacing * 0.35;
  const bladeParticlePositions: Array<{ x: number; y: number }> = [];
  // Apply the desktop rotation offset so blade trails align with the rotated playfield.
  const playfieldRotation = getPlayfieldRotationRadians();

  ctx.save();
  ctx.fillStyle = color;

  for (let i = 0; i < BLADE_SWORD_PARTICLE_COUNT; i++) {
    const lagSeconds = BLADE_SWORD_MOVEMENT_LAG_SECONDS * (i + 1);
    const trailSample = sampleBladeTrail(unit, now - lagSeconds * 1000);
    const baseRotation = trailSample.rotation + playfieldRotation;
    const baseScreenPos = positionToPixels(trailSample.position);
    let angle = baseRotation;
    let hasSwingMotion = false;
    let elapsed = 0;
    let delayedElapsed = 0;

    if (!collapseSword && swing) {
      hasSwingMotion = true;
      elapsed = (now - swing.startTime) / 1000;
      delayedElapsed = Math.max(0, elapsed - BLADE_SWORD_WHIP_DELAY * i);
      const progress = Math.min(1, delayedElapsed / swing.duration);
      
      angle = calculateBladeSwingAngle(baseRotation, swing.swingType, progress);
    } else if (!collapseSword && swingHold) {
      // Hold the sword at the final angle of the last completed swing between combo hits.
      angle = calculateBladeSwingAngle(baseRotation, swingHold.swingType, 1);
    } else if (!collapseSword) {
      // When not swinging and not collapsed, hold sword at rest position
      angle = baseRotation + BLADE_SWORD_REST_ANGLE;
    }

    // Each particle has its own orbital radius (different distances from unit center).
    const offset = collapseSword ? collapsedOffset : particleSpacing * (i + 1);
    const particlePos = {
      x: baseScreenPos.x + Math.cos(angle) * offset,
      y: baseScreenPos.y + Math.sin(angle) * offset,
    };
    bladeParticlePositions.push(particlePos);

    // Draw trail if swinging
    if (hasSwingMotion && swing) {
      // Calculate previous angle for trail (16ms ago ~60fps)
      const prevProgress = Math.max(0, Math.min(1, (delayedElapsed - 0.016) / swing.duration));
      const prevAngle = calculateBladeSwingAngle(baseRotation, swing.swingType, prevProgress);
      
      const prevParticlePos = {
        x: baseScreenPos.x + Math.cos(prevAngle) * offset,
        y: baseScreenPos.y + Math.sin(prevAngle) * offset,
      };

      // Draw trail
      ctx.strokeStyle = color;
      ctx.lineWidth = particleRadius * 0.8;
      ctx.globalAlpha = 0.3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(prevParticlePos.x, prevParticlePos.y);
      ctx.lineTo(particlePos.x, particlePos.y);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }

    // Draw each particle as a distinct glowing orb with minimal blur to keep them separated
    ctx.globalAlpha = collapseSword ? 0.9 : 1.0;
    
    // Draw a very subtle glow for each particle separately to maintain distinction
    ctx.shadowColor = color;
    ctx.shadowBlur = 2; // Reduced from 6 to 2 to make particles distinctly separated
    
    ctx.beginPath();
    ctx.arc(particlePos.x, particlePos.y, particleRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Add a brighter core to make the particle look more like a floating magnet
    ctx.shadowBlur = 0;
    ctx.globalAlpha = (collapseSword ? 0.9 : 1.0) * 0.7; // Increased from 0.6 to 0.7 for brighter core
    ctx.beginPath();
    ctx.arc(particlePos.x, particlePos.y, particleRadius * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Connect the particles with a thin, pale line so the sword reads as a single blade.
  if (bladeParticlePositions.length > 1) {
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = connectionColor;
    ctx.lineWidth = particleRadius * 0.35;
    ctx.lineCap = 'round';
    ctx.beginPath();
    bladeParticlePositions.forEach((particlePos, index) => {
      if (index === 0) {
        ctx.moveTo(particlePos.x, particlePos.y);
      } else {
        ctx.lineTo(particlePos.x, particlePos.y);
      }
    });
    ctx.stroke();
  }

  ctx.restore();
}

function drawUnitHealthBar(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string, showNumeric: boolean, state: GameState): void {
  const barWidth = 24;
  const barHeight = 4;
  const barX = screenPos.x - barWidth / 2;
  const unitSizeMeters = getUnitSizeMeters(unit);
  // Offset the bar to avoid overlapping larger-than-normal unit silhouettes.
  const unitSizeOffset = metersToPixels(unitSizeMeters / 2) - metersToPixels(UNIT_SIZE_METERS / 2);
  const barY = screenPos.y - 18 - unitSizeOffset;
  
  // Use display HP for smooth interpolation
  const displayHp = unit.displayHp !== undefined ? unit.displayHp : unit.hp;
  const hpPercent = displayHp / unit.maxHp;
  
  // Skip health bar if unit is at full health and setting is enabled
  if (state.settings.showHealthBarsOnlyWhenDamaged && unit.hp >= unit.maxHp) {
    return;
  }
  
  ctx.save();
  
  ctx.fillStyle = 'oklch(0.20 0 0)';
  ctx.strokeStyle = 'oklch(0.35 0 0)';
  ctx.lineWidth = 1;
  ctx.fillRect(barX, barY, barWidth, barHeight);
  ctx.strokeRect(barX, barY, barWidth, barHeight);
  
  if (hpPercent > 0.6) {
    ctx.fillStyle = 'oklch(0.70 0.20 140)';
  } else if (hpPercent > 0.3) {
    ctx.fillStyle = 'oklch(0.85 0.20 95)';
  } else {
    ctx.fillStyle = 'oklch(0.62 0.28 25)';
  }
  
  ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
  
  ctx.shadowColor = hpPercent > 0.6 ? 'oklch(0.70 0.20 140)' : hpPercent > 0.3 ? 'oklch(0.85 0.20 95)' : 'oklch(0.62 0.28 25)';
  ctx.shadowBlur = 4;
  ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
  ctx.shadowBlur = 0;
  
  if (showNumeric) {
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 9px Space Mono, monospace';
    ctx.textAlign = 'right'; // Right-align text so it ends at the x-coordinate (positioning it to the left of the bar)
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'oklch(0 0 0)';
    ctx.shadowBlur = 3;
    // Position HP number to the left of the health bar
    ctx.fillText(`${Math.ceil(unit.hp)}`, barX - 3, barY + barHeight / 2);
    ctx.shadowBlur = 0;
  }
  
  ctx.restore();
}

function drawUnits(ctx: CanvasRenderingContext2D, state: GameState): void {
  const time = Date.now() / 1000;
  // Use the settings toggle to decide whether sprite rendering is allowed.
  const spritesEnabled = state.settings.enableSprites ?? true;
  // Rotate unit visuals on desktop so they face forward in the rotated playfield view.
  const playfieldRotation = getPlayfieldRotationRadians();
  
  state.units.forEach((unit) => {
    // Skip units that are off-screen for performance
    if (!isOnScreen(unit.position, ctx.canvas, state, OFFSCREEN_CULLING_MARGIN)) {
      return;
    }

    // Hide cloaked enemy units from the player's view.
    if (unit.cloaked && unit.owner !== 0) {
      return;
    }
    
    // Fog of war: hide enemy units that are not visible to the player
    if (unit.owner !== 0 && !isVisibleToPlayer(unit.position, state)) {
      return;
    }
    
    let screenPos = positionToPixels(unit.position);
    const color = state.players[unit.owner].color;
    
    // Add subtle idle animation for selected units with no commands
    const isSelected = state.selectedUnits.has(unit.id);
    const isIdle = unit.commandQueue.length === 0;
    if (isSelected && isIdle) {
      // Gentle bobbing motion - 2 pixels up and down
      const bobOffset = Math.sin(time * 2 + unit.position.x + unit.position.y) * 2;
      screenPos = { x: screenPos.x, y: screenPos.y + bobOffset };
    }
    
    // Calculate distance from arena viewport center for LOD
    const viewportOffset = getViewportOffset();
    const viewportDimensions = getViewportDimensions();
    const cameraCenter = {
      x: viewportOffset.x + viewportDimensions.width / 2,
      y: viewportOffset.y + viewportDimensions.height / 2,
    };
    const distFromCenter = Math.sqrt(
      Math.pow(screenPos.x - cameraCenter.x, 2) + 
      Math.pow(screenPos.y - cameraCenter.y, 2)
    );
    const maxDist = Math.sqrt(
      Math.pow(viewportDimensions.width / 2, 2) + Math.pow(viewportDimensions.height / 2, 2),
    );
    const distanceRatio = distFromCenter / maxDist;
    
    // LOD: Simplify distant units
    const useLOD = distanceRatio > 0.7;
    
    // Draw motion blur trail for fast-moving units
    if (!useLOD && state.settings.enableMotionBlur && unit.currentSpeed && unit.currentSpeed > MOTION_BLUR_SPEED_THRESHOLD) {
      drawMotionBlurTrail(ctx, unit, screenPos, color, state, playfieldRotation);
    }
    
    // Draw particles first (behind the unit) - skip for LOD
    if (!useLOD && unit.particles && unit.particles.length > 0 && state.settings.enableParticleEffects) {
      drawParticles(ctx, unit);
    }

    if (!useLOD && unit.type === 'warrior' && state.settings.enableParticleEffects) {
      drawBladeSword(ctx, unit, screenPos, color, state);
    }

    if (unit.cloaked) {
      ctx.globalAlpha = 0.3;
    }

    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    // Apply the playfield rotation offset to the unit's facing direction for rendering.
    const unitRenderRotation = (unit.rotation || 0) + playfieldRotation;

    // Try sprite rendering first; fall back to vector shapes when sprites are disabled or unavailable.
    const spriteDrawn = spritesEnabled && drawRadiantUnitSprite(ctx, unit, screenPos, color, state, unitRenderRotation);

    if (!spriteDrawn && unit.type === 'snaker') {
      drawSnaker(ctx, unit, screenPos, color);
    } else if (!spriteDrawn && unit.type === 'tank') {
      drawTank(ctx, unit, screenPos, color);
    } else if (!spriteDrawn && unit.type === 'scout') {
      drawScout(ctx, unit, screenPos, color);
    } else if (!spriteDrawn && unit.type === 'artillery') {
      drawArtillery(ctx, unit, screenPos, color);
    } else if (!spriteDrawn && unit.type === 'medic') {
      drawMedic(ctx, unit, screenPos, color);
    } else if (!spriteDrawn && unit.type === 'interceptor') {
      drawInterceptor(ctx, unit, screenPos, color);
    } else if (!spriteDrawn) {
      const unitSizeMeters = getUnitSizeMeters(unit);
      const radius = metersToPixels(unitSizeMeters / 2);

      // Health-based glow intensity
      const healthPercent = unit.hp / unit.maxHp;
      let glowIntensity = 12;
      let glowColor = color;
      
      // Low health warning glow (pulsing red)
      if (healthPercent < 0.3) {
        const pulse = Math.sin(Date.now() / 300) * 0.5 + 0.5;
        glowIntensity = 15 + pulse * 5;
        glowColor = 'oklch(0.62 0.28 25)'; // Red glow for low health
      } else if (healthPercent < 0.6) {
        glowIntensity = 10;
      } else {
        // Full health has stronger glow
        glowIntensity = 12 + (healthPercent - 0.6) * 10; // Up to 16 at full health
      }

      ctx.shadowColor = glowColor;
      ctx.shadowBlur = glowIntensity;

      // Apply rotation if available
      const rotation = unitRenderRotation;
      ctx.save();
      ctx.translate(screenPos.x, screenPos.y);
      ctx.rotate(rotation);
      
      // Draw unit as circle with directional indicator
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw directional indicator (small line pointing forward)
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(radius * 0.7, 0);
      ctx.stroke();
      
      ctx.restore();
      
      // Add extra glow for marines
      if (unit.type === 'marine') {
        ctx.save();
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = glowIntensity * 1.5;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, radius * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.restore();
      }

      // Berserker - Large aggressive unit with spikes
      if (unit.type === 'berserker') {
        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);
        ctx.rotate(rotation);
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        // Draw spikes pointing outward
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI * 2 * i) / 6;
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * radius * 0.6, Math.sin(angle) * radius * 0.6);
          ctx.lineTo(Math.cos(angle) * radius * 1.2, Math.sin(angle) * radius * 1.2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Assassin - Sharp dagger-like appearance
      if (unit.type === 'assassin') {
        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);
        ctx.rotate(rotation);
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.beginPath();
        // Draw blade shape
        ctx.moveTo(radius * 1.2, 0);
        ctx.lineTo(-radius * 0.5, radius * 0.5);
        ctx.lineTo(-radius * 0.5, -radius * 0.5);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }

      // Juggernaut - Large imposing square with reinforced corners
      if (unit.type === 'juggernaut') {
        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);
        ctx.rotate(rotation);
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.beginPath();
        const halfSize = radius * 0.9;
        ctx.rect(-halfSize, -halfSize, halfSize * 2, halfSize * 2);
        ctx.stroke();
        // Corner reinforcements
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-halfSize * 0.7, -halfSize);
        ctx.lineTo(-halfSize, -halfSize);
        ctx.lineTo(-halfSize, -halfSize * 0.7);
        ctx.moveTo(halfSize * 0.7, -halfSize);
        ctx.lineTo(halfSize, -halfSize);
        ctx.lineTo(halfSize, -halfSize * 0.7);
        ctx.moveTo(-halfSize * 0.7, halfSize);
        ctx.lineTo(-halfSize, halfSize);
        ctx.lineTo(-halfSize, halfSize * 0.7);
        ctx.moveTo(halfSize * 0.7, halfSize);
        ctx.lineTo(halfSize, halfSize);
        ctx.lineTo(halfSize, halfSize * 0.7);
        ctx.stroke();
        ctx.restore();
      }

      // Striker - Cross pattern for whirlwind attacks
      if (unit.type === 'striker') {
        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);
        ctx.rotate(rotation);
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.beginPath();
        // Curved lines for whirlwind effect
        ctx.moveTo(-radius, -radius);
        ctx.lineTo(radius, radius);
        ctx.moveTo(radius, -radius);
        ctx.lineTo(-radius, radius);
        ctx.stroke();
        // Add curved motion lines
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.6, 0, Math.PI * 0.5);
        ctx.arc(0, 0, radius * 0.6, Math.PI, Math.PI * 1.5);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();

    if (unit.shieldActive) {
      drawShieldDome(ctx, unit, screenPos, color);
    }

    if (unit.healPulseActive) {
      drawHealPulse(ctx, unit, screenPos, color);
    }

    if (unit.missileBarrageActive) {
      drawMissileBarrage(ctx, unit, screenPos, color);
    }

    if (unit.bombardmentActive) {
      drawBombardment(ctx, unit, color, state);
    }
    
    if (unit.laserBeam && Date.now() < unit.laserBeam.endTime) {
      drawUnitLaserBeam(ctx, unit, color);
    }
    
    if (unit.meleeAttackEffect) {
      drawMeleeAttack(ctx, unit, screenPos, color);
    }

    ctx.globalAlpha = 1.0;

    drawUnitHealthBar(ctx, unit, screenPos, color, state.settings.showNumericHP, state);

    // Skip modifier icons and multiplier for mining drones
    if (unit.type !== 'miningDrone') {
      // Draw modifier icons above the unit
      const unitDef = UNIT_DEFINITIONS[unit.type];
      if (unitDef.modifiers && unitDef.modifiers.length > 0) {
        const iconSize = 12;
        const iconSpacing = 14;
        const totalWidth = unitDef.modifiers.length * iconSpacing - 2;
        const startX = screenPos.x - totalWidth / 2;
        const iconY = screenPos.y - metersToPixels(getUnitSizeMeters(unit) / 2) - 30;
        
        ctx.save();
        ctx.font = `${iconSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 3;
        
        unitDef.modifiers.forEach((modifier, idx) => {
          const icon = getModifierIcon(modifier);
          const x = startX + idx * iconSpacing;
          ctx.fillText(icon, x, iconY);
        });
        
        ctx.restore();
      }

      ctx.fillStyle = COLORS.white;
      ctx.font = '10px Space Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${unit.damageMultiplier.toFixed(1)}x`, screenPos.x, screenPos.y + 20);
    }
  });
}

// Draw motion blur trail for fast-moving units
function drawMotionBlurTrail(
  ctx: CanvasRenderingContext2D,
  unit: Unit,
  screenPos: { x: number; y: number },
  color: string,
  state: GameState,
  playfieldRotation: number,
): void {
  if (unit.rotation === undefined || unit.rotation === null) return;
  
  const speed = unit.currentSpeed || 0;
  const speedRatio = Math.min(speed / 5, 1); // Normalize speed to 0-1 range
  
  // Calculate trail direction (opposite of movement)
  const trailAngle = unit.rotation + playfieldRotation + Math.PI;
  const trailLength = 15 * speedRatio; // Trail length based on speed
  
  // Create gradient for trail
  const endX = screenPos.x + Math.cos(trailAngle) * trailLength;
  const endY = screenPos.y + Math.sin(trailAngle) * trailLength;
  
  const gradient = ctx.createLinearGradient(screenPos.x, screenPos.y, endX, endY);
  gradient.addColorStop(0, addAlphaToColor(color, 0.4 * speedRatio));
  gradient.addColorStop(0.5, addAlphaToColor(color, 0.2 * speedRatio));
  gradient.addColorStop(1, addAlphaToColor(color, 0));
  
  ctx.save();
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 8 * speedRatio;
  ctx.lineCap = 'round';
  
  // Draw multiple trail lines for thickness
  for (let i = -1; i <= 1; i++) {
    const offset = i * 2;
    const perpAngle = trailAngle + Math.PI / 2;
    const offsetX = Math.cos(perpAngle) * offset;
    const offsetY = Math.sin(perpAngle) * offset;
    
    ctx.beginPath();
    ctx.moveTo(screenPos.x + offsetX, screenPos.y + offsetY);
    ctx.lineTo(endX + offsetX, endY + offsetY);
    ctx.stroke();
  }
  
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, unit: Unit): void {
  if (!unit.particles || unit.particles.length === 0) return;
  
  const time = Date.now() / 1000;
  // Convert unit-relative particle sizing into pixels for consistent scaling.
  const baseParticleSize = metersToPixels(UNIT_PARTICLE_BASE_SIZE_METERS);
  const baseTrailWidth = metersToPixels(UNIT_PARTICLE_TRAIL_WIDTH_METERS);
  
  unit.particles.forEach((particle, index) => {
    const screenPos = positionToPixels(particle.position);
    
    ctx.save();
    
    // Draw trail first (behind the particle) with enhanced effects
    if (particle.trail && particle.trail.length > 1) {
      ctx.strokeStyle = particle.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      // Draw trail with fading opacity and glow
      for (let i = 0; i < particle.trail.length - 1; i++) {
        const trailPos1 = positionToPixels(particle.trail[i]);
        const trailPos2 = positionToPixels(particle.trail[i + 1]);
        
        // Calculate opacity based on position in trail (fade towards end)
        // Safe division: trail.length is guaranteed to be > 1 from the outer check
        const alpha = 1 - (i / Math.max(particle.trail.length, 1));
        ctx.globalAlpha = alpha * 0.8;
        // Scale trail width with unit size so particle trails match larger units.
        ctx.lineWidth = baseTrailWidth * alpha;
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = baseParticleSize * 2 * alpha;
        
        ctx.beginPath();
        ctx.moveTo(trailPos1.x, trailPos1.y);
        ctx.lineTo(trailPos2.x, trailPos2.y);
        ctx.stroke();
      }
    }
    
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;
    
    // Add subtle size variation based on orbital position
    const sizeVariation = Math.sin(time * 3 + index * 0.5) * 0.3 + 1;
    // Scale particle size with unit size while preserving the shimmer animation.
    const particleSize = baseParticleSize * sizeVariation;
    
    // Draw particle with enhanced glow effect and color variation
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = baseParticleSize * 4.5;
    
    // Outer glow layer
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, particleSize * 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Main particle circle
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = baseParticleSize * 4;
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, particleSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw brighter inner core with stronger glow
    ctx.shadowBlur = baseParticleSize * 7;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, particleSize * 0.6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  });
}

function drawSnaker(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string): void {
  // Scale snaker segments with unit size to keep the silhouette consistent.
  const segmentSize = metersToPixels(UNIT_SIZE_METERS * 0.3);
  const segmentSpacing = metersToPixels(UNIT_SIZE_METERS * 0.4);
  const wobbleAmplitude = metersToPixels(UNIT_SIZE_METERS * 0.15);
  const segments = 5;

  for (let i = 0; i < segments; i++) {
    const offset = i * segmentSpacing;
    const angle = (unit.distanceTraveled * 2 + i * 0.5) % (Math.PI * 2);
    const wobble = Math.sin(angle) * wobbleAmplitude;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(screenPos.x - offset + wobble, screenPos.y - segmentSize);
    ctx.lineTo(screenPos.x - offset - segmentSize + wobble, screenPos.y);
    ctx.lineTo(screenPos.x - offset + wobble, screenPos.y + segmentSize);
    ctx.closePath();
    ctx.fill();
  }
}

function drawTank(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string): void {
  const size = metersToPixels(UNIT_SIZE_METERS);

  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;

  ctx.fillRect(screenPos.x - size / 2, screenPos.y - size / 2, size, size);
  ctx.strokeRect(screenPos.x - size / 2, screenPos.y - size / 2, size, size);
}

function drawScout(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string): void {
  const radius = metersToPixels(UNIT_SIZE_METERS / 2) * 0.7;

  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.moveTo(screenPos.x, screenPos.y - radius * 1.2);
  ctx.lineTo(screenPos.x + radius, screenPos.y + radius);
  ctx.lineTo(screenPos.x - radius, screenPos.y + radius);
  ctx.closePath();
  ctx.fill();
}

function drawArtillery(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string): void {
  const radius = metersToPixels(UNIT_SIZE_METERS / 2);

  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;

  ctx.fillRect(screenPos.x - radius, screenPos.y - radius / 2, radius * 2, radius);

  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(screenPos.x, screenPos.y);
  ctx.lineTo(screenPos.x + radius * 1.5, screenPos.y - radius);
  ctx.stroke();
}

function drawMedic(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string): void {
  const radius = metersToPixels(UNIT_SIZE_METERS / 2);

  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.white;
  const crossSize = radius * 0.6;
  ctx.fillRect(screenPos.x - crossSize / 2, screenPos.y - crossSize / 6, crossSize, crossSize / 3);
  ctx.fillRect(screenPos.x - crossSize / 6, screenPos.y - crossSize / 2, crossSize / 3, crossSize);
}

function drawInterceptor(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string): void {
  const radius = metersToPixels(UNIT_SIZE_METERS / 2) * 0.8;

  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.moveTo(screenPos.x, screenPos.y - radius * 1.4);
  ctx.lineTo(screenPos.x + radius * 0.6, screenPos.y);
  ctx.lineTo(screenPos.x, screenPos.y + radius);
  ctx.lineTo(screenPos.x - radius * 0.6, screenPos.y);
  ctx.closePath();
  ctx.fill();
}

function drawShieldDome(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string): void {
  if (!unit.shieldActive) return;

  const radius = metersToPixels(unit.shieldActive.radius);
  const time = Date.now() / 1000;
  const pulse = Math.sin(time * 3) * 0.2 + 0.8;
  const hexRotation = time * 0.5; // Pre-calculate rotation for all hexagons

  ctx.save();
  
  // Draw outer shield circle with pulsing effect
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.4 * pulse;
  ctx.setLineDash([5, 5]);

  ctx.beginPath();
  ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Draw hexagonal pattern inside the shield
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1.5;
  
  const hexSize = radius * 0.25;
  const hexCols = Math.min(Math.ceil(radius * 2 / (hexSize * Math.sqrt(3))), 8); // Limit to 8 columns
  const hexRows = Math.min(Math.ceil(radius * 2 / (hexSize * 1.5)), 8); // Limit to 8 rows
  
  for (let row = -hexRows; row <= hexRows; row++) {
    for (let col = -hexCols; col <= hexCols; col++) {
      const x = screenPos.x + col * hexSize * Math.sqrt(3) + (row % 2) * hexSize * Math.sqrt(3) / 2;
      const y = screenPos.y + row * hexSize * 1.5;
      
      // Only draw hexagons within shield radius
      const dist = Math.sqrt((x - screenPos.x) ** 2 + (y - screenPos.y) ** 2);
      if (dist > radius - hexSize) continue;
      
      // Draw hexagon with pre-calculated rotation
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i + hexRotation;
        const hx = x + Math.cos(angle) * hexSize;
        const hy = y + Math.sin(angle) * hexSize;
        if (i === 0) {
          ctx.moveTo(hx, hy);
        } else {
          ctx.lineTo(hx, hy);
        }
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  // Draw filled shield with gradient
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
  ctx.fill();

  // Draw bright inner ring
  ctx.globalAlpha = 0.5 * pulse;
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(screenPos.x, screenPos.y, radius * 0.95, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawHealPulse(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string): void {
  if (!unit.healPulseActive) return;

  const progress = (Date.now() - (unit.healPulseActive.endTime - 1000)) / 1000;
  const radius = metersToPixels(unit.healPulseActive.radius * progress);
  const alpha = Math.max(0, 1 - progress);

  ctx.save();
  
  // Draw multiple expanding healing waves
  const healColor = 'oklch(0.70 0.20 140)';
  
  // Outer wave
  ctx.strokeStyle = healColor;
  ctx.lineWidth = 4;
  ctx.globalAlpha = alpha * 0.6;
  ctx.shadowColor = healColor;
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  
  // Inner wave (slightly delayed)
  if (progress > 0.2) {
    const innerProgress = (progress - 0.2) / 0.8;
    const innerRadius = metersToPixels(unit.healPulseActive.radius * innerProgress);
    ctx.globalAlpha = alpha * 0.8;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, innerRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  // Draw plus symbols around the pulse
  const plusCount = 8;
  ctx.globalAlpha = alpha * 0.7;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  
  for (let i = 0; i < plusCount; i++) {
    const angle = (i / plusCount) * Math.PI * 2 + progress * Math.PI;
    const x = screenPos.x + Math.cos(angle) * radius * 0.8;
    const y = screenPos.y + Math.sin(angle) * radius * 0.8;
    const size = 8;
    
    // Draw plus
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.stroke();
  }
  
  // Draw filled glow in center
  ctx.globalAlpha = alpha * 0.2;
  ctx.fillStyle = healColor;
  ctx.beginPath();
  ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMissileBarrage(ctx: CanvasRenderingContext2D, unit: Unit, screenPos: { x: number; y: number }, color: string): void {
  if (!unit.missileBarrageActive) return;

  const progress = (Date.now() - (unit.missileBarrageActive.endTime - 1500)) / 1500;

  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;

  unit.missileBarrageActive.missiles.forEach((missile, index) => {
    const currentPos = {
      x: missile.position.x + (missile.target.x - missile.position.x) * progress,
      y: missile.position.y + (missile.target.y - missile.position.y) * progress,
    };
    const currentScreenPos = positionToPixels(currentPos);
    
    // Draw missile trail
    if (progress > 0.1) {
      const trailLength = 3; // Reduced from 5 for better performance
      const trailProgress = Math.max(0, progress - 0.1);
      
      // Pre-calculate direction vector and step
      const dx = missile.target.x - missile.position.x;
      const dy = missile.target.y - missile.position.y;
      const stepSize = 0.03; // Increased step for fewer calculations
      
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      
      ctx.beginPath();
      for (let i = 0; i < trailLength; i++) {
        const t = trailProgress - i * stepSize;
        const trailPos = {
          x: missile.position.x + dx * t,
          y: missile.position.y + dy * t,
        };
        const trailScreenPos = positionToPixels(trailPos);
        
        if (i === 0) {
          ctx.moveTo(trailScreenPos.x, trailScreenPos.y);
        } else {
          ctx.lineTo(trailScreenPos.x, trailScreenPos.y);
        }
      }
      ctx.stroke();
    }
    
    // Draw missile head
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(currentScreenPos.x, currentScreenPos.y, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw missile glow
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(currentScreenPos.x, currentScreenPos.y, 7, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawBombardment(ctx: CanvasRenderingContext2D, unit: Unit, color: string, state: GameState): void {
  if (!unit.bombardmentActive) return;

  const targetScreen = positionToPixels(unit.bombardmentActive.targetPos);
  const now = Date.now();
  const time = now / 1000;

  if (now < unit.bombardmentActive.impactTime) {
    // Targeting phase with enhanced reticle
    const timeToImpact = unit.bombardmentActive.impactTime - now;
    const urgency = Math.max(0, 1 - timeToImpact / 1000);
    
    ctx.save();
    ctx.strokeStyle = color;
    
    // Rotating outer circle
    ctx.save();
    ctx.translate(targetScreen.x, targetScreen.y);
    ctx.rotate(time * 2);
    ctx.translate(-targetScreen.x, -targetScreen.y);
    
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.arc(targetScreen.x, targetScreen.y, metersToPixels(3), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    
    // Inner targeting circle
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(targetScreen.x, targetScreen.y, metersToPixels(2), 0, Math.PI * 2);
    ctx.stroke();
    
    // Crosshairs
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    ctx.lineCap = 'round';
    const crossSize = metersToPixels(3.5);
    
    ctx.beginPath();
    ctx.moveTo(targetScreen.x - crossSize, targetScreen.y);
    ctx.lineTo(targetScreen.x - crossSize * 0.3, targetScreen.y);
    ctx.moveTo(targetScreen.x + crossSize * 0.3, targetScreen.y);
    ctx.lineTo(targetScreen.x + crossSize, targetScreen.y);
    ctx.moveTo(targetScreen.x, targetScreen.y - crossSize);
    ctx.lineTo(targetScreen.x, targetScreen.y - crossSize * 0.3);
    ctx.moveTo(targetScreen.x, targetScreen.y + crossSize * 0.3);
    ctx.lineTo(targetScreen.x, targetScreen.y + crossSize);
    ctx.stroke();
    
    // Pulsing center dot
    const pulse = Math.sin(time * 8) * 0.3 + 0.7;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 * urgency;
    ctx.beginPath();
    ctx.arc(targetScreen.x, targetScreen.y, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Warning corners
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.8 * urgency;
    const cornerSize = metersToPixels(3.5);
    const cornerLength = 15;
    
    // Top-left
    ctx.beginPath();
    ctx.moveTo(targetScreen.x - cornerSize, targetScreen.y - cornerSize + cornerLength);
    ctx.lineTo(targetScreen.x - cornerSize, targetScreen.y - cornerSize);
    ctx.lineTo(targetScreen.x - cornerSize + cornerLength, targetScreen.y - cornerSize);
    ctx.stroke();
    
    // Top-right
    ctx.beginPath();
    ctx.moveTo(targetScreen.x + cornerSize - cornerLength, targetScreen.y - cornerSize);
    ctx.lineTo(targetScreen.x + cornerSize, targetScreen.y - cornerSize);
    ctx.lineTo(targetScreen.x + cornerSize, targetScreen.y - cornerSize + cornerLength);
    ctx.stroke();
    
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(targetScreen.x - cornerSize, targetScreen.y + cornerSize - cornerLength);
    ctx.lineTo(targetScreen.x - cornerSize, targetScreen.y + cornerSize);
    ctx.lineTo(targetScreen.x - cornerSize + cornerLength, targetScreen.y + cornerSize);
    ctx.stroke();
    
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(targetScreen.x + cornerSize - cornerLength, targetScreen.y + cornerSize);
    ctx.lineTo(targetScreen.x + cornerSize, targetScreen.y + cornerSize);
    ctx.lineTo(targetScreen.x + cornerSize, targetScreen.y + cornerSize - cornerLength);
    ctx.stroke();

    ctx.restore();
  } else {
    // Explosion phase
    const explosionProgress = (now - unit.bombardmentActive.impactTime) / (unit.bombardmentActive.endTime - unit.bombardmentActive.impactTime);
    const radius = metersToPixels(3 * (1 + explosionProgress * 0.5));

    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = Math.max(0, 0.6 - explosionProgress * 0.6);

    ctx.beginPath();
    ctx.arc(targetScreen.x, targetScreen.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

function drawMeleeAttack(ctx: CanvasRenderingContext2D, unit: Unit, unitScreenPos: { x: number; y: number }, color: string): void {
  if (!unit.meleeAttackEffect) return;
  
  const now = Date.now();
  const targetScreenPos = positionToPixels(unit.meleeAttackEffect.targetPos);
  const progress = 1 - ((unit.meleeAttackEffect.endTime - now) / 200);
  
  ctx.save();
  
  // Draw slash effect - expanding line from unit to target
  ctx.strokeStyle = color;
  ctx.lineWidth = 4 - progress * 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 15;
  ctx.globalAlpha = 1 - progress;
  
  ctx.beginPath();
  ctx.moveTo(unitScreenPos.x, unitScreenPos.y);
  ctx.lineTo(targetScreenPos.x, targetScreenPos.y);
  ctx.stroke();
  
  // Draw impact burst at target
  ctx.fillStyle = color;
  const burstRadius = 5 + progress * 15;
  ctx.globalAlpha = (1 - progress) * 0.5;
  
  ctx.beginPath();
  ctx.arc(targetScreenPos.x, targetScreenPos.y, burstRadius, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

function drawUnitLaserBeam(ctx: CanvasRenderingContext2D, unit: Unit, color: string): void {
  if (!unit.laserBeam) return;
  
  const direction = unit.laserBeam.direction;
  const range = unit.laserBeam.range;
  const unitScreen = positionToPixels(unit.position);
  const endPos = add(unit.position, scale(direction, range));
  const endScreen = positionToPixels(endPos);
  
  const timeLeft = unit.laserBeam.endTime - Date.now();
  const fadeProgress = 1 - Math.min(1, timeLeft / ABILITY_LASER_DURATION);
  
  ctx.save();
  
  // Try to use laser sprites
  const beginSprite = getSpriteFromCache(laserSpritePaths.beginning);
  const middleSprite = getSpriteFromCache(laserSpritePaths.middle);
  const endSprite = getSpriteFromCache(laserSpritePaths.end);
  
  const allSpritesReady = isSpriteReady(beginSprite) && isSpriteReady(middleSprite) && isSpriteReady(endSprite);
  
  if (allSpritesReady) {
    // Calculate angle for rotation
    const angle = Math.atan2(direction.y, direction.x);
    
    // Laser segment dimensions (in pixels)
    const segmentHeight = metersToPixels(0.4); // Width of the laser beam (slightly thinner than base laser)
    const beginWidth = metersToPixels(0.8); // Width of beginning segment
    const middleWidth = metersToPixels(0.8); // Width of middle segment
    const endWidth = metersToPixels(0.8); // Width of end segment
    
    // Calculate total laser length in pixels
    const totalLength = metersToPixels(range);
    
    // Calculate how many middle segments we need
    const middleSegmentCount = Math.max(0, Math.floor((totalLength - beginWidth - endWidth) / middleWidth));
    const actualMiddleWidth = middleSegmentCount > 0 ? (totalLength - beginWidth - endWidth) / middleSegmentCount : 0;
    
    ctx.save();
    ctx.translate(unitScreen.x, unitScreen.y);
    ctx.rotate(angle);
    ctx.globalAlpha = (1 - fadeProgress) * 0.9;
    
    // Draw beginning segment
    ctx.drawImage(
      beginSprite,
      0,
      -segmentHeight / 2,
      beginWidth,
      segmentHeight
    );
    
    // Draw middle segments (repeated to fill the length)
    let currentX = beginWidth;
    for (let i = 0; i < middleSegmentCount; i++) {
      ctx.drawImage(
        middleSprite,
        currentX,
        -segmentHeight / 2,
        actualMiddleWidth,
        segmentHeight
      );
      currentX += actualMiddleWidth;
    }
    
    // Draw end segment
    ctx.drawImage(
      endSprite,
      currentX,
      -segmentHeight / 2,
      endWidth,
      segmentHeight
    );
    
    ctx.restore();
  } else {
    // Fallback to original line rendering if sprites not loaded
    // Draw outer glow
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.globalAlpha = (1 - fadeProgress) * 0.3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    
    ctx.beginPath();
    ctx.moveTo(unitScreen.x, unitScreen.y);
    ctx.lineTo(endScreen.x, endScreen.y);
    ctx.stroke();
    
    // Draw core beam
    ctx.lineWidth = 3;
    ctx.globalAlpha = (1 - fadeProgress) * 0.9;
    ctx.shadowBlur = 10;
    
    ctx.beginPath();
    ctx.moveTo(unitScreen.x, unitScreen.y);
    ctx.lineTo(endScreen.x, endScreen.y);
    ctx.stroke();
  }
  
  ctx.restore();
}

function drawSelectionIndicators(ctx: CanvasRenderingContext2D, state: GameState): void {
  const time = Date.now() / 1000;
  const now = Date.now();
  
  state.units.forEach((unit) => {
    if (!state.selectedUnits.has(unit.id)) {
      // Clear selection ring if unit is deselected
      delete unit.selectionRing;
      return;
    }
    
    // Initialize selection ring animation if newly selected
    if (!unit.selectionRing) {
      unit.selectionRing = { startTime: now };
    }

    const screenPos = positionToPixels(unit.position);
    const baseRadius = metersToPixels(UNIT_SIZE_METERS / 2) + 4;
    const color = state.players[unit.owner].color;

    // Animated pulsing effect
    const pulse = Math.sin(time * 3) * 0.2 + 0.8; // Pulse between 0.6 and 1.0
    const radius = baseRadius * (1 + pulse * 0.15); // Pulse size slightly

    ctx.save();
    
    // Draw expanding selection ring on initial selection (first 0.5 seconds)
    const selectionAge = (now - unit.selectionRing.startTime) / 1000;
    if (selectionAge < 0.5) {
      const expandProgress = selectionAge / 0.5;
      const expandRadius = baseRadius + expandProgress * baseRadius * 1.2;
      const expandAlpha = 1 - expandProgress;
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = expandAlpha * 0.6;
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, expandRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Draw outer rotating ring
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.setLineDash([8, 8]);
    ctx.lineDashOffset = time * 20; // Rotate clockwise
    
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius + 6, 0, Math.PI * 2);
    ctx.stroke();
    
    // Draw outer glow ring
    ctx.lineWidth = 3;
    ctx.globalAlpha = pulse * 0.4;
    ctx.shadowBlur = 15;
    ctx.setLineDash([]);
    
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius + 3, 0, Math.PI * 2);
    ctx.stroke();

    // Draw main selection ring
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -time * 10; // Animate dash counter-clockwise
    
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Draw corner markers for a more tactical look
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    const markerSize = 6;
    const markerDist = radius + 2;
    
    // Draw 4 corner brackets that rotate slightly
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI / 2) + Math.PI / 4 + Math.sin(time * 2) * 0.05;
      const x = screenPos.x + Math.cos(angle) * markerDist;
      const y = screenPos.y + Math.sin(angle) * markerDist;
      
      // Draw bracket with enhanced glow
      ctx.globalAlpha = 0.8 + pulse * 0.2;
      ctx.beginPath();
      ctx.moveTo(x - markerSize * Math.cos(angle - Math.PI / 4), y - markerSize * Math.sin(angle - Math.PI / 4));
      ctx.lineTo(x, y);
      ctx.lineTo(x - markerSize * Math.cos(angle + Math.PI / 4), y - markerSize * Math.sin(angle + Math.PI / 4));
      ctx.stroke();
    }

    ctx.restore();
  });
}

function drawAbilityRangeIndicators(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Only draw for selected player units.
  const selectedPlayerUnits = Array.from(state.selectedUnits)
    .map(id => state.units.find(u => u.id === id))
    .filter(u => u && u.owner === 0);

  if (selectedPlayerUnits.length === 0) return;

  // Track whether the player is actively dragging an ability arrow.
  const isAbilityDragActive = Boolean(state.abilityCastPreview);
  const time = Date.now() / 1000;

  selectedPlayerUnits.forEach(unit => {
    if (!unit) return;

    const def = UNIT_DEFINITIONS[unit.type];
    const screenPos = positionToPixels(unit.position);
    
    // Draw attack range only when not actively dragging an ability arrow.
    if (!isAbilityDragActive && def.attackRange > 0) {
      const attackRangePixels = metersToPixels(def.attackRange);
      
      ctx.save();
      ctx.strokeStyle = state.players[unit.owner].color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.2 + Math.sin(time * 2) * 0.1;
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = time * 10;
      
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, attackRangePixels, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Draw ability range only while the player is dragging an ability arrow.
    if (isAbilityDragActive) {
      const abilityRangePixels = metersToPixels(ABILITY_MAX_RANGE);
      
      ctx.save();
      ctx.strokeStyle = COLORS.telegraph;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.15 + Math.sin(time * 3) * 0.05;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -time * 15;
      
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, abilityRangePixels, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  });
}

function drawHUD(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = COLORS.white;
  ctx.font = '14px Space Grotesk, sans-serif';
  ctx.textAlign = 'left';

  const p1 = state.players[0];
  
  // Enhanced photon display with glow and pulse
  const time = Date.now() / 1000;
  const pulse = Math.sin(time * 3) * 0.3 + 0.7; // Pulsing between 0.4 and 1.0
  
  ctx.save();
  ctx.shadowColor = COLORS.photon;
  ctx.shadowBlur = 10 + pulse * 5;
  ctx.fillStyle = COLORS.photon;
  ctx.fillText(`Photons: ${Math.floor(p1.photons)}`, 10, 20);
  ctx.restore();
  
  // Income rate with subtle glow
  ctx.save();
  ctx.fillStyle = 'oklch(0.75 0.15 95)';
  ctx.shadowColor = COLORS.photon;
  ctx.shadowBlur = 5;
  ctx.fillText(`+${p1.incomeRate}/s`, 100, 20);
  ctx.restore();

  ctx.fillStyle = COLORS.white;
  ctx.fillText(`Time: ${Math.floor(state.elapsedTime)}s`, 10, 40);
  
  // Draw chess mode timer if enabled
  if (state.settings.chessMode && state.chessMode) {
    const turnElapsed = state.elapsedTime - state.chessMode.turnStartTime;
    const turnRemaining = Math.max(0, state.chessMode.turnDuration - turnElapsed);
    const secs = Math.floor(turnRemaining);
    const phase = state.chessMode.turnPhase;
    
    // Color based on phase and time remaining
    let timerColor = COLORS.photon;
    if (phase === 'planning') {
      if (secs <= 3) {
        timerColor = 'oklch(0.62 0.28 25)'; // Red when running out
      } else if (secs <= 5) {
        timerColor = 'oklch(0.85 0.20 95)'; // Yellow warning
      }
    }
    
    ctx.save();
    ctx.fillStyle = timerColor;
    ctx.shadowColor = timerColor;
    ctx.shadowBlur = 10;
    ctx.font = '16px Orbitron, sans-serif';
    ctx.fillText(`♟ ${phase.toUpperCase()}: ${secs}s`, 10, 60);
    ctx.restore();
    
    ctx.font = '14px Space Grotesk, sans-serif';
  } else {
    // Original formation display when chess mode is not active
    // Draw current formation indicator
    if (state.currentFormation && state.currentFormation !== 'none') {
      const formationName = getFormationName(state.currentFormation);
      ctx.fillStyle = COLORS.telegraph;
      ctx.fillText(`Formation: ${formationName}`, 10, 60);
    } else if (state.elapsedTime < 15) {
      // Show hint for first 15 seconds
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '12px Space Grotesk, sans-serif';
      ctx.fillText('Press F to cycle formations', 10, 60);
      ctx.font = '14px Space Grotesk, sans-serif';
    }
  }
  
  // Draw patrol mode indicator
  const patrolY = 80;
  if (state.patrolMode) {
    ctx.fillStyle = COLORS.photon;
    ctx.fillText('PATROL MODE', 10, patrolY);
  } else if (state.elapsedTime < 15 && !state.settings.chessMode) {
    // Show hint for first 15 seconds (only if not in chess mode)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '12px Space Grotesk, sans-serif';
    ctx.fillText('Hold P for patrol', 10, patrolY);
    ctx.font = '14px Space Grotesk, sans-serif';
  }
  
  if (state.matchTimeLimit) {
    const timeRemaining = Math.max(0, state.matchTimeLimit - state.elapsedTime);
    const mins = Math.floor(timeRemaining / 60);
    const secs = Math.floor(timeRemaining % 60);
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
    
    if (timeRemaining <= 30) {
      ctx.fillStyle = 'oklch(0.62 0.28 25)';
    } else if (timeRemaining <= 60) {
      ctx.fillStyle = 'oklch(0.85 0.20 95)';
    } else {
      ctx.fillStyle = COLORS.white;
    }
    
    ctx.font = '18px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(timeStr, ctx.canvas.width / 2, 30);
    ctx.textAlign = 'left';
    ctx.font = '14px Space Grotesk, sans-serif';
  }
  
  // Draw FPS counter and performance stats in top right
  if (state.fps !== undefined) {
    ctx.textAlign = 'right';
    const fpsColor = state.fps >= FPS_GOOD_THRESHOLD ? FPS_COLOR_GOOD : state.fps >= FPS_OK_THRESHOLD ? FPS_COLOR_OK : FPS_COLOR_BAD;
    ctx.fillStyle = fpsColor;
    ctx.fillText(`${state.fps} FPS`, ctx.canvas.width - 10, 20);
    
    // Draw network status for online games
    if (state.vsMode === 'online' && state.networkStatus) {
      ctx.font = '12px Space Mono, monospace';
      const netStatus = state.networkStatus;
      const statusColor = netStatus.connected ? 'oklch(0.70 0.20 140)' : 'oklch(0.62 0.28 25)';
      ctx.fillStyle = statusColor;
      const statusText = netStatus.connected 
        ? `Online ${netStatus.latency ? `(${netStatus.latency}ms)` : ''}`
        : 'Disconnected';
      ctx.fillText(statusText, ctx.canvas.width - 10, 35);
    }
    
    // Draw detailed performance stats if enabled
    if (state.performanceProfiling?.enabled) {
      const yOffset = state.vsMode === 'online' && state.networkStatus ? 15 : 0;
      ctx.font = '12px Space Mono, monospace';
      ctx.fillStyle = COLORS.white;
      const prof = state.performanceProfiling;
      ctx.fillText(`Frame: ${prof.avgFrameTime.toFixed(2)}ms`, ctx.canvas.width - 10, 40 + yOffset);
      ctx.fillText(`Update: ${prof.updateTime.toFixed(2)}ms`, ctx.canvas.width - 10, 55 + yOffset);
      ctx.fillText(`Render: ${prof.renderTime.toFixed(2)}ms`, ctx.canvas.width - 10, 70 + yOffset);
      
      // Draw frame time graph
      const graphWidth = 120;
      const graphHeight = 30;
      const graphX = ctx.canvas.width - graphWidth - 10;
      const graphY = 80 + yOffset;
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.strokeRect(graphX, graphY, graphWidth, graphHeight);
      
      // Draw frame times
      if (prof.frameTimings.length > 1) {
        ctx.strokeStyle = fpsColor;
        ctx.beginPath();
        prof.frameTimings.forEach((time, i) => {
          const x = graphX + (i / prof.frameTimings.length) * graphWidth;
          const y = graphY + graphHeight - Math.min((time / 33.33) * graphHeight, graphHeight); // 33.33ms = 30fps
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
        
        // Draw 16.67ms line (60fps target)
        ctx.strokeStyle = 'rgba(100, 255, 100, 0.3)';
        ctx.setLineDash([2, 2]);
        const targetY = graphY + graphHeight - (16.67 / 33.33) * graphHeight;
        ctx.beginPath();
        ctx.moveTo(graphX, targetY);
        ctx.lineTo(graphX + graphWidth, targetY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      
      ctx.font = '14px Space Grotesk, sans-serif';
    }
    
    ctx.textAlign = 'left';
  }
  
  // Draw control group indicators at bottom left
  if (state.controlGroups) {
    ctx.textAlign = 'left';
    ctx.font = '12px Space Mono, monospace';
    
    let yOffset = ctx.canvas.height - 10;
    for (let i = 8; i >= 1; i--) {
      const group = state.controlGroups[i];
      if (group && group.size > 0) {
        // Filter to living units
        const livingUnits = Array.from(group).filter(id => 
          state.units.some(u => u.id === id && u.hp > 0)
        );
        
        if (livingUnits.length > 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.fillText(`${i}: ${livingUnits.length}`, 10, yOffset);
          
          // Draw small colored bar indicating unit types
          const barWidth = 40;
          const barHeight = 4;
          const barX = 35;
          const barY = yOffset - 8;
          
          // Count unit types in group
          const unitTypes = livingUnits.map(id => {
            const unit = state.units.find(u => u.id === id);
            return unit ? unit.type : null;
          }).filter(t => t !== null);
          
          ctx.fillStyle = state.players[0].color;
          ctx.fillRect(barX, barY, barWidth, barHeight);
          
          yOffset -= 15;
        }
      }
    }
  }
  
  // Draw tooltip if visible
  if (state.tooltip && state.tooltip.visible && state.tooltip.text.length > 0) {
    drawTooltip(ctx, state.tooltip.text, state.tooltip.position);
  }
}

function drawTooltip(ctx: CanvasRenderingContext2D, text: string[], position: Vector2): void {
  const screenPos = positionToPixels(position);
  const padding = 8;
  const lineHeight = 16;
  const maxWidth = 200;
  
  ctx.font = '12px Space Grotesk, sans-serif';
  
  // Measure text
  const lines = text;
  let width = 0;
  lines.forEach(line => {
    const measure = ctx.measureText(line);
    width = Math.max(width, measure.width);
  });
  width = Math.min(width + padding * 2, maxWidth);
  const height = lines.length * lineHeight + padding * 2;
  
  // Position tooltip to not go off screen
  let x = screenPos.x + 15;
  let y = screenPos.y - height - 5;
  
  if (x + width > ctx.canvas.width) {
    x = screenPos.x - width - 15;
  }
  if (y < 0) {
    y = screenPos.y + 20;
  }
  
  // Draw background
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.strokeStyle = 'oklch(0.65 0.25 240)';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'oklch(0.65 0.25 240)';
  ctx.shadowBlur = 10;
  
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);
  
  // Draw text
  ctx.shadowBlur = 0;
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = 'left';
  lines.forEach((line, i) => {
    ctx.fillText(line, x + padding, y + padding + lineHeight * (i + 0.7));
  });
  
  ctx.restore();
}

function drawSelectionRect(ctx: CanvasRenderingContext2D, rect: { x1: number; y1: number; x2: number; y2: number }, state: GameState): void {
  const minX = Math.min(rect.x1, rect.x2);
  const maxX = Math.max(rect.x1, rect.x2);
  const minY = Math.min(rect.y1, rect.y2);
  const maxY = Math.max(rect.y1, rect.y2);
  const width = maxX - minX;
  const height = maxY - minY;
  
  const time = Date.now() / 1000;
  const color = COLORS.playerDefault; // Use player color for selection

  ctx.save();
  
  // Draw gradient fill with proper rgba format
  const gradient = ctx.createLinearGradient(minX, minY, maxX, maxY);
  gradient.addColorStop(0, `${color.replace(')', ' / 0.08)')}`);
  gradient.addColorStop(0.5, `${color.replace(')', ' / 0.03)')}`);
  gradient.addColorStop(1, `${color.replace(')', ' / 0.08)')}`);
  ctx.fillStyle = gradient;
  ctx.fillRect(minX, minY, width, height);
  
  // Draw animated border
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);
  ctx.lineDashOffset = time * 20; // Animate dashes
  ctx.globalAlpha = 0.9;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.strokeRect(minX, minY, width, height);
  
  // Draw corner highlights
  ctx.setLineDash([]);
  ctx.lineWidth = 3;
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 15;
  const cornerSize = 12;
  
  // Top-left corner
  ctx.beginPath();
  ctx.moveTo(minX, minY + cornerSize);
  ctx.lineTo(minX, minY);
  ctx.lineTo(minX + cornerSize, minY);
  ctx.stroke();
  
  // Top-right corner
  ctx.beginPath();
  ctx.moveTo(maxX - cornerSize, minY);
  ctx.lineTo(maxX, minY);
  ctx.lineTo(maxX, minY + cornerSize);
  ctx.stroke();
  
  // Bottom-right corner
  ctx.beginPath();
  ctx.moveTo(maxX, maxY - cornerSize);
  ctx.lineTo(maxX, maxY);
  ctx.lineTo(maxX - cornerSize, maxY);
  ctx.stroke();
  
  // Bottom-left corner
  ctx.beginPath();
  ctx.moveTo(minX + cornerSize, maxY);
  ctx.lineTo(minX, maxY);
  ctx.lineTo(minX, maxY - cornerSize);
  ctx.stroke();
  
  ctx.restore();
}

function drawAbilityCastPreview(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.abilityCastPreview) return;
  
  const { dragVector } = state.abilityCastPreview;
  
  // Get all selected units
  const selectedUnits = state.units.filter(unit => state.selectedUnits.has(unit.id));
  if (selectedUnits.length === 0) return;
  
  const color = state.players[selectedUnits[0].owner].color;
  const time = Date.now() / 1000;
  
  ctx.save();
  
  // Helper function to get command origin for a unit (last queued position or current position)
  const getUnitCommandOrigin = (unit: Unit): Vector2 => {
    for (let i = unit.commandQueue.length - 1; i >= 0; i--) {
      const node = unit.commandQueue[i];
      if (node.type === 'move' || node.type === 'attack-move') {
        return node.position;
      }
    }
    return unit.position;
  };
  
  // Draw arrows from each selected unit
  selectedUnits.forEach(unit => {
    const unitOrigin = getUnitCommandOrigin(unit);
    const originScreen = positionToPixels(unitOrigin);
    const endPos = add(unitOrigin, dragVector);
    const endScreen = positionToPixels(endPos);
    
    // Draw the line from unit's command origin to target
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.7; // Slightly more transparent since there may be multiple lines
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.setLineDash([8, 4]);
    ctx.lineDashOffset = time * 20; // Animate dashes
    
    ctx.beginPath();
    ctx.moveTo(originScreen.x, originScreen.y);
    ctx.lineTo(endScreen.x, endScreen.y);
    ctx.stroke();
    
    ctx.setLineDash([]);
    
    // Draw pulsing dot at command origin
    const originPulse = Math.sin(time * 3) * 0.3 + 0.7;
    ctx.globalAlpha = 0.8 * originPulse;
    ctx.shadowBlur = 15;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(originScreen.x, originScreen.y, 4 + originPulse * 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw arrow at the end
    const dx = endScreen.x - originScreen.x;
    const dy = endScreen.y - originScreen.y;
    const angle = Math.atan2(dy, dx);
    
    ctx.globalAlpha = 0.95;
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    
    ctx.save();
    ctx.translate(endScreen.x, endScreen.y);
    ctx.rotate(angle);
    
    // Draw larger arrow for preview
    const arrowLength = 16;
    const arrowWidth = 10;
    ctx.beginPath();
    ctx.moveTo(arrowLength, 0);
    ctx.lineTo(0, -arrowWidth);
    ctx.lineTo(0, arrowWidth);
    ctx.closePath();
    ctx.fill();
    
    ctx.restore();
  });
  
  // Draw distance indicator (only once, at the center of the first unit's arrow)
  const firstUnit = selectedUnits[0];
  const firstOrigin = getUnitCommandOrigin(firstUnit);
  const firstOriginScreen = positionToPixels(firstOrigin);
  const firstEndPos = add(firstOrigin, dragVector);
  const firstEndScreen = positionToPixels(firstEndPos);
  
  const dragLen = distance({ x: 0, y: 0 }, dragVector);
  const midScreen = {
    x: (firstOriginScreen.x + firstEndScreen.x) / 2,
    y: (firstOriginScreen.y + firstEndScreen.y) / 2
  };
  
  ctx.globalAlpha = 0.9;
  ctx.shadowBlur = 8;
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${dragLen.toFixed(1)}m`, midScreen.x, midScreen.y - 15);
  
  ctx.restore();
}

function drawBaseAbilityPreview(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.baseAbilityPreview) return;
  
  const { basePosition, direction, baseId } = state.baseAbilityPreview;
  
  // Find the base to get the player color
  const base = state.bases.find(b => b.id === baseId);
  if (!base) return;
  
  const color = state.players[base.owner].color;
  const time = Date.now() / 1000;
  
  ctx.save();
  
  // Draw a big arrow from the base in the laser direction
  const baseScreen = positionToPixels(basePosition);
  const endPos = add(basePosition, scale(direction, LASER_RANGE));
  const endScreen = positionToPixels(endPos);
  
  // Draw laser beam preview line
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.globalAlpha = 0.8;
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;
  ctx.setLineDash([12, 6]);
  ctx.lineDashOffset = time * 30; // Animate dashes faster for laser
  
  ctx.beginPath();
  ctx.moveTo(baseScreen.x, baseScreen.y);
  ctx.lineTo(endScreen.x, endScreen.y);
  ctx.stroke();
  
  ctx.setLineDash([]);
  
  // Draw pulsing glow at base
  const basePulse = Math.sin(time * 4) * 0.3 + 0.7;
  ctx.globalAlpha = 0.9 * basePulse;
  ctx.shadowBlur = 25;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(baseScreen.x, baseScreen.y, 8 + basePulse * 3, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw large arrow at the end
  const dx = endScreen.x - baseScreen.x;
  const dy = endScreen.y - baseScreen.y;
  const angle = Math.atan2(dy, dx);
  
  ctx.globalAlpha = 0.95;
  ctx.shadowBlur = 25;
  ctx.fillStyle = color;
  
  ctx.save();
  ctx.translate(endScreen.x, endScreen.y);
  ctx.rotate(angle);
  
  // Draw a bigger arrow for base ability
  const arrowLength = 24;
  const arrowWidth = 16;
  ctx.beginPath();
  ctx.moveTo(arrowLength, 0);
  ctx.lineTo(-arrowLength * 0.3, -arrowWidth);
  ctx.lineTo(-arrowLength * 0.3, arrowWidth);
  ctx.closePath();
  ctx.fill();
  
  // Draw arrowhead outline for extra emphasis
  ctx.strokeStyle = COLORS.white;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  
  ctx.restore();
  
  // Draw laser range indicator text
  ctx.globalAlpha = 0.9;
  ctx.shadowBlur = 8;
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const midScreen = {
    x: (baseScreen.x + endScreen.x) / 2,
    y: (baseScreen.y + endScreen.y) / 2
  };
  
  ctx.fillText(`LASER ${LASER_RANGE.toFixed(0)}m`, midScreen.x, midScreen.y - 20);
  
  ctx.restore();
}

function drawVisualFeedback(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.visualFeedback || state.visualFeedback.length === 0) return;
  
  const now = Date.now();
  
  state.visualFeedback.forEach(feedback => {
    const elapsed = now - feedback.startTime;
    const progress = elapsed / 500; // 500ms fade out
    const alpha = Math.max(0, 1 - progress);
    
    if (feedback.type === 'tap') {
      const screenPos = positionToPixels(feedback.position);
      const radius = 10 + elapsed * 0.05;
      
      ctx.save();
      ctx.strokeStyle = COLORS.white;
      ctx.lineWidth = 3;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = COLORS.white;
      ctx.shadowBlur = 10;
      
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.restore();
    } else if (feedback.type === 'drag' && feedback.endPosition) {
      const startScreen = positionToPixels(feedback.position);
      const endScreen = positionToPixels(feedback.endPosition);
      
      ctx.save();
      ctx.strokeStyle = COLORS.telegraph;
      ctx.lineWidth = 4;
      ctx.globalAlpha = alpha * 0.6;
      ctx.shadowColor = COLORS.telegraph;
      ctx.shadowBlur = 15;
      
      ctx.beginPath();
      ctx.moveTo(startScreen.x, startScreen.y);
      ctx.lineTo(endScreen.x, endScreen.y);
      ctx.stroke();
      
      // Draw arrowhead
      const dx = endScreen.x - startScreen.x;
      const dy = endScreen.y - startScreen.y;
      const angle = Math.atan2(dy, dx);
      const arrowSize = 15;
      
      ctx.beginPath();
      ctx.moveTo(endScreen.x, endScreen.y);
      ctx.lineTo(
        endScreen.x - arrowSize * Math.cos(angle - Math.PI / 6),
        endScreen.y - arrowSize * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(endScreen.x, endScreen.y);
      ctx.lineTo(
        endScreen.x - arrowSize * Math.cos(angle + Math.PI / 6),
        endScreen.y - arrowSize * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
      
      ctx.restore();
    }
  });
}

function drawImpactEffects(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.impactEffects || state.impactEffects.length === 0) return;
  
  const now = Date.now();
  
  state.impactEffects.forEach((effect) => {
    const elapsed = (now - effect.startTime) / 1000;
    const progress = Math.min(elapsed / effect.duration, 1);
    
    if (progress >= 1) return; // Skip completed effects
    
    const screenPos = positionToPixels(effect.position);
    const maxRadius = metersToPixels(effect.size);
    const currentRadius = maxRadius * progress;
    const alpha = 1 - progress;
    
    ctx.save();
    
    // Draw expanding ring
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 3 * (1 - progress * 0.7);
    ctx.globalAlpha = alpha * 0.8;
    ctx.shadowColor = effect.color;
    ctx.shadowBlur = 20;
    
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, currentRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Draw inner flash
    if (progress < 0.3) {
      const flashAlpha = (1 - progress / 0.3) * alpha;
      ctx.globalAlpha = flashAlpha * 0.6;
      ctx.fillStyle = effect.color;
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, currentRadius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  });
}

function drawExplosionParticles(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.explosionParticles || state.explosionParticles.length === 0) return;
  if (!state.settings.enableParticleEffects) return; // Skip if particles disabled
  
  state.explosionParticles.forEach((particle) => {
    const screenPos = positionToPixels(particle.position);
    const size = metersToPixels(particle.size);
    
    ctx.save();
    ctx.globalAlpha = particle.alpha;
    
    // Apply rotation if available
    if (particle.rotation !== undefined) {
      ctx.translate(screenPos.x, screenPos.y);
      ctx.rotate(particle.rotation);
      
      // Draw rotated square for debris
      ctx.fillStyle = particle.color;
      applyGlowEffect(ctx, state, particle.color, size * 2);
      ctx.fillRect(-size / 2, -size / 2, size, size);
      
      // Add extra glow layer
      ctx.globalAlpha = particle.alpha * 0.4;
      applyGlowEffect(ctx, state, particle.color, size * 4);
      ctx.fillRect(-size / 2, -size / 2, size, size);
    } else {
      // Draw particle with glow (for sparks)
      ctx.fillStyle = particle.color;
      applyGlowEffect(ctx, state, particle.color, size * 3);
      
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, size, 0, Math.PI * 2);
      ctx.fill();
      
      // Add extra glow layer
      ctx.globalAlpha = particle.alpha * 0.4;
      applyGlowEffect(ctx, state, particle.color, size * 6);
      ctx.fill();
    }
    
    ctx.restore();
  });
}

// Draw hit spark effects
function drawHitSparks(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.hitSparks) return;
  if (!state.settings.enableParticleEffects) return; // Skip if particles disabled
  
  const now = Date.now();
  state.hitSparks.forEach((spark) => {
    const age = (now - spark.createdAt) / 1000;
    const progress = age / spark.lifetime;
    const alpha = 1 - progress;
    
    const screenPos = positionToPixels(spark.position);
    const size = metersToPixels(spark.size);
    
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = spark.color;
    applyGlowEffect(ctx, state, spark.color, size * 3);
    
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  });
}

// Draw bounce particles for armored units
function drawBounceParticles(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.bounceParticles) return;
  if (!state.settings.enableParticleEffects) return; // Skip if particles disabled
  
  const now = Date.now();
  state.bounceParticles.forEach((particle) => {
    const age = (now - particle.createdAt) / 1000;
    const progress = age / particle.lifetime;
    const alpha = 1 - progress;
    
    const screenPos = positionToPixels(particle.position);
    
    // Draw tiny rectangle bullet (similar to projectile rendering)
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Calculate rotation based on velocity
    const angle = Math.atan2(particle.velocity.y, particle.velocity.x);
    ctx.translate(screenPos.x, screenPos.y);
    ctx.rotate(angle);
    
    // Draw tiny rectangle
    const bulletWidth = 3;
    const bulletHeight = 1.5;
    ctx.fillStyle = particle.color;
    ctx.fillRect(-bulletWidth / 2, -bulletHeight / 2, bulletWidth, bulletHeight);
    
    ctx.restore();
  });
}

// Draw field particles for mid-field physics effects
function drawFieldParticles(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.fieldParticles || state.fieldParticles.length === 0) return;
  if (!state.settings.enableParticleEffects) return; // Skip if particles disabled
  
  state.fieldParticles.forEach((particle) => {
    const screenPos = positionToPixels(particle.position);
    const size = metersToPixels(particle.size);
    
    ctx.save();
    ctx.globalAlpha = particle.opacity;
    
    // Draw white particle with subtle glow
    ctx.fillStyle = COLORS.white;
    ctx.shadowColor = COLORS.white;
    ctx.shadowBlur = size * 3;
    
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, size, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  });
}

// Draw celebration particles for victory screen
function drawCelebrationParticles(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.celebrationParticles || state.celebrationParticles.length === 0) return;
  if (!state.settings.enableParticleEffects) return; // Skip if particles disabled
  
  const now = Date.now();
  state.celebrationParticles.forEach((particle) => {
    const age = (now - particle.createdAt) / 1000;
    if (age < 0 || age >= particle.lifetime) return;
    
    const progress = age / particle.lifetime;
    const alpha = 1 - progress;
    
    const screenPos = positionToPixels(particle.position);
    const size = metersToPixels(particle.size);
    
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(screenPos.x, screenPos.y);
    ctx.rotate(particle.rotation);
    
    // Draw colorful confetti-like shapes
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = size * 2;
    
    // Alternate between stars and rectangles
    const isRect = Math.floor(particle.createdAt) % 2 === 0;
    if (isRect) {
      ctx.fillRect(-size / 2, -size / 2, size, size / 3);
    } else {
      // Draw simple star shape
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5;
        const radius = i % 2 === 0 ? size : size / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fill();
    }
    
    // Add extra glow
    ctx.globalAlpha = alpha * 0.5;
    ctx.shadowBlur = size * 4;
    if (isRect) {
      ctx.fillRect(-size / 2, -size / 2, size, size / 3);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  });
}

// Draw energy pulse effects
function drawEnergyPulses(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.energyPulses) return;
  
  const now = Date.now();
  state.energyPulses.forEach((pulse) => {
    const age = (now - pulse.startTime) / 1000;
    const progress = age / pulse.duration;
    const alpha = 1 - progress;
    
    const screenPos = positionToPixels(pulse.position);
    const radius = metersToPixels(pulse.radius);
    
    ctx.save();
    
    // Add chromatic aberration effect for abilities if enabled
    if (state.settings.enableGlowEffects) {
      const offset = 2 * alpha; // Aberration amount
      
      // Draw red channel
      ctx.globalAlpha = alpha * 0.3;
      ctx.strokeStyle = 'oklch(0.65 0.28 25)'; // Red
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(screenPos.x - offset, screenPos.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      
      // Draw blue channel
      ctx.strokeStyle = 'oklch(0.65 0.25 240)'; // Blue
      ctx.beginPath();
      ctx.arc(screenPos.x + offset, screenPos.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Draw main pulse
    ctx.globalAlpha = alpha * 0.6;
    ctx.strokeStyle = pulse.color;
    ctx.lineWidth = 2;
    applyGlowEffect(ctx, state, pulse.color, 15);
    
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Draw inner pulse
    ctx.globalAlpha = alpha * 0.4;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();
  });
}

// Draw spawn effects
function drawSpawnEffects(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.spawnEffects) return;
  
  const now = Date.now();
  state.spawnEffects.forEach((effect) => {
    const age = (now - effect.startTime) / 1000;
    const progress = age / effect.duration;
    const alpha = 1 - progress;
    const scale = 0.5 + progress * 0.5;
    
    const screenPos = positionToPixels(effect.position);
    
    ctx.save();
    ctx.globalAlpha = alpha * 0.8;
    ctx.fillStyle = effect.color;
    ctx.shadowColor = effect.color;
    ctx.shadowBlur = 20;
    
    // Draw expanding circle
    const radius = metersToPixels(1.5 * scale);
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw cross pattern
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = alpha;
    const lineLen = metersToPixels(2 * scale);
    
    ctx.beginPath();
    ctx.moveTo(screenPos.x - lineLen, screenPos.y);
    ctx.lineTo(screenPos.x + lineLen, screenPos.y);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(screenPos.x, screenPos.y - lineLen);
    ctx.lineTo(screenPos.x, screenPos.y + lineLen);
    ctx.stroke();
    
    ctx.restore();
  });
}

function drawMotionTrails(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.motionTrails || state.motionTrails.length === 0) return;
  
  const now = Date.now();
  
  state.motionTrails.forEach((trail) => {
    if (trail.positions.length < 2) return;
    
    ctx.save();
    ctx.strokeStyle = trail.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw trail from oldest to newest
    for (let i = 0; i < trail.positions.length - 1; i++) {
      const age = (now - trail.positions[i].timestamp) / 1000;
      const alpha = Math.max(0, 1 - age / MOTION_TRAIL_DURATION);
      const width = 2 * alpha;
      
      if (alpha <= 0) continue;
      
      const pos1 = positionToPixels(trail.positions[i].pos);
      const pos2 = positionToPixels(trail.positions[i + 1].pos);
      
      ctx.globalAlpha = alpha * 0.6;
      ctx.lineWidth = width;
      ctx.shadowColor = trail.color;
      ctx.shadowBlur = 8;
      
      ctx.beginPath();
      ctx.moveTo(pos1.x, pos1.y);
      ctx.lineTo(pos2.x, pos2.y);
      ctx.stroke();
    }
    
    ctx.restore();
  });
}

// Draw thin trails from back corners of unit sprites
function drawSpriteCornerTrails(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.spriteCornerTrails || state.spriteCornerTrails.length === 0) return;
  
  const now = Date.now();
  const SPRITE_CORNER_TRAIL_DURATION = 0.3; // Must match simulation value
  
  state.spriteCornerTrails.forEach((trail) => {
    ctx.save();
    ctx.strokeStyle = trail.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Helper function to draw a single corner trail
    const drawCornerTrail = (positions: Array<{ pos: Vector2; timestamp: number }>) => {
      if (positions.length < 2) return;
      
      // Draw trail from oldest to newest
      for (let i = 0; i < positions.length - 1; i++) {
        const age = (now - positions[i].timestamp) / 1000;
        const alpha = Math.max(0, 1 - age / SPRITE_CORNER_TRAIL_DURATION);
        
        if (alpha <= 0) continue;
        
        const pos1 = positionToPixels(positions[i].pos);
        const pos2 = positionToPixels(positions[i + 1].pos);
        
        // Thin trails with reduced opacity
        ctx.globalAlpha = alpha * 0.4;
        ctx.lineWidth = 1.5 * alpha; // Thin line that fades
        ctx.shadowColor = trail.color;
        ctx.shadowBlur = 4;
        
        ctx.beginPath();
        ctx.moveTo(pos1.x, pos1.y);
        ctx.lineTo(pos2.x, pos2.y);
        ctx.stroke();
      }
    };
    
    // Draw both corner trails
    drawCornerTrail(trail.leftCornerPositions);
    drawCornerTrail(trail.rightCornerPositions);
    
    ctx.restore();
  });
}

function drawDamageNumbers(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.damageNumbers || state.damageNumbers.length === 0) return;
  
  const now = Date.now();
  
  state.damageNumbers.forEach((damageNum) => {
    const elapsed = (now - damageNum.startTime) / 1000;
    const progress = Math.min(elapsed / damageNum.duration, 1);
    
    if (progress >= 1) return; // Skip completed numbers
    
    // Enhanced float animation with easing
    const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease out cubic
    const floatDistance = 30 * easeProgress;
    const screenPos = positionToPixels(damageNum.position);
    
    // Fade with slight delay at start for readability
    const fadeStart = 0.3;
    const alpha = progress < fadeStart ? 1 : 1 - ((progress - fadeStart) / (1 - fadeStart));
    
    ctx.save();
    
    // Draw damage number with enhanced styling
    const fontSize = 18 + (1 - progress) * 8; // Start bigger, shrink
    ctx.font = `bold ${fontSize}px Space Mono, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Deterministic wobble based on damage number ID
    const wobbleOffset = (parseInt(damageNum.id.slice(-2), 36) % 100) / 100; // 0-1 based on ID
    const wobble = Math.sin(progress * Math.PI * 2 + wobbleOffset * Math.PI * 2) * 3 * (1 - progress);
    const x = screenPos.x + wobble;
    const y = screenPos.y - floatDistance - 10;
    
    // Draw shadow/outline
    ctx.strokeStyle = 'rgba(0, 0, 0, ' + (alpha * 0.9) + ')';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeText(damageNum.damage.toString(), x, y);
    
    // Draw glow effect
    ctx.shadowColor = damageNum.color;
    ctx.shadowBlur = 15 * alpha;
    
    // Draw fill with gradient-like effect
    ctx.fillStyle = damageNum.color;
    ctx.globalAlpha = alpha;
    ctx.fillText(damageNum.damage.toString(), x, y);
    
    // Draw brighter center for pop effect
    if (progress < 0.2) {
      ctx.shadowBlur = 25;
      ctx.globalAlpha = alpha * (1 - progress / 0.2);
      ctx.fillText(damageNum.damage.toString(), x, y);
    }
    
    ctx.restore();
  });
}

function drawMinimap(ctx: CanvasRenderingContext2D, state: GameState, canvas: HTMLCanvasElement): void {
  if (!state.showMinimap) return;
  
  // Minimap configuration
  const minimapSize = Math.min(canvas.width, canvas.height) * MINIMAP_SIZE_RATIO;
  const minimapX = canvas.width - minimapSize - MINIMAP_PADDING;
  const minimapY = canvas.height - minimapSize - MINIMAP_PADDING;
  
  // Calculate arena bounds
  const arenaWidth = ARENA_WIDTH_METERS; // meters
  const arenaHeight = getArenaHeight(); // meters
  
  ctx.save();
  
  // Draw minimap background with enhanced gradient
  const gradient = ctx.createRadialGradient(
    minimapX + minimapSize / 2, minimapY + minimapSize / 2, 0,
    minimapX + minimapSize / 2, minimapY + minimapSize / 2, minimapSize / 2
  );
  gradient.addColorStop(0, 'rgba(20, 20, 30, 0.95)');
  gradient.addColorStop(1, 'rgba(10, 10, 15, 0.95)');
  ctx.fillStyle = gradient;
  ctx.fillRect(minimapX, minimapY, minimapSize, minimapSize);
  
  // Draw minimap border with enhanced glow effect
  const time = Date.now() / 1000;
  const borderPulse = Math.sin(time * 1.5) * 0.3 + 0.7;
  ctx.strokeStyle = 'oklch(0.60 0.22 240)';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'oklch(0.60 0.22 240)';
  ctx.shadowBlur = 10 * borderPulse;
  ctx.strokeRect(minimapX, minimapY, minimapSize, minimapSize);
  ctx.shadowBlur = 0;
  
  // Draw enhanced grid overlay
  ctx.strokeStyle = 'rgba(100, 150, 200, 0.15)';
  ctx.lineWidth = 1;
  const gridLines = 4;
  for (let i = 1; i < gridLines; i++) {
    const x = minimapX + (i / gridLines) * minimapSize;
    const y = minimapY + (i / gridLines) * minimapSize;
    
    // Vertical lines
    ctx.beginPath();
    ctx.moveTo(x, minimapY);
    ctx.lineTo(x, minimapY + minimapSize);
    ctx.stroke();
    
    // Horizontal lines
    ctx.beginPath();
    ctx.moveTo(minimapX, y);
    ctx.lineTo(minimapX + minimapSize, y);
    ctx.stroke();
  }
  
  // Helper to convert game position to minimap position
  const toMinimapPos = (pos: Vector2) => {
    return {
      x: minimapX + (pos.x / arenaWidth) * minimapSize,
      y: minimapY + (pos.y / arenaHeight) * minimapSize,
    };
  };
  
  // Draw obstacles with enhanced visuals and better contrast
  state.obstacles.forEach(obstacle => {
    const pos = toMinimapPos(obstacle.position);
    const size = Math.max(MINIMAP_OBSTACLE_MIN_SIZE, (obstacle.width / arenaWidth) * minimapSize);
    
    ctx.save();
    
    // Different colors based on obstacle type with increased opacity
    if (obstacle.type === 'wall') {
      ctx.fillStyle = 'rgba(120, 140, 200, 0.7)';
      ctx.strokeStyle = 'rgba(150, 170, 230, 0.8)';
    } else if (obstacle.type === 'pillar') {
      ctx.fillStyle = 'rgba(170, 120, 200, 0.7)';
      ctx.strokeStyle = 'rgba(200, 150, 230, 0.8)';
    } else {
      ctx.fillStyle = 'rgba(200, 120, 100, 0.7)';
      ctx.strokeStyle = 'rgba(230, 150, 130, 0.8)';
    }
    
    ctx.fillRect(pos.x - size / 2, pos.y - size / 2, size, size);
    
    // Add glowing border for better visibility
    ctx.lineWidth = 1;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 3;
    ctx.strokeRect(pos.x - size / 2, pos.y - size / 2, size, size);
    ctx.shadowBlur = 0;
    
    ctx.restore();
  });
  
  // Draw bases with pulsing effect
  const pulse = Math.sin(time * 2) * 0.2 + 0.8;
  
  state.bases.forEach(base => {
    const pos = toMinimapPos(base.position);
    const color = state.players[base.owner].color;
    
    // Draw base glow
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 * pulse;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(pos.x - MINIMAP_BASE_SIZE, pos.y - MINIMAP_BASE_SIZE, MINIMAP_BASE_SIZE * 2, MINIMAP_BASE_SIZE * 2);
    
    // Draw base
    ctx.shadowBlur = 4;
    ctx.globalAlpha = 1;
    ctx.fillRect(pos.x - MINIMAP_BASE_SIZE / 2, pos.y - MINIMAP_BASE_SIZE / 2, MINIMAP_BASE_SIZE, MINIMAP_BASE_SIZE);
    ctx.shadowBlur = 0;
  });
  
  // Draw units with slight glow
  state.units.forEach(unit => {
    // Hide cloaked enemy units from the player's minimap view.
    if (unit.cloaked && unit.owner !== 0) {
      return;
    }

    const pos = toMinimapPos(unit.position);
    const color = state.players[unit.owner].color;
    
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, MINIMAP_UNIT_SIZE, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });
  
  // Draw minimap title with enhanced styling
  ctx.fillStyle = 'oklch(0.75 0.18 240)';
  ctx.font = 'bold 11px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'oklch(0.75 0.18 240)';
  ctx.shadowBlur = 6;
  ctx.fillText('TACTICAL', minimapX + minimapSize / 2, minimapY - 6);
  ctx.shadowBlur = 0;
  
  ctx.restore();
}
