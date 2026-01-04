# gameUtils.ts

## Purpose
Provides core mathematical utility functions for vector operations, coordinate transformations, and game-related calculations. These are fundamental building blocks used throughout the codebase.

## Dependencies
### Imports
- `./types` - Vector2 type and PIXELS_PER_METER constant

### Used By
- `simulation.ts` - Movement, combat calculations
- `ai.ts` - Pathfinding and decision making
- `renderer.ts` - Screen coordinate conversions
- `input.ts` - Mouse/touch position conversions
- `App.tsx` - Initial game state setup
- Most game logic files need vector math

## Key Components

### Vector Math Functions

#### distance(a: Vector2, b: Vector2): number
- **Purpose:** Calculate Euclidean distance between two points
- **Parameters:** Two Vector2 positions
- **Returns:** Distance in meters
- **Notes:** Uses standard distance formula: sqrt((x2-x1)² + (y2-y1)²)

#### normalize(v: Vector2): Vector2
- **Purpose:** Convert vector to unit vector (length 1)
- **Parameters:** Vector to normalize
- **Returns:** Normalized vector or zero vector if input length is 0
- **Notes:** Critical for movement directions - always check for zero-length input

#### scale(v: Vector2, s: number): Vector2
- **Purpose:** Multiply vector by scalar value
- **Parameters:** Vector and scalar multiplier
- **Returns:** Scaled vector
- **Notes:** Used for applying movement speed and other magnitude changes

#### add(a: Vector2, b: Vector2): Vector2
- **Purpose:** Vector addition
- **Parameters:** Two vectors to add
- **Returns:** Sum vector
- **Notes:** Component-wise addition

#### subtract(a: Vector2, b: Vector2): Vector2
- **Purpose:** Vector subtraction
- **Parameters:** Two vectors (a - b)
- **Returns:** Difference vector
- **Notes:** Often used to get direction from one point to another

### Coordinate Conversion Functions

#### updateViewportScale(width: number, height: number): void
- **Purpose:** Compute a uniform scale that fits the arena within the screen while preserving aspect ratio
- **Parameters:** Canvas width and height in pixels
- **Returns:** None (updates module-scoped viewport state)
- **Notes:** Also computes letterbox offsets and viewport dimensions for centered rendering

#### getViewportScale(): number
- **Purpose:** Retrieve the current arena-to-screen scale factor
- **Returns:** Scale multiplier for converting meters to pixels

#### getViewportOffset(): Vector2
- **Purpose:** Retrieve the pixel offset applied to the letterboxed arena
- **Returns:** Vector2 offset in pixels
- **Notes:** Used to center the arena and align input conversions

#### getViewportDimensions(): { width: number; height: number }
- **Purpose:** Retrieve the pixel size of the letterboxed arena viewport
- **Returns:** Width/height in pixels
- **Notes:** Used by camera conversions to anchor on the arena center

#### metersToPixels(meters: number): number
- **Purpose:** Convert game distance to screen pixels
- **Parameters:** Distance in meters
- **Returns:** Distance in pixels
- **Notes:** Multiplies by PIXELS_PER_METER (20)

#### pixelsToMeters(pixels: number): number
- **Purpose:** Convert screen pixels to game distance
- **Parameters:** Distance in pixels
- **Returns:** Distance in meters
- **Notes:** Divides by PIXELS_PER_METER (20)

#### positionToPixels(pos: Vector2): Vector2
- **Purpose:** Convert game position to screen coordinates
- **Parameters:** Position in meters
- **Returns:** Position in pixels
- **Notes:** Applies conversion to both x and y components and offsets by the letterboxed viewport

#### pixelsToPosition(pixels: Vector2): Vector2
- **Purpose:** Convert screen coordinates to game position
- **Parameters:** Position in pixels
- **Returns:** Position in meters
- **Notes:** Removes the letterboxed offset before converting to meters

### Numeric Utility Functions

#### clamp(value: number, min: number, max: number): number
- **Purpose:** Constrain value within a range
- **Parameters:** Value to clamp, minimum and maximum bounds
- **Returns:** Clamped value
- **Notes:** Ensures value stays within [min, max]

#### lerp(a: number, b: number, t: number): number
- **Purpose:** Linear interpolation between two values
- **Parameters:** Start value, end value, interpolation factor (0-1)
- **Returns:** Interpolated value
- **Notes:** Used for smooth transitions and animations

### ID Generation

#### generateId(): string
- **Purpose:** Create unique identifier for game entities
- **Returns:** Random alphanumeric string
- **Notes:** Uses Math.random() base-36 conversion, takes characters 2-15 (13 chars)

### Visual Generation

#### generateTopographyLines(canvasWidth: number, canvasHeight: number): Array
- **Purpose:** Create random topographical background lines for visual interest
- **Parameters:** Canvas dimensions in pixels
- **Returns:** Array of line segments with x1, y1, x2, y2 coordinates
- **Notes:** 
  - Generates 15-25 wavy horizontal contour lines
  - Each line has 8-16 segments for organic appearance
  - Vertical offset of ±40 pixels creates wave effect
  - Lines are purely decorative, don't affect gameplay

## Terminology
- **Vector2**: 2D coordinate with x and y components (in meters for game space)
- **Normalize**: Convert vector to unit length while preserving direction
- **Scalar**: Single numeric value used to scale vectors
- **Lerp**: Linear interpolation
- **Topography Lines**: Background contour lines for visual enhancement

## Implementation Notes

### Critical Details
- All vector operations assume positions are in meters (game space)
- Coordinate conversions are essential when translating between game logic and rendering
- Viewport scale and offset keep the arena centered across varying aspect ratios
- normalize() handles zero-length vectors gracefully (returns zero vector)
- generateId() is NOT cryptographically secure - only for game entity IDs

### Known Issues
- None currently identified

## Future Changes

### Planned
- None currently planned

### Needed
- Consider adding dot product and cross product for more advanced vector math
- Could add vector rotation functions for ability targeting
- May want more sophisticated ID generation for multiplayer to avoid collisions

## Change History
- Initial creation with basic vector math
- Added topography line generation for visual polish
- Coordinate conversion functions added for rendering system
- Added viewport offset/dimension tracking to support letterboxed rendering

## Watch Out For
- Always normalize vectors before using them as directions (especially for movement)
- Don't confuse meters and pixels - use conversion functions consistently
- generateId() can theoretically produce duplicates - acceptable for single game instance
- When using lerp(), ensure t is in [0, 1] range for expected behavior
- Topography lines are in pixel space, not game space (they're for canvas rendering)
- Zero-length vector normalization returns {x: 0, y: 0} - check for this case if needed
