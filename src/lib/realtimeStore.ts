import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Defines a minimal key/value contract for multiplayer state persistence.
 * This lets us swap realtime backends (Spark, Supabase, paid providers) without touching game logic.
 */
export interface RealtimeKVStore {
  /** Returns true when the backend is configured and reachable. */
  isAvailable(): boolean;
  /** Fetches a JSON-serializable value from storage. */
  get<T>(key: string): Promise<T | null>;
  /** Writes a JSON-serializable value to storage. */
  set<T>(key: string, value: T): Promise<void>;
  /** Removes a key from storage. */
  delete(key: string): Promise<void>;
  /** Lists all entries that match a prefix for lightweight querying. */
  listEntries<T>(prefix: string): Promise<Array<{ key: string; value: T | null }>>;
  /** Append a command payload to a stream and return the assigned sequence number. */
  appendCommand<T>(streamKey: string, payload: T): Promise<number | null>;
  /** Fetch commands after a sequence number for stream-based polling. */
  listCommandsSince<T>(streamKey: string, sinceSeq: number): Promise<Array<{ seq: number; payload: T }>>;
}

// Local command log format for KV-backed command streams.
interface CommandLog<T> {
  lastSeq: number;
  entries: Array<{ seq: number; payload: T }>;
}

// Cap command logs so fallback stores don't grow without bound.
const MAX_COMMAND_LOG_ENTRIES = 500;
// Prefix for command log keys stored in KV backends.
const COMMAND_LOG_PREFIX = 'command-log:';

/**
 * Spark adapter so the existing Spark KV integration still works when available.
 */
class SparkKVStore implements RealtimeKVStore {
  // Ensure we only attempt to use Spark when running in the browser.
  isAvailable(): boolean {
    return typeof window !== 'undefined' && window.spark?.kv !== undefined;
  }

  // Read data from Spark KV using the provided key.
  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) {
      return null;
    }
    return (await window.spark.kv.get<T>(key)) || null;
  }

  // Persist data to Spark KV so other clients can see it.
  async set<T>(key: string, value: T): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }
    await window.spark.kv.set(key, value);
  }

  // Delete entries in Spark KV to clean up lobbies and matches.
  async delete(key: string): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }
    await window.spark.kv.delete(key);
  }

  // Spark KV exposes a key listing API, so filter by the requested prefix.
  async listEntries<T>(prefix: string): Promise<Array<{ key: string; value: T | null }>> {
    if (!this.isAvailable()) {
      return [];
    }
    // Fetch all Spark KV keys first, then hydrate their values for the caller.
    const keys = (await window.spark.kv.keys()).filter((key) => key.startsWith(prefix));
    const entries = await Promise.all(
      keys.map(async (key) => ({
        key,
        value: (await window.spark.kv.get<T>(key)) ?? null,
      })),
    );
    return entries;
  }

  // Store command logs in Spark KV so polling can avoid prefix scans elsewhere.
  async appendCommand<T>(streamKey: string, payload: T): Promise<number | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const commandLogKey = `${COMMAND_LOG_PREFIX}${streamKey}`;
    const existingLog = (await this.get<CommandLog<T>>(commandLogKey)) ?? { lastSeq: 0, entries: [] };
    const nextSeq = existingLog.lastSeq + 1;
    const updatedEntries = [...existingLog.entries, { seq: nextSeq, payload }];
    const trimmedEntries = updatedEntries.slice(-MAX_COMMAND_LOG_ENTRIES);

    await this.set(commandLogKey, {
      lastSeq: nextSeq,
      entries: trimmedEntries,
    });

    return nextSeq;
  }

  // Read a bounded in-memory log from Spark KV for commands since the last sequence.
  async listCommandsSince<T>(streamKey: string, sinceSeq: number): Promise<Array<{ seq: number; payload: T }>> {
    if (!this.isAvailable()) {
      return [];
    }

    const commandLogKey = `${COMMAND_LOG_PREFIX}${streamKey}`;
    const existingLog = await this.get<CommandLog<T>>(commandLogKey);
    if (!existingLog) {
      return [];
    }

    return existingLog.entries.filter((entry) => entry.seq > sinceSeq);
  }
}

/**
 * Supabase adapter that stores multiplayer data in a Postgres table for realtime usage.
 */
class SupabaseKVStore implements RealtimeKVStore {
  private client: SupabaseClient | null;
  private tableName: string;
  private commandsTableName: string;
  private useCommandsTable: boolean = true;

  constructor(
    url: string | undefined,
    anonKey: string | undefined,
    tableName: string,
    commandsTableName: string,
  ) {
    // The Supabase table should include `key` (text), `value` (jsonb), and `updated_at` columns.
    this.client = url && anonKey ? createClient(url, anonKey) : null;
    this.tableName = tableName;
    this.commandsTableName = commandsTableName;
  }

  // Supabase is available when the client has been configured with env credentials.
  isAvailable(): boolean {
    return this.client !== null;
  }

  // Fetch a value from the Supabase table by key.
  async get<T>(key: string): Promise<T | null> {
    if (!this.client) {
      return null;
    }

    const { data, error } = await this.client
      .from(this.tableName)
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      console.warn('Supabase get failed for key:', key, error);
      return null;
    }

    return (data?.value as T) ?? null;
  }

  // Upsert ensures the key/value pair is created or updated in one request.
  async set<T>(key: string, value: T): Promise<void> {
    if (!this.client) {
      return;
    }

    const { error } = await this.client
      .from(this.tableName)
      .upsert(
        {
          key,
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      );

    if (error) {
      console.warn('Supabase set failed for key:', key, error);
    }
  }

  // Delete a key in the Supabase table to clean up multiplayer state.
  async delete(key: string): Promise<void> {
    if (!this.client) {
      return;
    }

    const { error } = await this.client
      .from(this.tableName)
      .delete()
      .eq('key', key);

    if (error) {
      console.warn('Supabase delete failed for key:', key, error);
    }
  }

  // Use a prefix search to approximate Spark's key listing behavior.
  async listEntries<T>(prefix: string): Promise<Array<{ key: string; value: T | null }>> {
    if (!this.client) {
      return [];
    }

    const { data, error } = await this.client
      .from(this.tableName)
      .select('key, value')
      .like('key', `${prefix}%`);

    if (error) {
      console.warn('Supabase list failed for prefix:', prefix, error);
      return [];
    }

    return (data || []).map((row) => ({
      key: row.key as string,
      value: (row.value as T) ?? null,
    }));
  }

  // Append a command to a dedicated Supabase table to avoid prefix scanning.
  // Falls back to KV-based storage if the commands table doesn't exist.
  async appendCommand<T>(streamKey: string, payload: T): Promise<number | null> {
    if (!this.client) {
      return null;
    }

    // Try using the dedicated commands table if enabled
    if (this.useCommandsTable) {
      const { data, error } = await this.client
        .from(this.commandsTableName)
        .insert({
          game_id: streamKey,
          payload,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) {
        // Check if the error is because the table doesn't exist
        if (error.code === 'PGRST204' || error.code === 'PGRST205' || error.message?.includes('table')) {
          console.warn('Commands table not found, falling back to KV storage:', error.message);
          this.useCommandsTable = false;
          // Fall through to KV-based storage
        } else {
          console.warn('Supabase command insert failed for stream:', streamKey, error);
          return null;
        }
      } else {
        return typeof data?.id === 'number' ? data.id : null;
      }
    }

    // Fallback: Store command logs in the KV table like Spark does
    const commandLogKey = `${COMMAND_LOG_PREFIX}${streamKey}`;
    const existingLog = (await this.get<CommandLog<T>>(commandLogKey)) ?? { lastSeq: 0, entries: [] };
    const nextSeq = existingLog.lastSeq + 1;
    const updatedEntries = [...existingLog.entries, { seq: nextSeq, payload }];
    const trimmedEntries = updatedEntries.slice(-MAX_COMMAND_LOG_ENTRIES);

    await this.set(commandLogKey, {
      lastSeq: nextSeq,
      entries: trimmedEntries,
    });

    return nextSeq;
  }

  // Query commands by sequence id so polling only returns new rows.
  // Falls back to KV-based storage if the commands table doesn't exist.
  async listCommandsSince<T>(streamKey: string, sinceSeq: number): Promise<Array<{ seq: number; payload: T }>> {
    if (!this.client) {
      return [];
    }

    // Try using the dedicated commands table if enabled
    if (this.useCommandsTable) {
      const { data, error } = await this.client
        .from(this.commandsTableName)
        .select('id, payload')
        .eq('game_id', streamKey)
        .gt('id', sinceSeq)
        .order('id', { ascending: true });

      if (error) {
        // Check if the error is because the table doesn't exist
        if (error.code === 'PGRST204' || error.code === 'PGRST205' || error.message?.includes('table')) {
          console.warn('Commands table not found, falling back to KV storage:', error.message);
          this.useCommandsTable = false;
          // Fall through to KV-based storage
        } else {
          console.warn('Supabase command list failed for stream:', streamKey, error);
          return [];
        }
      } else {
        return (data || []).map((row) => ({
          seq: row.id as number,
          payload: (row.payload as T) ?? null,
        }));
      }
    }

    // Fallback: Read command logs from the KV table like Spark does
    const commandLogKey = `${COMMAND_LOG_PREFIX}${streamKey}`;
    const existingLog = await this.get<CommandLog<T>>(commandLogKey);
    if (!existingLog) {
      return [];
    }

    return existingLog.entries.filter((entry) => entry.seq > sinceSeq);
  }
}

/**
 * Create the best available realtime store. Spark is preferred locally, Supabase otherwise.
 */
export function createRealtimeStore(): RealtimeKVStore {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const tableName = (import.meta.env.VITE_SUPABASE_KV_TABLE as string | undefined) ?? 'multiplayer_kv';
  const commandsTableName =
    (import.meta.env.VITE_SUPABASE_COMMANDS_TABLE as string | undefined) ?? 'multiplayer_commands';

  // Prefer Supabase when credentials are provided to avoid Spark KV calls in non-Spark hosting.
  if (supabaseUrl && supabaseAnonKey) {
    return new SupabaseKVStore(supabaseUrl, supabaseAnonKey, tableName, commandsTableName);
  }

  const sparkStore = new SparkKVStore();
  if (sparkStore.isAvailable()) {
    return sparkStore;
  }

  return new SupabaseKVStore(supabaseUrl, supabaseAnonKey, tableName, commandsTableName);
}
