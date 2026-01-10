# MULTIPLAYER.md

## Purpose
Documents the multiplayer systems (online via Spark/Supabase and LAN via WebRTC) along with setup, flow, and troubleshooting guidance.

## Dependencies
### Imports
- None

### Used By
- Developers and operators configuring multiplayer backends

## Key Components
### Overview and Features
- **Purpose:** Summarizes supported multiplayer modes, lobby flow, and real-time synchronization.

### Supabase (Production)
- **Purpose:** Lists required environment variables and schema for Supabase-backed multiplayer storage.
- **Notes:** Includes setup-from-scratch instructions and RLS policy guidance for anon clients.

### LAN Multiplayer
- **Purpose:** Explains peer-to-peer LAN mode usage and troubleshooting.

### Technical Details
- **Purpose:** Calls out relevant source files and data structures.

## Terminology
- **RealtimeKVStore:** The backend abstraction used for multiplayer data.
- **Lobby:** A shared session record used to coordinate matchmaking and game start.

## Implementation Notes
### Critical Details
- Supabase requires a Postgres table with `key`, `value`, and `updated_at` columns.
- The anon key needs read/write access to the multiplayer table for browser clients.

### Known Issues
- None documented.

## Future Changes
### Planned
- None documented.

### Needed
- Consider tighter Supabase RLS policies once authenticated sessions are added.

## Change History
- **2025-03-24:** Added Supabase-from-scratch setup steps and RLS guidance.
- **2025-03-24:** Added troubleshooting note for Spark KV 404s on GitHub Pages.

## Watch Out For
- Ensure environment variables match the Supabase project and table name.
- Keep troubleshooting guidance aligned with the multiplayer error messages in code.
