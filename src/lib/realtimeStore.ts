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
}

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
}

/**
 * Supabase adapter that stores multiplayer data in a Postgres table for realtime usage.
 */
class SupabaseKVStore implements RealtimeKVStore {
  private client: SupabaseClient | null;
  private tableName: string;

  constructor(url: string | undefined, anonKey: string | undefined, tableName: string) {
    // The Supabase table should include `key` (text), `value` (jsonb), and `updated_at` columns.
    this.client = url && anonKey ? createClient(url, anonKey) : null;
    this.tableName = tableName;
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
}

/**
 * Create the best available realtime store. Spark is preferred locally, Supabase otherwise.
 */
export function createRealtimeStore(): RealtimeKVStore {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const tableName = (import.meta.env.VITE_SUPABASE_KV_TABLE as string | undefined) ?? 'multiplayer_kv';

  // Prefer Supabase when credentials are provided to avoid Spark KV calls in non-Spark hosting.
  if (supabaseUrl && supabaseAnonKey) {
    return new SupabaseKVStore(supabaseUrl, supabaseAnonKey, tableName);
  }

  const sparkStore = new SparkKVStore();
  if (sparkStore.isAvailable()) {
    return sparkStore;
  }

  return new SupabaseKVStore(supabaseUrl, supabaseAnonKey, tableName);
}
