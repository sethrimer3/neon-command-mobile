# TutorialHints.tsx

## Purpose
Defines the in-game tutorial hint card component and the catalog of hint messages presented to new players.

## Dependencies
### Imports
- `./ui/card` - Card and CardContent UI primitives
- `./ui/button` - Button component for dismiss action
- `@phosphor-icons/react` - X icon for dismiss control

### Used By
- `App.tsx` - Renders tutorial hints based on game state

## Key Components

### TutorialHint
- **Purpose:** Renders a single tutorial hint card with title, message, and dismiss action
- **Parameters:**
  - `title`: Displayed heading text
  - `message`: Body text describing the tip
  - `position`: Optional fixed position for on-screen placement
  - `onDismiss`: Callback to hide the hint
- **Notes:** Uses a translucent card with an animated entrance

### TUTORIAL_HINTS
- **Purpose:** Central registry of tutorial hint copy
- **Notes:** Keys map to game events (unit spawn, selection, movement, abilities, base laser)

## Terminology
- **Hint Card:** A small overlay card that teaches a single mechanic
- **Dismiss:** The action of closing a hint after reading it

## Implementation Notes

### Critical Details
- Hints are styled with a frosted background for readability
- Position is optional to allow contextual placement
- Copy should match current control schemes and gameplay behavior

### Known Issues
- None currently identified

## Future Changes

### Planned
- None scheduled

### Needed
- Consider localization support if tutorial text expands

## Change History
- **2026-01-01**: Updated unit spawn hint to reflect swipe-anywhere behavior when the base is selected

## Watch Out For
- Keep hint copy in sync with input mechanics
- Avoid blocking critical UI elements when positioning hints
