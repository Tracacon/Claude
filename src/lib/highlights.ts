import "server-only";
import { isSupabaseConfigured } from "@/lib/env";
import type { BinderColor } from "@/lib/binder-shared";
import { createClient } from "@/lib/supabase/server";

/** Highlight im Profil: ein Binder als runder Kreis */
export type Highlight = {
  id: string;
  binder_id: string;
  title: string;
  color: BinderColor;
  /** Eigenes Titelbild des Binders */
  cover_image: string | null;
  /** Sonst: Vorderseite der ersten Karte */
  card_photo: string | null;
  owner_id: string;
};

export async function getProfileHighlights(nickname: string): Promise<Highlight[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("profile_highlights", { p_nickname: nickname });
  if (error) console.error("profile_highlights", error.message);
  return (data ?? []) as Highlight[];
}
