"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireProfile } from "@/lib/auth";
import { getCardInfo, searchByCode } from "@/lib/cards";
import { mapDbError } from "@/lib/db-errors";
import { PHOTO_BUCKET, STATUSES, TCGS_WITH_CARD_LOOKUP, UUID_PATTERN, photoPaths } from "@/lib/marketplace";
import { setsForCode } from "@/lib/set-codes";
import { createClient } from "@/lib/supabase/server";
import { listingSchema, removalReasonSchema, reportSchema, toFieldErrors, type FieldErrors, type ListingInput } from "@/lib/validation";

export type ListingFormState = { errors?: FieldErrors; values?: Record<string, string> };
export type SimpleState = { ok?: boolean; error?: string };

const FIELDS = [
  "title", "description", "tcg", "kind", "offer", "quantity", "price", "negotiable", "condition", "card_language",
  "grading", "city", "handover_event", "handover_pickup", "handover_shipping", "photos",
  "card_code", "card_no", "binder",
] as const;

function readForm(formData: FormData) {
  const values: Record<string, string> = {};
  for (const f of FIELDS) values[f] = String(formData.get(f) ?? "");
  values.events = formData.getAll("events").map(String).join(",");
  return values;
}

async function removePhotoFiles(ownerId: string, photoIds: string[]) {
  if (photoIds.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(photoIds.flatMap((id) => photoPaths(ownerId, id)));
  if (error) console.error("Fotos konnten nicht gelöscht werden", error.message);
}

/**
 * Set-Kürzel und Kartennummer speichern. Bei Pokémon schlägt der Server die Karte in der
 * Kartendatenbank nach (Name deutsch und englisch, Set, Nummer, Bild), damit die Suche sie findet.
 * Wird nichts gefunden, bleiben Kürzel bzw. Set-Name und Nummer als Text erhalten.
 */
async function saveCardDetails(listingId: string, tcg: string, card: ListingInput["card"]) {
  let p: Record<string, unknown> = {};
  if (card.code || card.number) {
    const known = card.code ? setsForCode(card.code) : [];
    p = { card_set: known[0]?.name ?? card.code, card_number: card.number };
    if (TCGS_WITH_CARD_LOOKUP.includes(tcg) && card.code && card.number) {
      try {
        const found = await searchByCode(card.code, card.number);
        const info = found.hits.length > 0 ? await getCardInfo(found.hits[0].id) : null;
        if (info) p = info;
        else if (found.sets[0]) p = { ...p, card_set: found.sets[0].name };
      } catch (e) {
        console.error("Kartendatenbank", e instanceof Error ? e.message : e);
      }
    }
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_listing_details", { p_id: listingId, p });
  if (error) console.error("set_listing_details", error.message);
}

/** Binder der Karte setzen (Feld "binder" im Formular; leer = ohne Binder) */
async function saveBinder(listingId: string, binder: string | null, formData: FormData) {
  if (formData.get("binder_field") !== "1") return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_listing_binder", { p_listing: listingId, p_binder: binder, p_pocket: null });
  if (error) console.error("set_listing_binder", error.message);
}

/** Termine, zu denen die Karte mitgebracht wird (Kästchen "events" im Formular) */
async function saveListingEvents(listingId: string, formData: FormData) {
  if (formData.get("events_field") !== "1") return;
  const ids = [...new Set(formData.getAll("events").map(String).filter((x) => UUID_PATTERN.test(x)))].slice(0, 10);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_listing_events", { p_listing: listingId, p_events: ids });
  if (error) console.error("set_listing_events", error.message);
}

export async function createListing(_prev: ListingFormState, formData: FormData): Promise<ListingFormState> {
  await requireProfile();
  const values = readForm(formData);
  const parsed = listingSchema.safeParse(values);
  if (!parsed.success) return { errors: toFieldErrors(parsed.error), values };

  const { card, binder, ...listing } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_listing", { p: listing });
  if (error || !data) return { errors: { _form: error ? mapDbError(error) : "generic" }, values };
  await saveCardDetails(data as string, listing.tcg, card);
  await saveBinder(data as string, binder, formData);
  await saveListingEvents(data as string, formData);

  revalidatePath("/", "layout");
  const locale = await getLocale();
  return redirect({ href: `/marktplatz/${data as string}`, locale });
}

export async function updateListing(_prev: ListingFormState, formData: FormData): Promise<ListingFormState> {
  const profile = await requireProfile();
  const id = String(formData.get("id") ?? "");
  const values = readForm(formData);
  if (!UUID_PATTERN.test(id)) return { errors: { _form: "generic" }, values };
  const parsed = listingSchema.safeParse(values);
  if (!parsed.success) return { errors: toFieldErrors(parsed.error), values };

  const { card, binder, ...listing } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_listing", { p_id: id, p: listing });
  if (error) return { errors: { _form: mapDbError(error) }, values };
  await saveCardDetails(id, listing.tcg, card);
  await saveBinder(id, binder, formData);

  await removePhotoFiles(profile.id, (data as string[] | null) ?? []);
  await saveListingEvents(id, formData);
  revalidatePath("/", "layout");
  const locale = await getLocale();
  return redirect({ href: `/marktplatz/${id}`, locale });
}

export async function setListingStatus(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  await requireProfile();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!UUID_PATTERN.test(id) || !STATUSES.includes(status as never) || status === "removed") return { error: "generic" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_listing_status", { p_id: id, p_status: status });
  if (error) return { error: mapDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Entfernen aus Sammlung bzw. Marktplatz, mit Grund (getauscht, verkauft, verschenkt, sonstiges) */
export async function deleteListing(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const profile = await requireProfile();
  const id = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(id)) return { error: "generic" };
  const reason = removalReasonSchema.safeParse(formData.get("reason") ?? "");
  if (!reason.success) return { error: "removal_reason_required" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_listing", { p_id: id, p_reason: reason.data });
  if (error) return { error: mapDbError(error) };

  await removePhotoFiles(profile.id, (data as string[] | null) ?? []);
  revalidatePath("/", "layout");
  const locale = await getLocale();
  return redirect({ href: "/profil", locale });
}

export async function reportContent(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  await requireProfile();
  const listingId = String(formData.get("listingId") ?? "") || null;
  const profileId = String(formData.get("profileId") ?? "") || null;
  if ((listingId && !UUID_PATTERN.test(listingId)) || (profileId && !UUID_PATTERN.test(profileId)) || !(listingId || profileId)) {
    return { error: "generic" };
  }
  const parsed = reportSchema.safeParse({ reason: formData.get("reason") ?? "", details: String(formData.get("details") ?? "") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "generic" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("report_content", {
    p_listing_id: listingId,
    p_profile_id: profileId,
    p_reason: parsed.data.reason,
    p_details: parsed.data.details,
  });
  if (error) return { error: mapDbError(error) };
  return { ok: true };
}
