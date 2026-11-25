"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireProfile } from "@/lib/auth";
import { getCardInfo } from "@/lib/cards";
import { mapDbError } from "@/lib/db-errors";
import { PHOTO_BUCKET, STATUSES, UUID_PATTERN, photoPaths } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";
import { listingSchema, reportSchema, toFieldErrors, type FieldErrors, type ListingInput } from "@/lib/validation";

export type ListingFormState = { errors?: FieldErrors; values?: Record<string, string> };
export type SimpleState = { ok?: boolean; error?: string };

const FIELDS = [
  "title", "description", "tcg", "kind", "offer", "price", "negotiable", "condition", "card_language",
  "grading", "city", "handover_event", "handover_pickup", "handover_shipping", "photos",
  "card_id", "card_json", "variant", "grading_company", "grading_grade", "sealed_type",
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
 * Kartendetails speichern. Die Daten der Karte (Name, Set, Nummer, Seltenheit, Bild) kommen direkt
 * aus der Kartendatenbank, nicht aus dem Formular. Ist die Datenbank nicht erreichbar, bleibt die
 * bisher gespeicherte Karte erhalten.
 */
async function saveListingDetails(listingId: string, details: ListingInput["details"], keepCard: Record<string, unknown> | null) {
  let card: Record<string, unknown> = {};
  if (details.card_id) {
    const info = await getCardInfo(details.card_id).catch((e) => {
      console.error("Kartendatenbank", e instanceof Error ? e.message : e);
      return null;
    });
    if (info) card = info;
    else if (keepCard && keepCard.card_ref === `tcgdex:${details.card_id}`) card = keepCard;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_listing_details", {
    p_id: listingId,
    p: { ...card, variant: details.variant, grading_company: details.grading_company, grading_grade: details.grading_grade, sealed_type: details.sealed_type },
  });
  if (error) console.error("set_listing_details", error.message);
}

/** Bisher gespeicherte Karte eines Inserats (für den Fall, dass die Kartendatenbank nicht antwortet) */
async function currentCard(listingId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listings")
    .select("card_ref, card_name, card_name_en, card_set, card_number, card_rarity, card_image")
    .eq("id", listingId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
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

  const { details, ...listing } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_listing", { p: listing });
  if (error || !data) return { errors: { _form: error ? mapDbError(error) : "generic" }, values };
  await saveListingDetails(data as string, details, null);
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

  const { details, ...listing } = parsed.data;
  const keepCard = details.card_id ? await currentCard(id) : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_listing", { p_id: id, p: listing });
  if (error) return { errors: { _form: mapDbError(error) }, values };
  await saveListingDetails(id, details, keepCard);

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

export async function deleteListing(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const profile = await requireProfile();
  const id = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(id)) return { error: "generic" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_listing", { p_id: id });
  if (error) return { error: mapDbError(error) };

  await removePhotoFiles(profile.id, (data as string[] | null) ?? []);
  revalidatePath("/", "layout");
  const locale = await getLocale();
  return redirect({ href: "/meine-inserate", locale });
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
