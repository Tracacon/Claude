type DbError = { code?: string; message?: string; details?: string | null };

// Fehlercodes, die unsere Datenbankfunktionen mit "raise exception '<code>'" melden.
// Sie heißen in messages/*.json → Errors genauso (mit Ausnahmen unten).
const KNOWN = [
  "last_admin",
  "forbidden",
  "not_authenticated",
  "profile_incomplete",
  "rate_limited",
  "too_many_photos",
  "listing_removed",
  "not_found",
  "already_reported",
  "cannot_report_own",
  "reason_required",
  "front_back_required",
  "cannot_message_self",
  "blocked",
  "photo_missing",
] as const;

const ALIASES: Record<string, string> = {
  age_not_confirmed: "age_required",
  terms_not_accepted: "terms_required",
};

/** Übersetzt Fehler aus Postgres/PostgREST in Fehlercodes der Oberfläche (messages/*.json → Errors). */
export function mapDbError(error: DbError): string {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  if (error.code === "23505" && text.includes("nickname")) return "nickname_taken";
  for (const [raw, mapped] of Object.entries(ALIASES)) if (text.includes(raw)) return mapped;
  for (const known of KNOWN) if (text.includes(known)) return known;
  if (error.code === "23514" && text.includes("nickname")) return "invalid_nickname";
  if (error.code === "23514" && text.includes("website")) return "invalid_website";
  if (error.code === "23514" && text.includes("listings_handover")) return "handover_required";
  if (error.code === "23514" && text.includes("listings_price")) return "invalid_price";
  if (error.code === "23514" && text.includes("listings_title")) return "title_short";
  if (error.code === "23514" && (text.includes("messages_body") || text.includes("messages_content"))) return "message_invalid";
  if (error.code === "23514") return "too_long";
  if (error.code === "42501") return "forbidden";
  console.error("Unerwarteter Datenbankfehler", error.code, error.message);
  return "generic";
}
