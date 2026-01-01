# package.json

## Purpose
Defines project metadata, scripts, and runtime dependencies for the SoL-RTS frontend.

## Dependencies
### Imports
- None (metadata file)

### Used By
- `npm`/`vite` tooling for installs and scripts

## Key Components

### Scripts
- **dev**: Starts Vite dev server
- **build**: Type-checks and builds the app
- **lint**: Runs ESLint
- **preview**: Serves the production build

### Dependencies
- Frontend UI libraries (Radix, Phosphor icons)
- Game runtime utilities (three.js, d3)
- Multiplayer support (Supabase client)

## Implementation Notes

### Critical Details
- `@supabase/supabase-js` is used for Supabase realtime integration.

## Change History
- **2026-01-01**: Added Supabase client dependency for online multiplayer.
