# ModifierHelpScreen.tsx

## Purpose
Explains unit modifier categories (melee, ranged, flying, small, healing) and provides example units for each to help players understand combat interactions.

## Dependencies
### Imports
- `./ui/card` - Layout containers for the modifier sections
- `./ui/button` - Back button styling
- `@phosphor-icons/react` - Iconography for the header

### Used By
- `App.tsx` - Renders the screen when the modifier help mode is active

## Key Components

### MODIFIERS
- **Purpose:** Defines labels, descriptions, and example unit names for each modifier
- **Notes:** Example lists are curated strings and must be kept in sync with unit naming changes

### ModifierHelpScreen
- **Purpose:** Renders the help screen and back button for navigating to the previous menu
- **Props:** `onBack` callback to exit the screen

## Terminology
- **Modifier:** A tag that changes how units interact with attacks and abilities (e.g., melee ignores armor).

## Implementation Notes
### Critical Details
- Example lists are manually maintained; no automatic link to unit definitions exists.

### Known Issues
- Example units can drift out of date if unit names change without updating this screen.

## Future Changes
### Planned
- None currently scheduled

### Needed
- Consider sourcing example names directly from `UNIT_DEFINITIONS` to avoid manual drift.

## Change History
- **2025-03-22:** Updated melee examples to use Blade instead of Warrior.

## Watch Out For
- Keep modifier descriptions aligned with combat logic in `simulation.ts`.
