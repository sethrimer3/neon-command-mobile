# agents.md

## Purpose
Defines project-wide guidelines for AI agents, including documentation expectations, build number tracking, and codex update requirements.

## Dependencies
### Imports
- None

### Used By
- AI agents and developers referencing contribution guidelines

## Key Components

### Build Information
- **Purpose:** Tracks the build number for agent-driven changes
- **Notes:** Incremented with each pull request

### Core Principles
- **Purpose:** Defines documentation, unused code reporting, and codex update rules
- **Notes:** Emphasizes detailed code comments and codex maintenance

### Agents Codex System
- **Purpose:** Describes the codex directory layout and file format
- **Notes:** Mirrored structure under `.agents-codex/`

## Terminology
- **Codex File:** Documentation file that mirrors a source file
- **Build Number:** Integer tracked to indicate change cadence

## Implementation Notes

### Critical Details
- Instructions apply to the entire repository unless overridden
- Codex updates are mandatory when files change

### Known Issues
- None currently identified

## Future Changes

### Planned
- None scheduled

### Needed
- Automate build number tracking if manual updates become error-prone

## Change History
- **2026-01-01**: Incremented build number to align with latest changes

## Watch Out For
- Keep the build number in sync with pull requests
- Ensure codex updates accompany code changes
