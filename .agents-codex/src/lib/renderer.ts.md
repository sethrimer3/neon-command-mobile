# renderer.ts

## Purpose
Handles all game rendering to HTML5 canvas. Draws game state including units, bases, obstacles, command queues, HUD elements, and visual effects. Separates rendering concerns from game logic.

## Dependencies
### Imports
- `./types` - All game types, colors, and constants
- `./gameUtils` - Coordinate conversions and vector math
- `./camera` - Camera transforms for zoomed/panned rendering
- `./maps` - Obstacle type

### Used By
- `App.tsx` - Main render loop calls renderGame()

## Key Components

### renderGame(ctx, state, canvas, selectionRect?): void
- **Purpose:** Main rendering entry point
- **Parameters:** Canvas context, game state, canvas element, optional selection rectangle
- **Notes:** 
  - Clears canvas each frame
  - Only renders game elements when in 'game' or 'countdown' mode
  - Draws in specific layer order for proper visual hierarchy

### getTintedSprite(sprite, tintColor): HTMLCanvasElement | null
- **Purpose:** Produces a cached, tinted version of a sprite using an offscreen canvas.
- **Parameters:** Base sprite image and the team tint color.
- **Returns:** A canvas containing the tinted sprite, or null if the sprite/context is unavailable.
- **Notes:** 
  - Uses multiply + destination-in compositing to preserve shading and alpha.
  - Caches by `sprite.src` + color to reuse across frames.

### Drawing Functions

#### drawBackground(ctx, canvas, state?): void
- **Purpose:** Renders background with topography lines and grid pattern
- **Notes:**
  - Dark background color
  - Topography lines at 15% opacity for subtle effect
  - Dot grid pattern (40px spacing)
  - Vertical and horizontal lines (80px spacing)

#### drawObstacles(ctx, state): void
- **Purpose:** Draws map obstacles
- **Notes:** Semi-transparent dark rectangles

#### drawBases(ctx, state): void
- **Purpose:** Renders player bases with HP bars and effects
- **Notes:**
  - Shows laser firing animation
  - Health bar with color coding (green→yellow→red)
  - Pulsing selection indicator with a secondary ring for clearer selection state
  - Movement target indicator (dot)
  - Optional Radiant base sprites when sprite rendering is enabled

#### drawCommandQueues(ctx, state): void
- **Purpose:** Visualizes unit command queues
- **Notes:**
  - Lines connecting waypoints
  - Different colors for move vs ability commands
  - Telegraph indicators for pending abilities

#### drawUnits(ctx, state): void
- **Purpose:** Draws all units with effects
- **Notes:**
  - Draws particles first (behind unit) for marines
  - Circle for unit body
  - Optional Radiant unit/mining drone sprites when sprite rendering is enabled
  - HP bar (optional numeric display)
  - Active ability effects (shields, cloaking, etc.)
  - Attack animations (ranged/melee)
  - Promotion indicators (color intensity)

#### drawParticles(ctx, unit): void
- **Purpose:** Renders particle physics effects for units
- **Notes:**
  - Uses meter-based sizing to scale particle glow/trails with unit size
  - Uses unit's color with shadow blur for glow effect
  - Currently used only for marines (10 particles per marine)

#### drawSelectionIndicators(ctx, state): void
- **Purpose:** Shows which units are selected
- **Notes:** Pulsing circle around selected units

#### drawSelectionRect(ctx, selectionRect, state): void
- **Purpose:** Shows drag selection box
- **Notes:** Semi-transparent rectangle during box select

#### drawHUD(ctx, state): void
- **Purpose:** Displays game information overlay
- **Notes:**
  - Player resources (photons)
  - Income rate
  - Unit counts
  - Timer
  - Victory/defeat messages

## Terminology
- **Canvas Context**: 2D drawing API (CanvasRenderingContext2D)
- **Layer Order**: Order in which elements are drawn (back to front)
- **Telegraph**: Visual indicator for pending abilities
- **HUD**: Heads-Up Display for game information
- **Pixel Space**: Screen coordinates (vs. game meter coordinates)

## Implementation Notes

### Critical Details
- Uses positionToPixels() for all game-to-screen coordinate conversion
- Drawing order matters: background → obstacles → bases → queues → units → selection → HUD
- HP bars show percentage with color gradient
- Promotion level affects unit color intensity
- Ability effects have distinct visual styles
- Selection pulses using sine wave animation
- All positions must be converted from meters to pixels before drawing
- Playfield borders align to the letterboxed arena viewport offset
- LOD distance calculations use the arena viewport center, not the full canvas
- Mining depots render a dashed preview line when `state.miningDragPreview` targets that depot
- Resource deposits adjust glow/brightness based on 0/1/2 assigned worker drones
- Camera transforms are applied to world layers and removed before drawing screen-space UI
- Off-screen indicators render at arena viewport edges when zoomed in to keep units/bases visible
- Cloaked enemy units are culled from rendering (including the minimap), while cloaked friendly units render at reduced opacity
- Blade sword particle spacing pulls from shared constants so the visuals match the melee range tuning
- Blade sword particles sample lagged transform history so each segment trails behind movement/turns
- Blade sword particles honor the swing hold state to keep the sword at the final swing angle between combo hits
- Blade sword particles collapse when no valid enemies are in melee range and extend when targets enter range
- Blade sword particles render with reduced radii and a pale team-colored connector line for a unified blade read
- Sprite rendering uses cached Image instances and respects the `settings.enableSprites` toggle
- Sprite glow uses the same glow toggle as other shader-like effects
- Radiant sprites are tinted to the owning team color using an offscreen canvas with multiplicative blending to preserve shading
- Tinted sprite canvases are cached per sprite path + team color to avoid re-tinting every frame
- All unit sprites add a fixed PI/2 offset so sprite-forward (up) aligns with unit-forward directions
- Aurum enemy ship sprites reuse generic unit SVGs for snaker, berserker, assassin, juggernaut, striker, and reaper
- Unit rendering applies the playfield rotation offset on desktop so sprites and vector shapes face forward
- Motion blur trails use the playfield rotation offset to align with rotated unit visuals
- Ability range indicators now toggle between attack range (idle) and ability max range (while dragging an ability arrow) based on `state.abilityCastPreview`

### Rendering Optimizations
- Clears only once per frame
- Draws in batch by type (all units together)
- Uses simple shapes for performance

### Visual Design
- OKLCH color space for consistent appearance
- Dark theme with neon accent colors
- Subtle background pattern doesn't distract from gameplay
- Clear visual hierarchy (important elements stand out)

### Known Issues
- Large unit counts may impact performance, especially when many effects are enabled

## Future Changes

### Planned
- None currently scheduled

### Needed
- Expand viewport culling to additional entity types beyond units/projectiles
- Unit death animations
- Better attack visualizations
- Minimap rendering
- Fog of war implementation
- Performance profiling and optimization

## Change History
- Initial creation with basic rendering
- Added topography lines for visual polish
- Added numeric HP display option
- Implemented ability effect visuals
- Added match statistics to HUD
- **2025-12-31**: Added particle physics rendering for marines with glowing effect
- **2026-01-01**: Strengthened base selection glow with a thicker outline and secondary ring
- **2026-01-03**: Adjusted playfield borders to render with the arena viewport offset
- **2026-01-03**: Anchored unit LOD calculations to the arena viewport center
- **2026-01-06**: Sized playfield borders using viewport dimensions to match rotated desktop bounds
- **2025-03-10**: Scaled projectile and unit-attached particle rendering using meter-based sizing tied to unit size constants
- **2025-03-17**: Added mining drag preview lines and updated deposit colors for two-worker occupancy states
- **2025-03-18**: Scaled mining depots, deposits, and mining drone rendering to match the larger resource loop visuals
- **2026-01-04**: Applied camera transforms to world rendering and added off-screen zoom indicators for units and bases
- **2025-03-22**: Added Blade sword particle rendering, knife projectile visuals, and marine shell casing rendering
- **2026-01-08**: Hid cloaked enemy units in the main unit render pass while keeping friendly cloaked opacity
- **2026-01-09**: Spaced Blade sword particles farther apart by reading the shared spacing constant for magnet-like separation
- **2026-01-11**: Added Blade movement lag sampling so sword particles trail behind the unit based on history snapshots
- **2026-01-12**: Held Blade sword particles at the final swing angles between combo swings before resetting to rest
- **2025-03-22**: Added Radiant sprite rendering for units, bases, and mining drones with a settings toggle.
- **2025-03-23**: Tinted Radiant sprites to team colors and added a rotation offset to align sprite-forward direction.
- **2025-03-24**: Moved sprite tinting to cached offscreen canvases to preserve scene transparency and reduce per-frame work.
- **2025-03-24**: Applied the playfield rotation offset to unit rendering and motion trails for desktop landscape alignment.
- **2025-03-24**: Reduced Blade sword particle size, added pale connector lines, and retracted the blade when no enemies are in range.
- **2025-03-24**: Swapped selection range visuals to show attack range when idle and ability range only during active ability drags.
- **2025-03-24**: Added enemy ship sprites for Aurum units and clarified the shared sprite-forward rotation offset.

## Watch Out For
- Always convert game positions to pixels before drawing
- Save/restore canvas context when changing global properties
- fillStyle and strokeStyle persist between draws
- Text rendering can be expensive - minimize in HUD
- Transparency (globalAlpha) affects performance
- Canvas transforms (translate, rotate, scale) must be properly saved/restored
- Z-order is determined by draw order, not depth value
- Line width is in pixels, not game meters
- Selection rect coordinates are in pixel space
- Ability telegraphs need timing calculations for animations
- HP bars must clamp to [0, 1] range
- Color interpolation for HP bars uses RGB, not OKLCH
