# index.html

## Purpose
Defines the HTML entry point for the Vite-powered React application, including metadata, font loading, and the root mount element.

## Dependencies
### Imports
- External Google Fonts stylesheet for UI typography.

### Used By
- Vite build pipeline as the HTML entry file.

## Key Components
### Document Head
- **Purpose:** Sets up metadata, title, font preconnects, and the entry stylesheet link.
- **Notes:** Uses relative paths to keep asset URLs compatible with GitHub Pages base paths.

### Root Mount Point
- **Purpose:** Provides the `#root` element where React renders the app.

### Entry Module Script
- **Purpose:** Loads the Vite entry module to bootstrap the React application.
- **Notes:** Uses a relative path to ensure correct asset resolution on GitHub Pages.

## Terminology
- **Entry Module:** The main script (`src/main.tsx`) that initializes the React app.

## Implementation Notes
### Critical Details
- Relative asset paths (`./src/...`) ensure compatibility when the site is served from a subdirectory.
- Font preconnects improve font loading performance.

### Known Issues
- None documented.

## Future Changes
### Planned
- None documented.

### Needed
- None documented.

## Change History
- **2025-02-14:** Updated asset paths to be relative for GitHub Pages compatibility and added explanatory comments.

## Watch Out For
- Keep asset paths relative if the site is hosted under a non-root base path.
- Ensure any additional assets are referenced in a way that Vite can rewrite during build.
