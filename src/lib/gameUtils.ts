import { Vector2 } from './types';
import { PIXELS_PER_METER } from './types';

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
  return meters * PIXELS_PER_METER;
}

export function pixelsToMeters(pixels: number): number {
  return pixels / PIXELS_PER_METER;
}

export function positionToPixels(pos: Vector2): Vector2 {
  return {
    x: pos.x * PIXELS_PER_METER,
    y: pos.y * PIXELS_PER_METER,
  };
}

export function pixelsToPosition(pixels: Vector2): Vector2 {
  return {
    x: pixels.x / PIXELS_PER_METER,
    y: pixels.y / PIXELS_PER_METER,
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

