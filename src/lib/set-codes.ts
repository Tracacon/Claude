import raw from "./set-codes.json";

/**
 * Offizielle Set-Kürzel der Pokémon-Sets (z. B. "MEW" = 151), mit deutschem Set-Namen.
 * Stand: November 2026, aus der Kartendatenbank TCGdex. Neue Sets, die hier noch fehlen,
 * findet der Server trotzdem: Er fragt unbekannte Kürzel direkt bei der Kartendatenbank nach.
 */
export type SetCode = { id: string; code: string; name: string; released: string; official: number | null };

export const SET_CODES: SetCode[] = (raw as [string, string, string, string, number | null][]).map(
  ([id, code, name, released, official]) => ({ id, code, name, released, official }),
);

export function normalizeSetCode(input: string) {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

/** Sets mit genau diesem Kürzel (meist eins; "30C" gehört zu zwei Sets) */
export function setsForCode(code: string) {
  const c = normalizeSetCode(code);
  return SET_CODES.filter((s) => s.code === c);
}

/** Vorschläge für das Kürzel-Feld: passende Kürzel oder Set-Namen, neueste zuerst */
export function suggestSetCodes(input: string, limit = 6) {
  const q = input.trim().toLowerCase();
  if (!q) return [];
  const starts = (s: SetCode) => s.code.toLowerCase().startsWith(q);
  const inName = (s: SetCode) => s.name.toLowerCase().includes(q);
  return [...SET_CODES]
    .reverse()
    .filter((s) => starts(s) || inName(s))
    .sort((a, b) => Number(starts(b)) - Number(starts(a)))
    .slice(0, limit);
}
