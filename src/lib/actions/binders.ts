"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { requireProfile } from "@/lib/auth";
import { BINDER_COLORS, BINDER_EFFECTS, BINDER_VISIBILITIES } from "@/lib/binder-shared";
import { mapDbError } from "@/lib/db-errors";
import { PHOTO_BUCKET, photoPaths, UUID_PATTERN } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";

export type BinderFormState = { error?: string; values?: Record<string, string> };

const binderSchema = z.object({
  name: z.string().trim().min(1, { message: "binder_name_required" }).max(40, { message: "too_long" }),
  color: z.enum(BINDER_COLORS),
  visibility: z.enum(BINDER_VISIBILITIES),
  effect: z.enum(BINDER_EFFECTS),
});

/** Binder anlegen oder ändern */
export async function saveBinder(_prev: BinderFormState, formData: FormData): Promise<BinderFormState> {
  const me = await requireProfile();
  const id = String(formData.get("id") ?? "");
  const values = {
    name: String(formData.get("name") ?? ""),
    color: String(formData.get("color") ?? "night"),
    visibility: String(formData.get("visibility") ?? "public"),
    effect: String(formData.get("effect") ?? "none"),
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
    p_effect: parsed.data.effect,
  });
  if (error || !data) return { error: error ? mapDbError(error) : "generic", values };

  // Titelbild setzen oder entfernen; das alte Bild löschen
  if (formData.get("cover_field") === "1") {
    const raw = String(formData.get("cover_image") ?? "");
    const image = UUID_PATTERN.test(raw) ? raw : null;
    const { data: old, error: e2 } = await supabase.rpc("set_binder_cover", { p_binder: data as string, p_image: image });
    if (e2) console.error("set_binder_cover", e2.message);
    else if (old) {
      const { error: e3 } = await supabase.storage.from(PHOTO_BUCKET).remove(photoPaths(me.id, old as string));
      if (e3) console.error("altes Titelbild", e3.message);
    }
  }
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

/**
 * Vorhandene Karten in einen Binder legen (aus "Ohne Binder" oder aus einem anderen Binder).
 * Mit Fach: genau dorthin (nur eine Karte). Ohne Fach: in die nächsten freien Fächer.
 */
export async function addToBinder(binderId: string, listingIds: string[], pocket: number | null): Promise<{ error?: string }> {
  await requireProfile();
  const ids = [...new Set(listingIds)].filter((x) => UUID_PATTERN.test(x)).slice(0, 100);
  if (!UUID_PATTERN.test(binderId) || ids.length === 0) return { error: "generic" };
  if (pocket !== null && (ids.length !== 1 || !Number.isInteger(pocket) || pocket < 0 || pocket > 8999)) return { error: "generic" };
  const supabase = await createClient();
  for (const id of ids) {
    const { error } = await supabase.rpc("set_listing_binder", { p_listing: id, p_binder: binderId, p_pocket: pocket });
    if (error) return { error: mapDbError(error) };
  }
  revalidatePath("/", "layout");
  return {};
}
