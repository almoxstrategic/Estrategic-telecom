import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const AUTH_STORAGE_KEY = "estrategic-auth-session";

let client: SupabaseClient | null = null;

function getAuthStorage() {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env (veja .env.example).",
    );
  }

  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: getAuthStorage(),
        storageKey: AUTH_STORAGE_KEY,
      },
    });
  }

  return client;
}

export function getStoragePublicUrl(path: string): string {
  const supabase = getSupabaseClient();
  const { data } = supabase.storage.from("evidencias-fotos").getPublicUrl(path);
  return data.publicUrl;
}
