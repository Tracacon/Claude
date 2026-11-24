import "server-only";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { UUID_PATTERN, type ListingDetail } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";

/** Ein Inserat mit Fotos und Anbieter. null, wenn es nicht existiert oder nicht sichtbar ist. */
export const getListing = cache(async (id: string): Promise<ListingDetail | null> => {
  if (!UUID_PATTERN.test(id) || !isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_listing", { p_id: id });
  if (error) {
    console.error("get_listing", error.message);
    return null;
  }
  return (data as ListingDetail | null) ?? null;
});
