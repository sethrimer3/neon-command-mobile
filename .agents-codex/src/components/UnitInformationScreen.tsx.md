# UnitInformationScreen.tsx

## Purpose
A comprehensive unit information screen that displays detailed data about all units in the game, organized by faction (Radiant, Aurum, Solari). This screen serves as a complete reference guide for players to understand unit capabilities, stats, and abilities.

## Dependencies
### Imports
- `./ui/card` - Card components for layout structure
- `./ui/button` - Button component for navigation
- `@phosphor-icons/react` - Icons (ArrowLeft, Info)
- `../lib/types` - Type definitions for units, factions, and modifiers

### Used By
- `src/App.tsx` - Main application renders this screen when mode is 'unitInformation'

## Key Components

### UnitInformationScreen
- **Purpose:** Main screen component that renders all faction units
- **Props:** 
  - `onBack: () => void` - Callback to return to main menu
- **Notes:** Displays units in a responsive grid layout, grouped by faction

### UnitCard
- **Purpose:** Displays detailed information for a single unit
- **Props:**
  - `unitType: UnitType` - The type of unit to display
  - `playerColor: string` - Color used for UI elements
- **Returns:** JSX element with complete unit information card
- **Notes:** Shows icon, name, cost, modifiers, stats, attack description, and ability description

### ModifierBadge
- **Purpose:** Renders a styled badge for unit modifiers
- **Props:**
  - `modifier: UnitModifier` - The modifier type to display
- **Notes:** Uses color-coded badges with emoji icons for visual clarity

### Helper Functions

#### getAbilityDescription(unitType: UnitType): string
- **Purpose:** Returns detailed description of a unit's ability including damage values
- **Parameters:** Unit type identifier
- **Returns:** String describing the ability's effects and mechanics
- **Notes:** Contains hardcoded descriptions that must be manually updated when ability implementations change

#### getAttackDescription(unitType: UnitType): string
- **Purpose:** Returns description of a unit's normal attack
- **Parameters:** Unit type identifier
- **Returns:** String describing attack type, damage, range, and rate
- **Notes:** Dynamically generates description from UNIT_DEFINITIONS

#### getUnitIcon(unitType: UnitType): string
- **Purpose:** Returns emoji icon for a unit type
- **Parameters:** Unit type identifier
- **Returns:** Emoji character representing the unit
- **Notes:** Provides visual variety to unit cards

## Terminology
- **Faction:** One of three playable factions (Radiant, Aurum, Solari)
- **Modifier:** Special attribute affecting unit behavior (melee, ranged, flying, small, healing)
- **Ability:** Special power with cooldown that units can activate
- **Normal Attack:** Automatic attack units perform on enemies in range

## Implementation Notes

### Critical Details
- All unit stats are displayed directly from `UNIT_DEFINITIONS` in types.ts
- Ability descriptions are manually maintained and must be kept in sync with simulation.ts implementations
- Damage values in descriptions should match actual damage calculations in simulation functions
- The screen uses a responsive grid layout (1 column mobile, 2 columns desktop)
- Each faction section includes faction metadata (base speed, shape, ability)

### Data Synchronization
**IMPORTANT:** This component contains hardcoded ability descriptions that must be manually updated when:
1. Unit abilities change in simulation.ts
2. Damage values are modified
3. Ranges or durations are adjusted
4. New units are added to UNIT_DEFINITIONS

The component does NOT automatically reflect changes from types.ts or simulation.ts for ability descriptions.

### Performance Considerations
- Component renders all units at once (36 total units as of build 8)
- Uses scrollable container to handle overflow
- No virtualization implemented due to reasonable total count

## Known Issues
- No validation that ability descriptions match simulation.ts implementation
- Hardcoded descriptions require manual updates (documented in agents.md)
- Some unit abilities (berserker, nova, etc.) have placeholder descriptions from Solari faction units

## Future Changes

### Needed
- Add ability descriptions for units that currently have generic/placeholder text
- Consider extracting ability descriptions to a separate data file
- Add visual indicators for ability types (damage, healing, mobility, buff)
- Consider adding damage calculation tooltips showing armor interaction
- Add search/filter functionality for finding specific units

## Change History
- **2026-01-02:** Initial creation - comprehensive unit information screen with all 36 units across 3 factions
- **2026-01-07:** Updated the warrior ability description to reflect the shared laser-only ability.

## Watch Out For
- When adding new units, remember to add entries in:
  - `getAbilityDescription()` function
  - `getUnitIcon()` function (optional but recommended)
- When modifying damage values in simulation.ts, update corresponding descriptions here
- Ensure faction definitions in types.ts match the faction metadata displayed
- New modifier types need to be added to `ModifierBadge` color and icon mappings
