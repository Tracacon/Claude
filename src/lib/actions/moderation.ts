"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { UUID_PATTERN } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";
import { moderationReasonSchema } from "@/lib/validation";

export type ModerationState = { ok?: boolean; error?: string };

/** Inserat entfernen (mit Begründung, die der Eigentümer sieht) oder wieder freigeben. */
export async function moderateListing(_prev: ModerationState, formData: FormData): Promise<ModerationState> {
  await requireRole("team", "admin");
  const id = String(formData.get("listingId") ?? "");
  const action = String(formData.get("action") ?? "");
  if (!UUID_PATTERN.test(id) || !["remove", "restore"].includes(action)) return { error: "generic" };

  let reason: string | null = null;
  if (action === "remove") {
    const parsed = moderationReasonSchema.safeParse(String(formData.get("reason") ?? ""));
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "reason_required" };
    reason = parsed.data;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_listing", { p_id: id, p_action: action, p_reason: reason });
  if (error) return { error: mapDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Meldung abschließen, ohne den Inhalt zu entfernen. */
export async function closeReport(_prev: ModerationState, formData: FormData): Promise<ModerationState> {
  await requireRole("team", "admin");
  const id = String(formData.get("reportId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!UUID_PATTERN.test(id) || !["resolved", "dismissed"].includes(status)) return { error: "generic" };
  const note = String(formData.get("note") ?? "").slice(0, 1000);

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_report", { p_id: id, p_status: status, p_note: note || null });
  if (error) return { error: mapDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}
