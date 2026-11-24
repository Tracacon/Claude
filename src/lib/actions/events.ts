"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { syncEvents } from "@/lib/events";
import { UUID_PATTERN } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";

export type SyncState = { ok?: boolean; count?: number; error?: string };

/** Team: Termine sofort aus Odoo holen */
export async function syncEventsNow(): Promise<SyncState> {
  await requireRole("team", "admin");
  const r = await syncEvents();
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, count: r.count } : { error: r.error };
}

export type CodeState = { ok?: boolean; error?: string };

/** Team: neuen Check-in-Code erzeugen; der alte Aushang wird ungültig */
export async function renewCheckinCode(_prev: CodeState, formData: FormData): Promise<CodeState> {
  await requireRole("team", "admin");
  const id = String(formData.get("eventId") ?? "");
  if (!UUID_PATTERN.test(id)) return { error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("team_checkin_code", { p_event: id, p_renew: true });
  if (error) return { error: mapDbError(error) };
  revalidatePath(`/team/termine/${id}/aushang`);
  return { ok: true };
}
