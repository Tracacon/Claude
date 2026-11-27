import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { NextRequest } from "next/server";
import { checkRateLimit, tooManyRequests, type Limiters } from "@/lib/rate-limit";
import { isSupabaseConfigured, supabaseEnv } from "@/lib/env";
import { routing } from "@/i18n/routing";

const intl = createIntlMiddleware(routing);

/**
 * Läuft vor jeder Seite:
 * 1. Sprache erkennen und Pfad umschreiben (next-intl)
 * 2. Supabase-Sitzung auffrischen, damit Server-Komponenten eine gültige Anmeldung sehen
 *
 * 3. Bremse gegen zu viele Anfragen (siehe rate-limit.ts)
 *
 * Wer was darf, wird hier nicht entschieden. Die echte Prüfung passiert auf den Seiten
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
  const { data } = await supabase.auth.getClaims();

  const allowed = await checkRateLimit(cloudflareEnv(), {
    method: request.method,
    ip: request.headers.get("cf-connecting-ip"),
    userId: typeof data?.claims?.sub === "string" ? data.claims.sub : null,
  });
  if (!allowed) return tooManyRequests(request.nextUrl.pathname.startsWith("/en") ? "en" : "de");

  return response;
}

function cloudflareEnv(): Limiters {
  try {
    return getCloudflareContext().env as unknown as Limiters;
  } catch {
    return {};
  }
}

export const config = {
  // Alles außer Next-Interna, statischen Dateien und Bildern
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
