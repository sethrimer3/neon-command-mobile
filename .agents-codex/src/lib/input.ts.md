# input.ts

## Purpose
Handles all user input for the game including touch, mouse, and keyboard events. Manages unit selection, command issuing, base dragging, and unit spawning. Supports both single-player and local two-player modes with split-screen input handling.

## Dependencies
### Imports
- `./types` - Game types and constants
- `./gameUtils` - Coordinate conversions and vector math
- `./camera` - Camera transforms for screen/world conversion and zooming
- `./simulation` - spawnUnit() function
- `./sound` - Sound effect playback

### Used By
- `App.tsx` - Registers event handlers for canvas

## Key Components

### Touch/Mouse State Management
- **TouchState Interface**: Tracks individual touch/mouse interactions
- **touchStates Map**: Stores state for multi-touch support
- **mouseState**: Stores single mouse pointer state
- **pinchState**: Tracks last pinch distance for zoom gestures

### Constants
- **SWIPE_THRESHOLD_PX**: `30` - Minimum distance to register as swipe
- **TAP_TIME_MS**: `300` - Maximum duration for tap
- **HOLD_TIME_MS**: `200` - Minimum duration for hold

### Event Handlers

#### handleTouchStart/handleMouseDown
- **Purpose:** Initiates touch/click interaction
- **Notes:**
  - Records start position and time
  - Detects touched base or movement target
  - Supports split-screen for two-player mode

#### handleTouchMove/handleMouseMove
- **Purpose:** Handles dragging and selection box
- **Notes:**
  - Enters drag mode after 10px movement
  - Creates selection rectangle only when no units are selected and no base is selected
  - This allows swiping anywhere to spawn units once the base is selected
  - Updates base movement target
  - Handles movement dot dragging
  - Applies pinch zoom when two touches are active

#### handleTouchEnd/handleMouseUp
- **Purpose:** Completes interaction and executes commands
- **Notes:**
  - Tap: Select/deselect units or bases
  - Hold: Show unit spawn menu
  - Swipe: Spawn units when the base is selected, or issue unit commands
  - Drag: Box select or move base

### Helper Functions

#### findTouchedUnit/Base/MovementDot
- **Purpose:** Detect what the user interacted with
- **Notes:** Uses distance checks with appropriate radii

#### getSelectedBase
- **Purpose:** Find the currently selected base for a player
- **Notes:** Used to gate swipe-to-spawn behavior and selection rect creation

#### selectUnitsInBox
- **Purpose:** Box selection for multiple units
- **Notes:** Filters by player ownership and prioritizes units over base selection

#### issueCommandToSelected
- **Purpose:** Add command to selected units' queues
- **Notes:** 
  - Checks queue length limits
  - Handles both move and ability commands
  - Plays appropriate sound effects

### getActiveSelectionRect()
- **Purpose:** Returns current selection box if active
- **Notes:** Used by renderer to show selection

## Terminology
- **Touch State**: Data structure tracking a touch/click interaction
- **Swipe**: Fast drag gesture for issuing commands
- **Tap**: Quick press and release
- **Hold**: Long press to trigger special actions
- **Box Select**: Drag selection for multiple units
- **Movement Dot**: Visual indicator and control for base movement
- **Split Screen**: Left/right halves for two-player mode

## Implementation Notes

### Critical Details
- Multi-touch support via Map of touch identifiers
- Pinch zoom uses the distance between two touches to drive camera zoom
- Split-screen: left half for player 0, right half for player 1 within the arena viewport
- Player ownership determined by screen position relative to the arena viewport center in two-player mode
- Falls back to window width for split detection if viewport dimensions are not initialized
- Selection is shift-additive with modifier key
- Base dragging only works for own bases
- Unit spawning shows menu on hold (200ms+)
- Swipe distance and direction determines command type
- Command queue respects QUEUE_MAX_LENGTH
- Ability command input no longer checks cooldowns, allowing queuing at any time
- Ability command queue nodes clone their origin/direction vectors to avoid later mutation
- Coordinates converted from screen pixels to game meters via camera-aware transforms
- Touch events prevented to avoid browser scrolling
- Mining depot drags snap toward the closest available deposit by drag angle, with a preview line stored in `state.miningDragPreview`
- Mining drone creation can be canceled by releasing near the depot, and deposits cap at two drones with cadence delays for staggering
- Double-tap selection clears current selection unless tapping a friendly unit, which selects all same-type friendly units
- Group move formation spacing scales with unit size to keep destinations from overlapping

### Input Modes
1. **Tap**: Select units/bases
2. **Hold**: Spawn unit menu
3. **Swipe**: Issue commands to units
4. **Drag**: Box select or move base

### Two-Player Split Screen
- Screen divided vertically at the arena viewport center
- Each player controls only their side
- Input position determines player ownership

### Known Issues
- None currently identified

## Potential Issues

### Unused Code
- **Location:** `src/lib/input.ts` (handleAbilityDrag)
- **Description:** Vector-based ability drag helper is defined but not referenced
- **Reason:** No call sites found in touch/mouse handlers
- **Recommendation:** Remove if obsolete or wire it into input handling

## Future Changes

### Planned
- None scheduled

### Needed
- Keyboard shortcuts for unit spawning
- Hotkey groups for unit selection
- Minimap input
- Better unit spawn UI (not just hold)
- Right-click for alternative commands
- Ctrl+click for special actions
- Formation commands

## Change History
- Initial creation with touch support
- Added mouse input mirroring touch
- Implemented split-screen two-player
- Added base movement via dragging
- Added unit spawn hold mechanic
- **2025-12-31**: Fixed mobile selection box to create immediately when no units are selected (removed hold time requirement for empty selection)
- **2026-01-01**: Allowed swipe-to-spawn anywhere when the base is selected and prioritized units over base selection in box select
- **2026-01-03**: Anchored split-screen input detection to the letterboxed arena viewport center
- **2026-01-05**: Cloned ability command origin/direction vectors to keep queued ability anchors stable
- **2026-01-06**: Derived ability drag vectors from world-space positions to respect rotated desktop input
- **2025-03-17**: Added mining depot snap-to-deposit drag logic, preview state updates, and cancellation behavior near depots
- **2025-03-18**: Disabled box selection when dragging from mining depots and scaled mining drone selection to match larger render size
- **2026-01-04**: Added camera-aware screen/world conversions and pinch-to-zoom handling for touch input
- **2026-01-08**: Updated double-tap selection to select all same-type friendly units and deselect on enemy/empty taps
- **2025-03-21**: Removed ability cooldown checks when queueing ability commands so input always enqueues them
- **2025-03-24**: Increased group move spacing relative to unit size to reduce stacking at shared destinations

## Watch Out For
- Always prevent default on touch events to avoid scrolling
- Touch identifiers are not sequential - use Map
- Mouse events don't have identifiers - use single mouseState
- Player index determined by screen position in two-player mode
- Coordinate conversion required for all positions
- Selection box coordinates are in pixels
- Command queue length must be checked before adding
- Hold time must account for frame timing
- Swipe detection needs threshold to avoid accidental commands
- Base dragging should only move own bases
- Unit selection must filter by ownership
- Sound effects must be played for player feedback
- Touch move distance calculation uses Pythagorean theorem
- Selection additive mode requires checking modifier keys
