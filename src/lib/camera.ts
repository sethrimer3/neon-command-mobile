/**
 * Camera system for smooth zooming and panning
 */

import { GameState, Vector2, ARENA_WIDTH_METERS, ARENA_HEIGHT_METERS, PIXELS_PER_METER } from './types';
import { getViewportScale, getViewportOffset, getViewportDimensions } from './gameUtils';

// Camera constants
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_SPEED = 0.1;
const PAN_SPEED = 10; // meters per second
const CAMERA_SMOOTHING = 0.15; // Lerp factor for smooth transitions

/**
 * Initialize camera for game state
 */
export function initializeCamera(state: GameState): void {
  if (!state.camera) {
    state.camera = {
      offset: { x: 0, y: 0 },
      targetOffset: { x: 0, y: 0 },
      zoom: 1.0,
      targetZoom: 1.0,
      smoothing: CAMERA_SMOOTHING,
    };
  }
}

/**
 * Update camera position and zoom with smooth interpolation
 */
export function updateCamera(state: GameState, deltaTime: number): void {
  if (!state.camera) return;

  // Smooth zoom interpolation
  const zoomDiff = state.camera.targetZoom - state.camera.zoom;
  state.camera.zoom += zoomDiff * state.camera.smoothing;

  // Clamp zoom to valid range
  state.camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.camera.zoom));
  state.camera.targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.camera.targetZoom));

  // Smooth offset interpolation
  const offsetDiffX = state.camera.targetOffset.x - state.camera.offset.x;
  const offsetDiffY = state.camera.targetOffset.y - state.camera.offset.y;
  
  state.camera.offset.x += offsetDiffX * state.camera.smoothing;
  state.camera.offset.y += offsetDiffY * state.camera.smoothing;
}

/**
 * Zoom camera in or out
 */
export function zoomCamera(state: GameState, delta: number): void {
  if (!state.camera) {
    initializeCamera(state);
  }
  
  state.camera!.targetZoom += delta * ZOOM_SPEED;
  state.camera!.targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.camera!.targetZoom));
}

/**
 * Pan camera in a direction
 */
export function panCamera(state: GameState, direction: Vector2, deltaTime: number): void {
  if (!state.camera) {
    initializeCamera(state);
  }

  const speed = PAN_SPEED * deltaTime;
  state.camera!.targetOffset.x += direction.x * speed;
  state.camera!.targetOffset.y += direction.y * speed;
}

/**
 * Reset camera to default position and zoom
 */
export function resetCamera(state: GameState): void {
  if (!state.camera) {
    initializeCamera(state);
    return;
  }

  state.camera.targetOffset = { x: 0, y: 0 };
  state.camera.targetZoom = 1.0;
}

/**
 * Focus camera on a specific position
 */
export function focusCamera(state: GameState, position: Vector2): void {
  if (!state.camera) {
    initializeCamera(state);
  }

  // Camera offset is in world coordinates
  state.camera!.targetOffset = { 
    x: -position.x, 
    y: -position.y 
  };
}

/**
 * Apply camera transformation to canvas context
 */
export function applyCameraTransform(ctx: CanvasRenderingContext2D, state: GameState, canvas: HTMLCanvasElement): void {
  if (!state.camera) return;

  const viewportScale = getViewportScale();
  const viewportOffset = getViewportOffset();
  const viewportDimensions = getViewportDimensions();
  // Use the arena viewport center so zoom/pan are consistent across aspect ratios
  const centerX = viewportDimensions.width > 0 ? viewportOffset.x + viewportDimensions.width / 2 : canvas.width / 2;
  const centerY = viewportDimensions.height > 0 ? viewportOffset.y + viewportDimensions.height / 2 : canvas.height / 2;
  
  ctx.save();
  
  // Translate to center of the letterboxed arena viewport
  ctx.translate(centerX, centerY);
  
  // Apply zoom
  ctx.scale(state.camera.zoom, state.camera.zoom);
  
  // Apply camera offset (convert meters to pixels with viewport scale)
  ctx.translate(state.camera.offset.x * PIXELS_PER_METER * viewportScale, state.camera.offset.y * PIXELS_PER_METER * viewportScale);
  
  // Translate back from viewport center
  ctx.translate(-centerX, -centerY);
}

/**
 * Remove camera transformation from canvas context
 */
export function removeCameraTransform(ctx: CanvasRenderingContext2D): void {
  ctx.restore();
}

/**
 * Convert screen position to world position accounting for camera
 */
export function screenToWorld(screenPos: Vector2, state: GameState, canvas: HTMLCanvasElement): Vector2 {
  if (!state.camera) {
    return { x: screenPos.x, y: screenPos.y };
  }

  const viewportScale = getViewportScale();
  const viewportOffset = getViewportOffset();
  const viewportDimensions = getViewportDimensions();
  // Anchor the camera conversion on the arena viewport center
  const centerX = viewportDimensions.width > 0 ? viewportOffset.x + viewportDimensions.width / 2 : canvas.width / 2;
  const centerY = viewportDimensions.height > 0 ? viewportOffset.y + viewportDimensions.height / 2 : canvas.height / 2;

  // Reverse the transformations
  const x = (screenPos.x - centerX) / state.camera.zoom - state.camera.offset.x * PIXELS_PER_METER * viewportScale + centerX;
  const y = (screenPos.y - centerY) / state.camera.zoom - state.camera.offset.y * PIXELS_PER_METER * viewportScale + centerY;

  return { x, y };
}

/**
 * Convert world position to screen position accounting for camera
 */
export function worldToScreen(worldPos: Vector2, state: GameState, canvas: HTMLCanvasElement): Vector2 {
  if (!state.camera) {
    return { x: worldPos.x, y: worldPos.y };
  }

  const viewportScale = getViewportScale();
  const viewportOffset = getViewportOffset();
  const viewportDimensions = getViewportDimensions();
  // Anchor the camera conversion on the arena viewport center
  const centerX = viewportDimensions.width > 0 ? viewportOffset.x + viewportDimensions.width / 2 : canvas.width / 2;
  const centerY = viewportDimensions.height > 0 ? viewportOffset.y + viewportDimensions.height / 2 : canvas.height / 2;

  const x = (worldPos.x - centerX + state.camera.offset.x * PIXELS_PER_METER * viewportScale) * state.camera.zoom + centerX;
  const y = (worldPos.y - centerY + state.camera.offset.y * PIXELS_PER_METER * viewportScale) * state.camera.zoom + centerY;

  return { x, y };
}
