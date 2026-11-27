// Gemeinsame Werte für Sammelkartenbinder (Server und Browser).

export const BINDER_COLORS = ["night", "amber", "red", "blue", "green", "purple", "black", "cream"] as const;
export const BINDER_VISIBILITIES = ["public", "followers", "private"] as const;
/** Effekte über der Einbandfarbe */
export const BINDER_EFFECTS = ["none", "glitter", "gold", "holo", "rainbow", "cosmos"] as const;
export type BinderEffect = (typeof BINDER_EFFECTS)[number];
export type BinderColor = (typeof BINDER_COLORS)[number];
export type BinderVisibility = (typeof BINDER_VISIBILITIES)[number];

/** Einbandfarben: Grundton und dunklerer Rand für den Ledereffekt */
export const BINDER_COLOR_STYLES: Record<BinderColor, { base: string; edge: string; text: string }> = {
  night: { base: "#1f3a4a", edge: "#0f1f29", text: "#eef7f8" },
  amber: { base: "#c98a1c", edge: "#7a510c", text: "#1a1206" },
  red: { base: "#9e2733", edge: "#5a121a", text: "#fbeaec" },
  blue: { base: "#1f4fa3", edge: "#0f2a5c", text: "#eaf1ff" },
  green: { base: "#1f7a4f", edge: "#0e4229", text: "#e8fbf1" },
  purple: { base: "#5e2fa0", edge: "#33185a", text: "#f3ecff" },
  black: { base: "#22262b", edge: "#0b0c0e", text: "#eef7f8" },
  cream: { base: "#e9dfc8", edge: "#a99c7d", text: "#2a2418" },
};

/** Fächer je Binderseite (3 × 3) */
export const POCKETS_PER_PAGE = 9;

export type BinderSummary = {
  id: string;
  name: string;
  color: BinderColor;
  effect: BinderEffect;
  visibility: BinderVisibility;
  position: number;
  card_count: number;
  /** Eigenes Titelbild (Speicher listing-photos), sonst nur Farbe und Effekt */
  cover_image: string | null;
  owner_id: string;
};

/** Adresse für Karten ohne Binder */
export const NO_BINDER = "ohne";

/** Filter der Sammlung: alles, nur Sammlung oder nach Markierung */
export const COLLECTION_MARKS = ["alle", "sammlung", "tausch", "verkauf", "verschenken"] as const;
export type CollectionMark = (typeof COLLECTION_MARKS)[number];

export function parseCollectionMark(v: unknown): CollectionMark {
  return COLLECTION_MARKS.includes(v as CollectionMark) ? (v as CollectionMark) : "alle";
}

/**
 * Passt ein Stück zum Filter? mark = Markierung im Marktplatz (trade, sell, sell_or_trade, gift)
 * oder null für "nur Sammlung".
 */
export function matchesMark(mark: string | null, filter: CollectionMark) {
  switch (filter) {
    case "alle":
      return true;
    case "sammlung":
      return mark === null;
    case "tausch":
      return mark === "trade" || mark === "sell_or_trade";
    case "verkauf":
      return mark === "sell" || mark === "sell_or_trade";
    case "verschenken":
      return mark === "gift";
  }
}
