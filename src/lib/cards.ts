import "server-only";
import type { CardHit, CardInfo } from "@/lib/marketplace";

/**
 * Pokémon-Kartensuche über TCGdex (https://tcgdex.dev): kostenlos, ohne Zugangsschlüssel,
 * mit deutschen und englischen Kartennamen. Nur lesend.
 *
 * Gesucht wird gleichzeitig auf Deutsch und Englisch, damit "Glurak" und "Charizard" dieselbe Karte finden.
 * Die Nummer von der Karte ("199/165") grenzt die Suche ein und findet die Karte auch ganz ohne Namen.
 */

const API = process.env.TCGDEX_API_URL ?? "https://api.tcgdex.net/v2";
const TIMEOUT = 8_000;
const MAX_HITS = 30;
/** Set-Liste so lange im Speicher behalten */
const SETS_TTL = 12 * 60 * 60_000;

type Lang = "de" | "en";
type CardBrief = { id: string; localId: string; name: string; image?: string };
type SetBrief = { id: string; name: string; cardCount?: { official?: number; total?: number } };
type SetInfo = { name: string; official: number | null; order: number };
type CardFull = CardBrief & {
  rarity?: string;
  set?: { id: string; name: string; cardCount?: { official?: number } };
};

const setsCache = new Map<Lang, { at: number; sets: Map<string, SetInfo> }>();

async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API}${path}`, {
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Kartendatenbank: Antwort ${res.status}`);
  return (await res.json()) as T;
}

/** Alle Sets mit Name, offizieller Kartenzahl und Reihenfolge (neuere Sets haben eine höhere Zahl) */
async function getSets(lang: Lang): Promise<Map<string, SetInfo>> {
  const cached = setsCache.get(lang);
  if (cached && Date.now() - cached.at < SETS_TTL) return cached.sets;
  const list = (await getJson<SetBrief[]>(`/${lang}/sets`)) ?? [];
  const sets = new Map<string, SetInfo>();
  list.forEach((s, i) => sets.set(s.id, { name: s.name, official: s.cardCount?.official ?? null, order: i }));
  setsCache.set(lang, { at: Date.now(), sets });
  return sets;
}

/** Set-Kennung aus der Karten-Kennung: "sv03.5-199" → "sv03.5" */
function setIdOf(card: CardBrief) {
  return card.id.endsWith(`-${card.localId}`) ? card.id.slice(0, -(card.localId.length + 1)) : card.id.slice(0, card.id.lastIndexOf("-"));
}

/** Nummer, wie sie auf der Karte steht: "199/165" (bei Promos ohne Gesamtzahl nur "SWSH020") */
function printedNumber(localId: string, official: number | null | undefined) {
  return /^\d+$/.test(localId) && official ? `${localId}/${official}` : localId;
}

export function cardImage(base: string | undefined, size: "low" | "high" = "low") {
  return base && base.startsWith("https://assets.tcgdex.net/") ? `${base}/${size}.webp` : null;
}

/** Zerlegt die Eingabe in Name und Kartennummer: "Glurak ex 199/165" → { name: "Glurak ex", number: "199", total: 165 } */
export function parseCardQuery(input: string) {
  let name = input.trim().replace(/\s+/g, " ").slice(0, 60);
  let number: string | null = null;
  let total: number | null = null;
  const m = name.match(/(?:^|\s)#?([A-Za-z]{0,6}\d{1,4}[a-z]?)(?:\s*\/\s*(\d{1,4}))?$/);
  if (m && /\d/.test(m[1])) {
    number = m[1];
    total = m[2] ? Number(m[2]) : null;
    name = name.slice(0, m.index).trim();
  }
  return { name, number, total };
}

/** Schreibweisen einer Nummer in der Datenbank: "5" kann als "5", "05" oder "005" geführt sein */
function numberVariants(n: string) {
  if (!/^\d+$/.test(n)) return [n, n.toUpperCase()];
  const plain = String(Number(n));
  return [...new Set([plain, plain.padStart(2, "0"), plain.padStart(3, "0"), n])];
}

function filterQuery(name: string, number: string | null) {
  const q = new URLSearchParams();
  if (name) q.set("name", name);
  if (number) q.set("localId", `eq:${numberVariants(number).join("|")}`);
  return q.toString();
}

/** Kartensuche für die Vorschläge beim Tippen */
export async function searchCards(input: string): Promise<CardHit[]> {
  const { name, number, total } = parseCardQuery(input);
  // Ohne Namen nur mit vollständiger Nummer ("199/165"), sonst gäbe es zu viele Treffer
  if (name.length < 2 && !(number && total)) return [];

  const query = filterQuery(name, number);
  const [de, en, setsDe, setsEn] = await Promise.all([
    getJson<CardBrief[]>(`/de/cards?${query}`).catch(() => null),
    getJson<CardBrief[]>(`/en/cards?${query}`).catch(() => null),
    getSets("de").catch(() => new Map<string, SetInfo>()),
    getSets("en").catch(() => new Map<string, SetInfo>()),
  ]);
  if (!de && !en) throw new Error("Kartendatenbank nicht erreichbar");

  const enById = new Map((en ?? []).map((c) => [c.id, c]));
  const merged = new Map<string, { de?: CardBrief; en?: CardBrief }>();
  for (const c of de ?? []) merged.set(c.id, { de: c, en: enById.get(c.id) });
  for (const c of en ?? []) if (!merged.has(c.id)) merged.set(c.id, { en: c });

  const hits: (CardHit & { order: number })[] = [];
  for (const [id, { de: d, en: e }] of merged) {
    const card = (d ?? e)!;
    const setId = setIdOf(card);
    const set = setsDe.get(setId) ?? setsEn.get(setId);
    if (total && set?.official && set.official !== total) continue;
    hits.push({
      id,
      name: card.name,
      name_en: e && d && e.name !== d.name ? e.name : null,
      set: set?.name ?? setId,
      number: printedNumber(card.localId, set?.official),
      image: cardImage(d?.image ?? e?.image),
      order: setsEn.get(setId)?.order ?? set?.order ?? -1,
    });
  }
  // Neueste Sets zuerst
  hits.sort((a, b) => b.order - a.order);
  return hits.slice(0, MAX_HITS).map(({ order: _order, ...h }) => {
    void _order;
    return h;
  });
}

export const CARD_ID_PATTERN = /^[A-Za-z0-9._-]{1,60}$/;

/** Daten einer Karte zum Speichern im Inserat. Liest direkt aus der Kartendatenbank, nicht aus dem Formular. */
export async function getCardInfo(id: string): Promise<CardInfo | null> {
  if (!CARD_ID_PATTERN.test(id)) return null;
  const path = `/cards/${encodeURIComponent(id)}`;
  const [de, en] = await Promise.all([
    getJson<CardFull>(`/de${path}`).catch(() => null),
    getJson<CardFull>(`/en${path}`).catch(() => null),
  ]);
  const card = de ?? en;
  if (!card || !card.set) return null;
  return {
    card_ref: `tcgdex:${card.id}`,
    card_name: card.name.slice(0, 100),
    card_name_en: en && en.name !== card.name ? en.name.slice(0, 100) : null,
    card_set: card.set.name.slice(0, 100),
    card_number: printedNumber(card.localId, card.set.cardCount?.official).slice(0, 20),
    card_rarity: card.rarity && card.rarity !== "None" ? card.rarity.slice(0, 60) : null,
    card_image: cardImage(card.image),
  };
}
