"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { requireProfile } from "@/lib/auth";
import { BINDER_COLORS, BINDER_VISIBILITIES } from "@/lib/binder-shared";
import { mapDbError } from "@/lib/db-errors";
import { UUID_PATTERN } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";

export type BinderFormState = { error?: string; values?: Record<string, string> };

const binderSchema = z.object({
  name: z.string().trim().min(1, { message: "binder_name_required" }).max(40, { message: "too_long" }),
  color: z.enum(BINDER_COLORS),
  visibility: z.enum(BINDER_VISIBILITIES),
});

/** Binder anlegen oder ändern */
export async function saveBinder(_prev: BinderFormState, formData: FormData): Promise<BinderFormState> {
  const me = await requireProfile();
  const id = String(formData.get("id") ?? "");
  const values = {
    name: String(formData.get("name") ?? ""),
    color: String(formData.get("color") ?? "night"),
    visibility: String(formData.get("visibility") ?? "public"),
  };
  if (id && !UUID_PATTERN.test(id)) return { error: "generic", values };
  const parsed = binderSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "generic", values };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_binder", {
    p_id: id || null,
    p_name: parsed.data.name,
    p_color: parsed.data.color,
    p_visibility: parsed.data.visibility,
  });
  if (error || !data) return { error: error ? mapDbError(error) : "generic", values };
  revalidatePath("/", "layout");
  const locale = await getLocale();
  return redirect({ href: `/u/${me.nickname}/binder/${data as string}`, locale });
}

/** Binder löschen. Die Karten bleiben in der Sammlung (Ohne Binder). */
export async function deleteBinder(_prev: BinderFormState, formData: FormData): Promise<BinderFormState> {
  const me = await requireProfile();
  const id = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(id)) return { error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.from("binders").delete().eq("id", id).eq("owner_id", me.id);
  if (error) return { error: mapDbError(error) };
  revalidatePath("/", "layout");
  const locale = await getLocale();
  return redirect({ href: "/profil", locale });
}

/** Karte im Binder in ein anderes Fach legen (belegtes Fach: beide tauschen) */
export async function moveToPocket(listingId: string, pocket: number): Promise<{ error?: string }> {
  await requireProfile();
  if (!UUID_PATTERN.test(listingId) || !Number.isInteger(pocket) || pocket < 0 || pocket > 8999) return { error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_listing_pocket", { p_listing: listingId, p_pocket: pocket });
  if (error) return { error: mapDbError(error) };
  revalidatePath("/", "layout");
  return {};
}
