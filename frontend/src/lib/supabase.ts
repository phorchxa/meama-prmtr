import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser client — ANON key ONLY. The service-role key must never reach the
// frontend. Session state lives in Supabase (no localStorage per conventions).
const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(url && anonKey);

// createClient throws on an empty URL, which would crash the whole bundle at
// load and blank the app. Only construct it when env is present; every call
// site must check isSupabaseConfigured before touching `supabase`.
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        // In-memory session only — persistSession would fall back to
        // localStorage, which this project forbids.
        persistSession: false,
        autoRefreshToken: true,
      },
    })
  : (null as unknown as SupabaseClient);
