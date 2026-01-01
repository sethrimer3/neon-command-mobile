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
- **Purpose:** Defines basic KV operations (get/set/delete/list) for multiplayer data.
- **Notes:** Keeps backend selection isolated from gameplay logic.

### SparkKVStore
- **Purpose:** Adapter that wraps `window.spark.kv` APIs.
- **Notes:** Used when running in Spark runtime.

### SupabaseKVStore
- **Purpose:** Adapter that stores data in a Supabase table.
- **Parameters:** Supabase URL, anon key, and table name.
- **Notes:** Uses upsert on `key` to keep state current.

### createRealtimeStore()
- **Purpose:** Selects Spark when available, otherwise falls back to Supabase.
- **Notes:** Reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and optional `VITE_SUPABASE_KV_TABLE`.

## Terminology
- **KV Store:** Simple key/value storage for multiplayer state.
- **Backend Adapter:** Implementation that maps the KV interface to a provider API.

## Implementation Notes

### Critical Details
- Spark store only runs in browser environments.
- Supabase requires a `multiplayer_kv` table with `key`, `value`, and `updated_at` fields.
- `list(prefix)` supports lobby/command lookup without full table scans in Spark.

### Known Issues
- Supabase errors are logged but not thrown to avoid breaking game flow.

## Future Changes

### Planned
- None currently scheduled

### Needed
- Add realtime subscriptions to reduce polling when using Supabase.
- Add adapter for paid providers (e.g., dedicated WebSocket server).

## Change History
- **2026-01-01**: Added Spark/Supabase realtime store abstraction.

## Watch Out For
- Ensure env vars are set in production builds.
- Keep table schema consistent with Supabase adapter expectations.
- Avoid storing large payloads in KV to reduce bandwidth.
