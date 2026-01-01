# loading.css

## Purpose
Defines the startup overlay styling, including logo animations, the sprite-based loading spinner, and responsive adjustments for smaller screens.

## Dependencies
### Imports
- None (plain CSS stylesheet).

### Used By
- `src/main.tsx` imports this stylesheet to style the startup overlay.

## Key Components

### Startup Overlay Containers
- **Purpose:** Positions the overlay, logo, build badge, and loading hint text.
- **Notes:** Uses fixed positioning and opacity transitions for smooth entry/exit animations.

### Sprite Sheet Animation
- **Purpose:** Animates the loading sprite sheet in `#startup-spinner-sprite`.
- **Notes:** The sprite sheet URL is provided via a CSS variable so the base path can be adjusted for GitHub Pages.

### Responsive Adjustments
- **Purpose:** Scales logo, spinner, and animation frame sizes for tablet/mobile breakpoints.
- **Notes:** Updates `background-size` and keyframes to match resized sprite frames.

## Terminology
- **Sprite Sheet:** A single image containing many animation frames.
- **Startup Overlay:** The pre-React loading screen.

## Implementation Notes

### Critical Details
- `#startup-spinner-sprite` expects a `--startup-spinner-image` CSS variable containing a full `url(...)` value.
- Animation frame sizes must stay consistent with sprite sheet dimensions to prevent tearing.

### Known Issues
- None currently identified.

## Future Changes

### Planned
- None documented.

### Needed
- Consider moving frame counts and sizes to CSS variables if more sprite sheets are introduced.

## Change History
- **2026-01-01:** Documented sprite sheet base-path handling via CSS variables.

## Watch Out For
- Changing sprite sheet dimensions requires updating both `background-size` and keyframe offsets.
- Keep the overlay animations in sync with the JavaScript dismissal timing.
