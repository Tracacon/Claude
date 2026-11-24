import "server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { cache } from "react";
import { isSupabaseConfigured, supabaseEnv } from "@/lib/env";
import { UUID_PATTERN, type ListingSummary } from "@/lib/marketplace";
import { fetchOdooEvents, odooConfig, OdooError } from "@/lib/odoo";
import { createClient } from "@/lib/supabase/server";

export type EventSummary = {
  id: string;
  name: string;
  subtitle: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string | null;
  venue: string | null;
  city: string | null;
  ticket_url: string | null;
  listing_count: number;
  checkin_count: number;
  checked_in: boolean;
};

export type EventDetail = EventSummary & {
  address: string | null;
  website_url: string | null;
  published: boolean;
  is_past: boolean;
  checkin_open: boolean;
};

/** Wie oft die App höchstens bei Odoo nachfragt */
const FRESH_MINUTES = 15;
/** Wie weit zurück Termine abgeglichen werden (für Abzeichen und Verlauf) */
const SYNC_DAYS_BACK = 400;

function serviceKey() {
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

export function isEventSyncConfigured() {
  return isSupabaseConfigured() && Boolean(serviceKey()) && odooConfig().configured;
}

function serviceClient() {
  const { url } = supabaseEnv();
  return createServiceClient(url, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

export type SyncResult = { ok: true; count: number } | { ok: false; error: string };

/** Termine aus Odoo holen und speichern. */
export async function syncEvents(): Promise<SyncResult> {
  if (!isEventSyncConfigured()) return { ok: false, error: "sync_not_configured" };
  const db = serviceClient();
  const since = new Date(Date.now() - SYNC_DAYS_BACK * 86400_000);
  try {
    const events = await fetchOdooEvents(since);
    const { data, error } = await db.rpc("sync_events", { p: { since: since.toISOString(), events } });
    if (error) throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
    return { ok: true, count: (data as number) ?? events.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Termine aus Odoo", message);
    await db.rpc("sync_events_failed", { p_error: message });
    const code = e instanceof OdooError ? `odoo_${e.code}` : "sync_failed";
    return { ok: false, error: code };
  }
}

export type SyncState = { synced_at: string | null; error: string | null };

export const getSyncState = cache(async (): Promise<SyncState> => {
  if (!isSupabaseConfigured()) return { synced_at: null, error: null };
  const supabase = await createClient();
  const { data } = await supabase.rpc("event_sync_state");
  return (data as SyncState | null) ?? { synced_at: null, error: null };
});

/**
 * Sorgt dafür, dass die Termine aktuell sind. Beim allerersten Mal wird gewartet,
 * danach läuft der Abgleich nach dem Ausliefern der Seite im Hintergrund.
 */
export async function ensureEventsFresh() {
  if (!isEventSyncConfigured()) return;
  const state = await getSyncState();
  if (!state.synced_at) {
    await syncEvents();
    return;
  }
  if (Date.now() - new Date(state.synced_at).getTime() > FRESH_MINUTES * 60_000) {
    after(async () => {
      await syncEvents();
    });
  }
}

export const getEvents = cache(async (past = false, limit = 30): Promise<EventSummary[]> => {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_events", { p_past: past, p_limit: limit });
  if (error) {
    console.error("list_events", error.message);
    return [];
  }
  return (data as EventSummary[]).map((e) => ({ ...e, listing_count: Number(e.listing_count), checkin_count: Number(e.checkin_count) }));
});

export const getEvent = cache(async (id: string): Promise<EventDetail | null> => {
  if (!UUID_PATTERN.test(id) || !isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_event", { p_id: id });
  if (error) {
    console.error("get_event", error.message);
    return null;
  }
  return (data as EventDetail | null) ?? null;
});

export async function getEventListings(id: string, page: number, pageSize: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("event_listings", { p_event: id, p_limit: pageSize, p_offset: (page - 1) * pageSize });
  if (error) {
    console.error("event_listings", error.message);
    return { items: [] as ListingSummary[], total: 0 };
  }
  const items = (data ?? []) as (ListingSummary & { total_count: number })[];
  return { items, total: items.length ? Number(items[0].total_count) : 0 };
}

export type ListingEventRef = { id: string; name: string; starts_at: string; ends_at: string; city: string | null };

export async function getListingEvents(listingId: string): Promise<ListingEventRef[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("listing_event_list", { p_listing: listingId });
  if (error) {
    console.error("listing_event_list", error.message);
    return [];
  }
  return (data ?? []) as ListingEventRef[];
}
