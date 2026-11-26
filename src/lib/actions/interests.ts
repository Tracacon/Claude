"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { UUID_PATTERN } from "@/lib/marketplace";
import { pushNotify } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

export type InterestActionState = { ok?: boolean; error?: string; mine?: boolean };

/** Tauschinteresse an einem Inserat an- oder abschalten. */
export async function toggleInterest(_prev: InterestActionState, formData: FormData): Promise<InterestActionState> {
  await requireProfile();
  const listingId = String(formData.get("listingId") ?? "");
  const ownerId = String(formData.get("ownerId") ?? "");
  if (!UUID_PATTERN.test(listingId)) return { error: "generic" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_listing_interest", { p_listing: listingId });
  if (error) return { error: mapDbError(error) };
  const mine = Boolean(data);
  // Die Mitteilung geht nur an die Person, der das Inserat gehört (dort liegt die neue Benachrichtigung)
  if (mine && UUID_PATTERN.test(ownerId)) pushNotify(ownerId);
  revalidatePath(`/marktplatz/${listingId}`);
  return { ok: true, mine };
}
