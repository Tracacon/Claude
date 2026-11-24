import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseEnv } from "@/lib/env";
import { routing } from "@/i18n/routing";

const intl = createIntlMiddleware(routing);

/**
 * Läuft vor jeder Seite:
 * 1. Sprache erkennen und Pfad umschreiben (next-intl)
 * 2. Supabase-Sitzung auffrischen, damit Server-Komponenten eine gültige Anmeldung sehen
 *
 * Hier wird nichts erlaubt oder verboten. Die echte Prüfung passiert auf den Seiten
 * und in der Datenbank (Row Level Security).
 */
export async function proxy(request: NextRequest) {
  const response = intl(request);

  if (!isSupabaseConfigured()) return response;

  const { url, key } = supabaseEnv();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims prüft das Token und erneuert es bei Bedarf.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  // Alles außer Next-Interna, statischen Dateien und Bildern
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
