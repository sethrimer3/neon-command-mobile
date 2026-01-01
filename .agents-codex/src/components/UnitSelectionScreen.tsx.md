# UnitSelectionScreen.tsx

## Purpose
Provides the unit loadout configuration screen where players select faction and assign unit types to the four directional slots around the base.

## Dependencies
### Imports
- `react` - Local component state with `useState`
- `./ui/card` - Card layout components
- `./ui/button` - Button styling
- `@phosphor-icons/react` - Back arrow icon
- `../lib/types` - Unit types, definitions, colors, and faction data

### Used By
- `App.tsx` - Renders the unit selection screen when entering loadout configuration

## Key Components

### UnitSelectionScreen
- **Purpose:** Displays faction selection, base preview, and unit slot configuration.
- **Props:**
  - `unitSlots` (left/up/down/right)
  - `onSlotChange` callback for slot assignments
  - `onBack` handler to return to menu
  - `playerColor`/`playerFaction` styling and filtering
  - `onFactionChange` callback to update faction and reset slots
- **Notes:** Uses absolute positioning around a square layout to keep slot buttons aligned around the base icon.

### renderUnitIcon(unitType, size)
- **Purpose:** Returns an SVG icon for each unit type with player color applied.
- **Notes:** Handles all unit types supported by `UNIT_DEFINITIONS`.

## Terminology
- **Unit Slots:** Directional spawn shortcuts (up, down, left, right).
- **Faction:** Player-selected group that defines available units and base shape.

## Implementation Notes

### Critical Details
- The base/slot layout relies on a fixed square container to position directional buttons.
- Slot buttons use absolute positioning to anchor top/left/right/bottom around the base.

### Known Issues
- None currently identified

## Future Changes

### Planned
- None currently scheduled

### Needed
- Consider responsive scaling improvements for smaller screens

## Change History
- **2026-01-01**: Fixed the slot layout by enforcing a consistent square aspect ratio for the base container.

## Watch Out For
- Keep slot button offsets aligned with the base container size
- Ensure faction changes reset to valid unit slots
