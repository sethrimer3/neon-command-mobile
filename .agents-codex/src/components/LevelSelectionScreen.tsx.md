# LevelSelectionScreen.tsx

## Purpose
Renders the single-player level selection UI, including scrollable map cards with visual previews of obstacles and base positions.

## Dependencies
### Imports
- `ARENA_HEIGHT_METERS`, `ARENA_WIDTH_METERS`, `BASE_SIZE_METERS` from `src/lib/types`
- `getMapList`, `getValidBasePositions`, `MapDefinition` from `src/lib/maps`
- `Button` from `src/components/ui/button`
- `Card`, `CardContent`, `CardHeader`, `CardTitle` from `src/components/ui/card`
- `ScrollArea` from `src/components/ui/scroll-area`
- `ArrowLeft`, `MapPin` from `@phosphor-icons/react`

### Used By
- `src/App.tsx` (renders the screen during vs. AI flow)

## Key Components
### `metersToPercent`
- **Purpose:** Converts meter values into percent-based CSS values for map previews.
- **Parameters:** `value`, `total`
- **Returns:** Percentage string for inline styles.
- **Notes:** Keeps previews aligned to the arena dimensions.

### `getObstaclePreviewStyles`
- **Purpose:** Builds scaled obstacle styles for preview rendering.
- **Parameters:** `map`
- **Returns:** Array of obstacle style metadata.
- **Notes:** Uses map-specific arena sizes when available.

### `getBasePreviewStyles`
- **Purpose:** Computes scaled base marker styles for previews.
- **Parameters:** `map`
- **Returns:** Object with player/enemy style data.
- **Notes:** Uses `getValidBasePositions` to avoid placing bases on obstacles.

### `LevelPreview`
- **Purpose:** Draws the preview card for a map layout.
- **Parameters:** `map`
- **Returns:** JSX preview with obstacles and base markers.
- **Notes:** Uses color-coded bases for player/enemy clarity.

### `LevelSelectionScreen`
- **Purpose:** Displays the list of selectable levels with scroll support.
- **Parameters:** `onBack`, `onSelectLevel`, `currentMap`
- **Returns:** JSX screen layout.
- **Notes:** Scroll area has a fixed height to ensure vertical scrolling.

## Terminology
- **Preview:** The miniature arena rendering showing obstacles and base locations.
- **Base Marker:** The colored circle indicating player or enemy starting positions.

## Implementation Notes
### Critical Details
- Uses fixed arena dimensions when map-specific sizes are undefined.
- Preview scaling relies on percent-based positioning for responsive layout.

### Known Issues
- None currently identified.

## Future Changes
### Planned
- None scheduled.

### Needed
- Consider adding a legend for base colors if more markers are added.

## Change History
- **2026-01-04:** Added map previews and scrolling constraint to level selection.

## Watch Out For
- Keep map preview scaling consistent if arena dimensions change.
- Update preview logic when map obstacle types are expanded.
