import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Config-gated Supabase client.
//
// The anon key is designed to be public — it ships in the client bundle by
// design, and Row-Level Security (see supabase/migrations/) is the actual
// security boundary. Never put the service-role key in a VITE_ variable.
//
// When these env vars are absent (the default), the app runs entirely on
// local IndexedDB storage and this module is inert.
const supabaseUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured: boolean = Boolean(supabaseUrl && supabaseAnonKey);

let memoizedClient: SupabaseClient | null = null;

/**
 * Returns the shared Supabase client, creating it on first use.
 * Throws when `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are not set —
 * callers must check `isSupabaseConfigured` before entering cloud mode.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY " +
        "(and VITE_STORAGE_MODE=cloud) to enable cloud storage, or use VITE_STORAGE_MODE=local."
    );
  }
  if (!memoizedClient) {
    memoizedClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return memoizedClient;
}
