import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "member" | "team" | "admin";

export type Profile = {
  id: string;
  nickname: string | null;
  city: string | null;
  bio: string | null;
  website: string | null;
  instagram: string | null;
  locale: "de" | "en";
  role: AppRole;
  avatar_id: string | null;
  profile_visibility: "public" | "followers";
  follow_approval: boolean;
  /** fehlen, solange die Datenbank-Erweiterung noch nicht eingespielt ist */
  show_online?: boolean;
  show_signup?: boolean;
  age_confirmed_at: string | null;
  terms_accepted_at: string | null;
  created_at: string;
};

export type SessionUser = { id: string; email: string | null };

/**
 * Datenzugriffsschicht: alle Seiten fragen die Anmeldung nur hier ab.
 * getClaims prüft die Signatur des Tokens; einem bloßen Cookie wird nicht vertraut.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Anmeldung gilt pro Anfrage: nie beim Bauen vorab rendern.
  await connection();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? null };
});

export const getMyProfile = cache(async (): Promise<Profile | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  return data ?? null;
});

async function go(href: string): Promise<never> {
  const locale = await getLocale();
  return redirect({ href, locale });
}

/** Angemeldet, Begrüßung darf noch offen sein. */
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) return go("/anmelden");
  return user;
}

/** Angemeldet und Begrüßung abgeschlossen. */
export async function requireProfile() {
  await requireUser();
  const profile = await getMyProfile();
  if (!profile) return go("/anmelden");
  if (!profile.nickname) return go("/willkommen");
  return profile;
}

export async function requireRole(...roles: AppRole[]) {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) return go("/");
  return profile;
}
