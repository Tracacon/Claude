// Gemeinsame Werte und Hilfen für den Marktplatz (Server und Browser).

export const TCGS = ["pokemon", "one_piece", "yugioh", "magic", "sports", "riftbound", "dragon_ball", "lorcana", "other"] as const;
export const KINDS = ["single", "slab", "sealed", "lot", "accessory", "other"] as const;
/** Arten, bei denen Vorder- und Rückseite als Foto Pflicht sind. */
export const KINDS_NEEDING_BOTH_SIDES: readonly string[] = ["single", "slab"];
export const OFFERS = ["sell", "trade", "sell_or_trade"] as const;
export const CONDITIONS = ["mint", "near_mint", "excellent", "good", "light_played", "played", "poor"] as const;
export const CARD_LANGUAGES = ["de", "en", "ja", "fr", "it", "es", "pt", "ko", "zh", "other"] as const;
export const STATUSES = ["active", "reserved", "done", "removed"] as const;
export const REPORT_REASONS = ["scam", "counterfeit", "offensive", "spam", "wrong_info", "other"] as const;
export const SORTS = ["newest", "price_asc", "price_desc"] as const;

export type Tcg = (typeof TCGS)[number];
export type Kind = (typeof KINDS)[number];
export type Offer = (typeof OFFERS)[number];
export type Condition = (typeof CONDITIONS)[number];
export type ListingStatus = (typeof STATUSES)[number];
export type ReportReason = (typeof REPORT_REASONS)[number];

export const MAX_PHOTOS = 6;
export const PAGE_SIZE = 24;
export const PHOTO_BUCKET = "listing-photos";

/** Öffentliche Adresse eines Fotos in Supabase Storage. */
export function photoUrl(ownerId: string, photoId: string, size: "full" | "thumb" = "full") {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/${PHOTO_BUCKET}/${ownerId}/${photoId}${size === "thumb" ? "_t" : ""}.jpg`;
}

export function photoPaths(ownerId: string, photoId: string) {
  return [`${ownerId}/${photoId}.jpg`, `${ownerId}/${photoId}_t.jpg`];
}

/** "12,50" / "12.5" / "1.250,00" → 1250 Cent. Leer → null. Ungültig → NaN. */
export function parseEuroToCents(input: string): number | null {
  const s = input.trim().replace(/\s|€/g, "");
  if (s === "") return null;
  let normalized = s;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) normalized = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(,\d{1,2})?$/.test(s)) normalized = s.replace(",", ".");
  else if (!/^\d+(\.\d{1,2})?$/.test(s)) return Number.NaN;
  return Math.round(Number.parseFloat(normalized) * 100);
}

export function centsToInput(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",").replace(/,00$/, "");
}

export type ListingSummary = {
  id: string;
  title: string;
  tcg: Tcg;
  kind: Kind;
  offer: Offer;
  price_cents: number | null;
  negotiable: boolean;
  condition: Condition | null;
  city: string | null;
  status: ListingStatus;
  created_at: string;
  owner_nickname: string;
  owner_id: string;
  cover_photo_id: string | null;
  total_count: number;
};

export type ListingDetail = {
  listing: {
    id: string;
    owner_id: string;
    title: string;
    description: string | null;
    tcg: Tcg;
    kind: Kind;
    offer: Offer;
    price_cents: number | null;
    negotiable: boolean;
    condition: Condition | null;
    card_language: string | null;
    grading: string | null;
    city: string | null;
    handover_event: boolean;
    handover_pickup: boolean;
    handover_shipping: boolean;
    status: ListingStatus;
    removed_reason: string | null;
    created_at: string;
    updated_at: string;
  };
  owner: { nickname: string; role: "member" | "team" | "admin"; member_since: string };
  photos: string[];
  is_owner: boolean;
  can_moderate: boolean;
};

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
