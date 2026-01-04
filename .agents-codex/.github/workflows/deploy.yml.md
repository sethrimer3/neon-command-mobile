# .github/workflows/deploy.yml

## Purpose
Defines the GitHub Pages deployment workflow for building and publishing the Vite app.

## Dependencies
### Imports
- None

### Used By
- GitHub Actions runner when deploying the `main` branch to GitHub Pages

## Key Components

### Build Job
- **Purpose:** Installs dependencies and runs the production build before uploading the Pages artifact.
- **Notes:** Supplies Supabase environment variables via GitHub Actions secrets during the build.

### Deploy Job
- **Purpose:** Deploys the uploaded artifact to GitHub Pages.
- **Notes:** Uses the `actions/deploy-pages` action for publishing.

## Terminology
- **Pages Artifact:** The bundled output in `dist/` uploaded for GitHub Pages deployment.

## Implementation Notes

### Critical Details
- Build step must receive `VITE_SUPABASE_*` secrets for multiplayer configuration on GitHub Pages.
- Deployment targets the `dist/` directory produced by Vite.

### Known Issues
- None currently identified.

## Future Changes

### Planned
- None scheduled.

### Needed
- Add environment validation if more build-time variables are required.

## Change History
- **2026-01-01**: Added Supabase build-time secrets for GitHub Pages deployment.

## Watch Out For
- Keep secrets in GitHub Actions settings, never in the repo.
- Ensure the Pages artifact path matches the build output directory.
