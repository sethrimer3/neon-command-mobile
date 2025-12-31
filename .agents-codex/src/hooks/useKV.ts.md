# useKV.ts

## Purpose
Provides a localStorage-backed replacement for Spark's `useKV` hook so the app can persist settings on static hosting like GitHub Pages without relying on Spark KV endpoints.

## Dependencies
### Imports
- `react` - State, effect, and callback hooks

### Used By
- `src/App.tsx` - Persists player settings, selected maps, audio preferences, and statistics

## Key Components

### useKV(key, initialValue)
- **Purpose:** Persist a value in localStorage with a React state API that mirrors Spark's `useKV`.
- **Parameters:**
  - `key`: Storage key to read/write.
  - `initialValue`: Default value when nothing is stored.
- **Returns:** Tuple of `[value, setValue, deleteValue]`.
- **Notes:** Reads localStorage on mount, writes on change, and clears storage when value is undefined.

## Terminology
- **Local Storage**: Browser key-value storage used for persistence on static hosting.
- **Delete Value**: Helper that clears the stored key and resets state to undefined.

## Implementation Notes

### Critical Details
- Initializes state from the provided default to keep UI responsive before storage loads.
- JSON parsing errors fall back to the initial value and log a warning.
- Storage writes are guarded to avoid running during SSR.

### Known Issues
- None currently identified.

## Future Changes

### Planned
- None scheduled.

### Needed
- Consider optional migration path if Spark KV is reintroduced.

## Change History
- Added localStorage-based persistence hook for GitHub Pages compatibility.

## Watch Out For
- Always keep JSON parse/write errors non-fatal to avoid blocking the UI.
- Updates to the hook signature should stay aligned with Spark's `useKV`.
