# realtimeStore.ts

## Purpose
Provides a backend-agnostic realtime KV store interface and adapters for Spark KV and Supabase. This allows multiplayer features to switch providers without changing game logic.

## Dependencies
### Imports
- `@supabase/supabase-js` - Supabase client for KV storage

### Used By
- `src/lib/multiplayer.ts` - Multiplayer persistence and command sync
- `src/App.tsx` - Initializes multiplayer with the best available store

## Key Components

### RealtimeKVStore Interface
- **Purpose:** Defines basic KV operations (get/set/delete/listEntries) for multiplayer data.
- **Notes:** Keeps backend selection isolated from gameplay logic and supports batching for command lookups.
- **Command Streams:** Includes `appendCommand` and `listCommandsSince` to support sequential command polling without prefix scans.

### SparkKVStore
- **Purpose:** Adapter that wraps `window.spark.kv` APIs.
- **Notes:** Used when running in Spark runtime.
  - Stores a bounded command log in KV so command polling remains sequential.

### SupabaseKVStore
- **Purpose:** Adapter that stores data in a Supabase table.
- **Parameters:** Supabase URL, anon key, KV table name, command table name.
- **Notes:** Uses upsert on `key` to keep state current and appends commands to a dedicated table for sequential reads.

### createRealtimeStore()
- **Purpose:** Selects Supabase when credentials are present, otherwise uses Spark when available.
- **Notes:** Reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_SUPABASE_KV_TABLE`, and optional `VITE_SUPABASE_COMMANDS_TABLE`.

## Terminology
- **KV Store:** Simple key/value storage for multiplayer state.
- **Backend Adapter:** Implementation that maps the KV interface to a provider API.

## Implementation Notes

### Critical Details
- Spark store only runs in browser environments.
- Supabase requires a `multiplayer_kv` table with `key`, `value`, and `updated_at` fields.
- Supabase commands table should include `id` (numeric primary key), `game_id` (text), `payload` (jsonb), and `created_at` fields.
- `listEntries(prefix)` returns key/value pairs so callers can avoid per-key fetches.
- Command streams are bounded in Spark/LAN to avoid unbounded growth.

### Known Issues
- Supabase errors are logged but not thrown to avoid breaking game flow.

## Future Changes

### Planned
- None currently scheduled

### Needed
- Add realtime subscriptions to reduce polling when using Supabase.
- Add adapter for paid providers (e.g., dedicated WebSocket server).
- Add pruning logic for Supabase command rows if long-running games accumulate too many events.

## Change History
- **2026-01-01**: Added Spark/Supabase realtime store abstraction.
- **2025-03-24**: Preferred Supabase when credentials are configured to avoid Spark KV calls on non-Spark hosts.
- **2025-03-24**: Switched to `listEntries` to batch command retrieval and reduce Supabase request volume.
- **2025-03-24**: Added sequential command stream methods with a Supabase-backed command log table.

## Watch Out For
- Ensure env vars are set in production builds.
- Keep table schema consistent with Supabase adapter expectations.
- Avoid storing large payloads in KV to reduce bandwidth.
