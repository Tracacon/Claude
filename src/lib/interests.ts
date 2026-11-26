import "server-only";
import { createClient } from "@/lib/supabase/server";

export type InterestState = { mine: boolean; count: number };
export type InterestCard = { id: string; title: string; tcg: string; owner_id: string; cover_id: string | null };
export type InterestedPerson = {
  id: string;
  nickname: string;
  avatar_id: string | null;
  since: string;
  trade_count: number;
  cards: InterestCard[];
};

/** Habe ich Tauschinteresse, und wie viele haben es insgesamt? */
export async function getInterestState(listingId: string): Promise<InterestState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("listing_interest_state", { p_listing: listingId });
  if (error) console.error("listing_interest_state", error.message);
  return (data as InterestState | null) ?? { mine: false, count: 0 };
}

/** Nur für die Person, der das Inserat gehört: Interessenten mit ihren Tauschkarten. */
export async function getInterestedPeople(listingId: string): Promise<InterestedPerson[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("listing_interested_people", { p_listing: listingId });
  if (error) console.error("listing_interested_people", error.message);
  return (data ?? []) as InterestedPerson[];
}
