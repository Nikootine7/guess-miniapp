import { createClient } from "@supabase/supabase-js";

let client;

export function getSupabaseAdmin() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_SERVER_CONFIG_MISSING");
  }

  client = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}

export function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
