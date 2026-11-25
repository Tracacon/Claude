import "server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseEnv } from "@/lib/env";

/** Geheimer Server-Schlüssel von Supabase (Cloudflare-Geheimnis SUPABASE_SECRET_KEY) */
export function serviceKey() {
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

export function hasServiceKey() {
  return isSupabaseConfigured() && Boolean(serviceKey());
}

/** Zugriff mit vollen Rechten – nur für Abgleiche auf dem Server, nie im Browser */
export function serviceClient() {
  const { url } = supabaseEnv();
  return createServiceClient(url, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}
