import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "@/lib/env";

/** Supabase-Client für Server-Komponenten und Server-Aktionen, mit der Sitzung des Nutzers. */
export async function createClient() {
  const { url, key } = supabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // In Server-Komponenten dürfen keine Cookies gesetzt werden.
          // Die Sitzung wird dann im Proxy aufgefrischt.
        }
      },
    },
  });
}
