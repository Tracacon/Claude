type DbError = { code?: string; message?: string; details?: string | null };

/** Übersetzt Fehler aus Postgres/PostgREST in Fehlercodes der Oberfläche (messages/*.json → Errors). */
export function mapDbError(error: DbError): string {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  if (error.code === "23505" && text.includes("nickname")) return "nickname_taken";
  if (error.code === "23514" && text.includes("nickname")) return "invalid_nickname";
  if (error.code === "23514" && text.includes("website")) return "invalid_website";
  if (error.code === "23514") return "too_long";
  for (const known of ["last_admin", "forbidden", "not_authenticated", "age_not_confirmed", "terms_not_accepted"]) {
    if (text.includes(known)) {
      if (known === "age_not_confirmed") return "age_required";
      if (known === "terms_not_accepted") return "terms_required";
      return known;
    }
  }
  if (error.code === "42501") return "forbidden";
  console.error("Unerwarteter Datenbankfehler", error.code, error.message);
  return "generic";
}
