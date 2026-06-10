import { createClient } from "@supabase/supabase-js";

// Browser client — ANON key ONLY. The service-role key must never reach the
// frontend. Session state lives in Supabase (no localStorage per conventions).
const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Avoid localStorage/sessionStorage: keep auth in-memory for this app.
    storage: undefined,
  },
});

export const isSupabaseConfigured = Boolean(url && anonKey);
