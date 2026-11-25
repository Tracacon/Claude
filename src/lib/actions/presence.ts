"use server";

import { revalidatePath } from "next/cache";
import { getMyProfile, requireProfile } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { touchPresence } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

/** Wird regelmäßig aufgerufen, solange die App offen ist. */
export async function pingPresence() {
  const profile = await getMyProfile();
  if (profile?.nickname) await touchPresence();
}

export type PresenceState = { ok?: boolean; error?: string };

/** Einstellungen: Online-Status zeigen, "Neu dabei" zeigen */
export async function updatePresenceSettings(_prev: PresenceState, formData: FormData): Promise<PresenceState> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_presence_settings", {
    p_show_online: formData.get("show_online") === "on",
    p_show_signup: formData.get("show_signup") === "on",
  });
  if (error) return { error: mapDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}
