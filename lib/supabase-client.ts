import { createClient } from "@supabase/supabase-js";

let _client: ReturnType<typeof createClient> | null = null;

// Wrap fetch with a 30-second hard timeout so Supabase DB updates never hang
// indefinitely (a hung await updateRender keeps the render stuck at its last
// known progress forever).
const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
};

export function getSupabaseClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  _client = createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: fetchWithTimeout },
  });
  return _client;
}

export function hasSupabase() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
