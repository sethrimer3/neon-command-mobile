# loadingScreen.ts

## Purpose
Manages the startup loading overlay lifecycle, including minimum display time, exit animations, and fail-safe dismissal when React fails to mount.

## Dependencies
### Imports
- None (uses DOM globals: `document`, `window`, `requestAnimationFrame`).

### Used By
- `src/main.tsx` (initializes, dismisses, and sets fallbacks for the startup overlay).

## Key Components

### `initializeStartupOverlay()`
- **Purpose:** Ensures the overlay is visible and records initialization state.
- **Parameters:** None.
- **Returns:** `void`.
- **Notes:** Adds the visible class with `requestAnimationFrame` to trigger CSS transitions.

### `dismissStartupOverlay()`
- **Purpose:** Starts exit animations and removes the overlay after the minimum display duration.
- **Parameters:** None.
- **Returns:** `void`.
- **Notes:** Clears the safety timeout and removes the overlay from the DOM after the exit animation.

### `setupSafetyTimeout()`
- **Purpose:** Forces dismissal if React never mounts (after a max timeout).
- **Parameters:** None.
- **Returns:** `void`.
- **Notes:** Avoids redundant work if the overlay is already exiting.

### `setupLoadEventDismissal()`
- **Purpose:** Dismisses the overlay when the window load event fires.
- **Parameters:** None.
- **Returns:** `void`.
- **Notes:** Guards against duplicate listeners and handles the case where the load event already fired.

## Terminology
- **Startup overlay:** Full-screen loading screen shown before the React app renders.
- **Exit animation:** CSS-driven fade-out and slide animation before the overlay is removed.

## Implementation Notes

### Critical Details
- `overlayVisibleTime` uses module load time to enforce minimum display duration.
- `hasLoadEventListener` prevents duplicate load event handlers during HMR or repeated calls.
- Exit animation timing must match the CSS duration in `src/styles/loading.css`.

### Known Issues
- None currently identified.

## Future Changes

### Planned
- None scheduled.

### Needed
- Consider exposing the overlay element ID as a shared constant if reused elsewhere.

## Change History
- **2026-01-12:** Added load event dismissal fallback and tracking flag to avoid duplicate listeners.

## Watch Out For
- Keep DOM access guarded for missing elements.
- Update timeout constants if CSS animation durations change.
- Avoid calling dismissal functions before the DOM is ready unless guarded.
