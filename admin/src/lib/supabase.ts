import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when both Supabase env vars are present. Checked before any client use. */
export const isConfigured: boolean = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClient | null = null;

/**
 * Lazily-created singleton Supabase client.
 * Callers must gate on `isConfigured` first (App renders a config screen otherwise).
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Distinct storage key so the admin session never collides with the
        // main app's session if both run on the same origin in dev.
        storageKey: "hometongue-admin-auth",
      },
    });
  }
  return client;
}
