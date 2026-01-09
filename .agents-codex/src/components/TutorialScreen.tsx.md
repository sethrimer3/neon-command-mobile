# TutorialScreen.tsx

## Purpose
Displays the in-game tutorial tips and guidance text for new players, including movement, combat, and economy reminders.

## Dependencies
### Imports
- `./ui/card` - Layout containers for tutorial content
- `./ui/button` - Back button styling
- `@phosphor-icons/react` - Iconography for the header

### Used By
- `src/App.tsx` - Renders the screen when tutorial mode is active

## Key Components

### TutorialScreen
- **Purpose:** Renders the tutorial copy and back navigation
- **Props:** `onBack` callback to exit the tutorial screen
- **Notes:** Tutorial copy is a static array of strings rendered in order

## Terminology
- **Tutorial Tip:** A single line of instructional text shown to the player

## Implementation Notes

### Critical Details
- Tutorial strings are hardcoded and must be updated manually when unit names change.

### Known Issues
- None currently identified

## Future Changes

### Planned
- None currently scheduled

### Needed
- Consider sourcing tutorial copy from a shared content file to reduce drift

## Change History
- **2026-01-08:** Updated scouting tip to reference the Dagger unit name

## Watch Out For
- Keep references to unit names aligned with `UNIT_DEFINITIONS` updates
