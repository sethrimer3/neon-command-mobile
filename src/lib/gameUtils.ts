import { Vector2, ARENA_WIDTH_METERS, ARENA_HEIGHT_METERS } from './types';
import { PIXELS_PER_METER } from './types';

// Calculate viewport scale to fit the fixed arena to the viewport
let viewportScale = 1.0;
let canvasWidth = 0;
let canvasHeight = 0;

export function updateViewportScale(width: number, height: number): void {
  canvasWidth = width;
  canvasHeight = height;
  
  // Calculate scale factors for both dimensions
  const scaleX = width / (ARENA_WIDTH_METERS * PIXELS_PER_METER);
  const scaleY = height / (ARENA_HEIGHT_METERS * PIXELS_PER_METER);
  
  // Use the smaller scale to ensure the entire arena fits in the viewport
  viewportScale = Math.min(scaleX, scaleY);
}

export function getViewportScale(): number {
  return viewportScale;
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
  return {
    x: pos.x * PIXELS_PER_METER * viewportScale,
    y: pos.y * PIXELS_PER_METER * viewportScale,
  };
}

export function pixelsToPosition(pixels: Vector2): Vector2 {
  return {
    x: pixels.x / (PIXELS_PER_METER * viewportScale),
    y: pixels.y / (PIXELS_PER_METER * viewportScale),
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

