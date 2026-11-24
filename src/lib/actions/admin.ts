"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { roleSchema } from "@/lib/validation";

export type RoleState = { ok?: boolean; error?: string; userId?: string };

export async function changeRole(_prev: RoleState, formData: FormData): Promise<RoleState> {
  await requireRole("admin");
  const parsed = roleSchema.safeParse({ userId: formData.get("userId"), role: formData.get("role") });
  if (!parsed.success) return { error: "generic" };

  // Die Datenbank prüft selbst noch einmal, ob der Aufrufer Admin ist.
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_user_role", { p_user_id: parsed.data.userId, p_role: parsed.data.role });
  if (error) return { error: mapDbError(error), userId: parsed.data.userId };

  revalidatePath("/", "layout");
  return { ok: true, userId: parsed.data.userId };
}
