# camera.ts

## Purpose
Provides camera controls for zooming, panning, and coordinate conversions so gameplay can be centered and scaled consistently across devices.

## Dependencies
### Imports
- `./types` - GameState, Vector2, and rendering constants
- `./gameUtils` - Viewport scale, viewport offset, and viewport dimensions

### Used By
- `App.tsx` - Updates camera each frame and applies zoom/pan controls

## Key Components

### initializeCamera(state: GameState): void
- **Purpose:** Creates a default camera state when one is not present
- **Notes:** Sets zoom, target zoom, offsets, and smoothing defaults

### updateCamera(state: GameState, deltaTime: number): void
- **Purpose:** Smoothly interpolates camera position and zoom over time
- **Notes:** Clamps zoom to safe min/max values

### zoomCamera(state: GameState, delta: number): void
- **Purpose:** Adjusts target zoom based on input
- **Notes:** Uses a constant speed multiplier and clamps to safe bounds

### panCamera(state: GameState, direction: Vector2, deltaTime: number): void
- **Purpose:** Applies directional panning based on input
- **Notes:** Uses meters per second for consistent movement

### resetCamera(state: GameState): void
- **Purpose:** Re-centers the camera and resets zoom
- **Notes:** Useful for quick recovery from large pan/zoom adjustments

### focusCamera(state: GameState, position: Vector2): void
- **Purpose:** Centers the camera on a world position
- **Notes:** Converts the focus target into an offset in world space

### applyCameraTransform(ctx, state, canvas): void
- **Purpose:** Applies camera transforms to the rendering context
- **Notes:** Anchors transforms on the letterboxed arena viewport center

### screenToWorld(screenPos, state, canvas): Vector2
- **Purpose:** Converts screen coordinates to world coordinates
- **Notes:** Uses viewport center alignment so input stays consistent across aspect ratios

### worldToScreen(worldPos, state, canvas): Vector2
- **Purpose:** Converts world coordinates to screen coordinates
- **Notes:** Uses viewport center alignment for camera-aware rendering

## Terminology
- **Viewport Offset:** Pixel offset that centers the arena within the canvas
- **Target Zoom:** Desired zoom level interpolated toward over time
- **Camera Offset:** Translation in world meters applied after zoom

## Implementation Notes

### Critical Details
- Camera transformations are centered on the arena viewport, not the full canvas
- Zoom and pan are smoothed using linear interpolation
- Screen/world conversions must account for viewport offset and scale
- Falls back to canvas center if viewport dimensions have not been initialized yet

### Known Issues
- None currently identified

## Future Changes

### Planned
- None currently scheduled

### Needed
- Consider constraining camera offset to keep the arena fully in view

## Change History
- **2026-01-03**: Documented viewport-centered camera transforms and conversions

## Watch Out For
- Always call updateViewportScale() before relying on viewport dimensions
- Camera offsets are in world meters, not pixels
- Be consistent with viewport-centered conversions when adding new camera features
