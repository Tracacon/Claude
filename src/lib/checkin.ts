import "server-only";
import { cookies } from "next/headers";
import { mapDbError } from "@/lib/db-errors";
import { CHECKIN_CODE_PATTERN } from "@/lib/event-format";
import { createClient } from "@/lib/supabase/server";

/** Merkt sich einen Check-in, der nach Anmeldung oder Registrierung fortgesetzt wird. */
export const PENDING_CHECKIN_COOKIE = "tc_checkin";

/** Eincheckt mit dem Code vom Aushang und gibt das Ziel (ohne Sprachpräfix) zurück. */
export async function runCheckin(code: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in", { p_code: code });
  if (error || !data) {
    const reason = error ? (/checkin_(invalid|not_open|closed)/.exec(error.message)?.[0] ?? mapDbError(error)) : "generic";
    return `/termine?checkin=${reason}`;
  }
  const r = data as { event_id: string; new: boolean; visits: number };
  return `/termine/${r.event_id}?eingecheckt=${r.new ? "neu" : "schon"}&besuche=${r.visits}`;
}

/**
 * Nach Anmeldung, Registrierung oder Begrüßung: offenen Check-in direkt ausführen.
 * Gibt das Ziel zurück und löscht die Notiz. Nur in Server-Aktionen aufrufen.
 */
export async function takePendingCheckin(): Promise<string | null> {
  const store = await cookies();
  const code = store.get(PENDING_CHECKIN_COOKIE)?.value ?? "";
  if (!code) return null;
  store.delete(PENDING_CHECKIN_COOKIE);
  return CHECKIN_CODE_PATTERN.test(code) ? runCheckin(code) : null;
}
