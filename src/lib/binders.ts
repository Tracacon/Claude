import "server-only";
import { isSupabaseConfigured } from "@/lib/env";
import type { BinderColor, BinderEffect, BinderSummary, BinderVisibility } from "@/lib/binder-shared";
import { createClient } from "@/lib/supabase/server";

/** Binder eines Profils, die die angemeldete Person sehen darf */
export async function getProfileBinders(nickname: string): Promise<BinderSummary[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("profile_binders", { p_nickname: nickname });
  if (error) console.error("profile_binders", error.message);
  return ((data ?? []) as BinderSummary[]).map((b) => ({ ...b, card_count: Number(b.card_count) }));
}

export type MyBinder = { id: string; name: string; color: BinderColor; visibility: BinderVisibility; effect: BinderEffect; cover_image: string | null };

/** Eigene Binder für Auswahllisten */
export async function getMyBinders(): Promise<MyBinder[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_binders");
  if (error) console.error("my_binders", error.message);
  return (data ?? []) as MyBinder[];
}
