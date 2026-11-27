"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { UUID_PATTERN } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";

export type HighlightState = { ok?: boolean; error?: string };

/** Binder als Highlight zeigen bzw. Titel ändern */
export async function saveHighlight(_prev: HighlightState, formData: FormData): Promise<HighlightState> {
  await requireProfile();
  const binder = String(formData.get("binderId") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 20);
  if (!UUID_PATTERN.test(binder)) return { error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_highlight", { p_binder: binder, p_title: title });
  if (error) return { error: mapDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Highlight entfernen (der Binder bleibt) */
export async function removeHighlight(_prev: HighlightState, formData: FormData): Promise<HighlightState> {
  const me = await requireProfile();
  const binder = String(formData.get("binderId") ?? "");
  if (!UUID_PATTERN.test(binder)) return { error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.from("profile_highlights").delete().eq("binder_id", binder).eq("owner_id", me.id);
  if (error) return { error: mapDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}
