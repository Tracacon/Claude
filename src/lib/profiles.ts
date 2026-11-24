import "server-only";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import type { ListingSummary } from "@/lib/marketplace";
import type { FollowListItem, PublicProfile } from "@/lib/social";
import { createClient } from "@/lib/supabase/server";
import { NICKNAME_PATTERN } from "@/lib/validation";

/** Profilansicht über get_profile (prüft Privatsphäre in der Datenbank). */
export const getPublicProfile = cache(async (nickname: string): Promise<PublicProfile | null> => {
  if (!NICKNAME_PATTERN.test(nickname) || !isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_profile", { p_nickname: nickname });
  if (error) console.error("get_profile", error.message);
  return (data as PublicProfile | null) ?? null;
});

export async function getProfileListings(nickname: string): Promise<ListingSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("profile_listings", { p_nickname: nickname, p_limit: 60, p_offset: 0 });
  return (data ?? []) as ListingSummary[];
}

export async function getFollowList(nickname: string, kind: "followers" | "following"): Promise<FollowListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_follows", { p_nickname: nickname, p_kind: kind });
  return (data ?? []) as FollowListItem[];
}
