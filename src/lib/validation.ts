import { z } from "zod";
import {
  CARD_LANGUAGES,
  COLLECTION_CHOICE,
  CONDITIONS,
  KINDS,
  KINDS_NEEDING_BOTH_SIDES,
  KINDS_WITH_CARD,
  MAX_PHOTOS,
  MAX_QUANTITY,
  OFFERS,
  REMOVAL_REASONS,
  REPORT_REASONS,
  TCGS,
  UUID_PATTERN,
  offerHasPrice,
  parseEuroToCents,
} from "@/lib/marketplace";

// Spiegelt die Prüfungen der Datenbank, damit Nutzer verständliche Meldungen bekommen.
// Die Datenbank prüft trotzdem selbst; diese Regeln sind nur die erste Stufe.

export const NICKNAME_PATTERN = /^[A-Za-z0-9_.-]{3,24}$/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: "too_long" })
    .transform((v) => (v === "" ? null : v));

export const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email({ message: "invalid_email" }).max(254, { message: "invalid_email" }),
});

export const otpSchema = z.object({
  email: z.string().trim().toLowerCase().email({ message: "invalid_email" }),
  // Supabase verschickt je nach Einstellung 6 bis 10 Ziffern
  token: z
    .string()
    .trim()
    .regex(/^\d{6,10}$/, { message: "invalid_code" }),
});

export const passwordSchema = z
  .string()
  .min(8, { message: "password_short" })
  .max(72, { message: "password_long" });

export const passwordLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email({ message: "invalid_email" }),
  password: z.string().min(1, { message: "login_wrong" }).max(72, { message: "login_wrong" }),
});

export const newPasswordSchema = z
  .object({ password: passwordSchema, password2: z.string() })
  .refine((v) => v.password === v.password2, { path: ["password2"], message: "password_mismatch" });

export const nicknameSchema = z.string().trim().regex(NICKNAME_PATTERN, { message: "invalid_nickname" });

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email({ message: "invalid_email" }).max(254, { message: "invalid_email" }),
    nickname: z.string().trim().regex(NICKNAME_PATTERN, { message: "invalid_nickname" }),
    password: passwordSchema,
    password2: z.string(),
    confirmAge: z.literal("on", { message: "age_required" }),
    acceptTerms: z.literal("on", { message: "terms_required" }),
  })
  .refine((v) => v.password === v.password2, { path: ["password2"], message: "password_mismatch" });

export const onboardingSchema = z
  .object({
    nickname: nicknameSchema,
    password: passwordSchema,
    password2: z.string(),
    confirmAge: z.literal("on", { message: "age_required" }),
    acceptTerms: z.literal("on", { message: "terms_required" }),
  })
  .refine((v) => v.password === v.password2, { path: ["password2"], message: "password_mismatch" });

/**
 * Instagram-Name aus allem, was Leute eingeben oder einfügen:
 * "tracacon.de", "@tracacon.de", "instagram.com/tracacon.de", "https://www.instagram.com/tracacon.de/?igsh=…"
 */
export function normalizeInstagram(raw: string): string {
  let v = raw.trim();
  const m = v.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) v = m[1];
  return v.replace(/^@+/, "").replace(/\/+$/, "").toLowerCase();
}

export const profileSchema = z.object({
  city: optionalText(80),
  bio: optionalText(500),
  website: z
    .string()
    .trim()
    .max(200, { message: "too_long" })
    .refine((v) => v === "" || /^https:\/\/[^\s]+\.[^\s]+$/.test(v), { message: "invalid_website" })
    .transform((v) => (v === "" ? null : v)),
  website2: z
    .string()
    .trim()
    .max(200, { message: "too_long" })
    .refine((v) => v === "" || /^https:\/\/[^\s]+\.[^\s]+$/.test(v), { message: "invalid_website" })
    .transform((v) => (v === "" ? null : v)),
  instagram: z
    .string()
    .transform(normalizeInstagram)
    .refine((v) => v === "" || /^[a-z0-9._]{1,30}$/.test(v), { message: "invalid_instagram" })
    .transform((v) => (v === "" ? null : v)),
  locale: z.enum(["de", "en"]),
});

export const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["member", "team", "admin"]),
});

export type FieldErrors = Record<string, string>;

/** Wandelt Zod-Fehler in { feld: fehlercode } um. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

// --- Marktplatz ----------------------------------------------------------------

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal(""), z.undefined(), z.null()])
  .transform((v) => v === "on" || v === "true");

export const listingSchema = z
  .object({
    // Titel und Spiel sind nur für Tausch und Verkauf Pflicht (Prüfung unten)
    title: z.string().trim().max(100, { message: "too_long" }),
    description: optionalText(2000),
    tcg: z.union([z.enum(TCGS), z.literal("")], { message: "tcg_required" }),
    kind: z.enum(KINDS),
    // "collection" = nur in die Sammlung legen, sonst Markierung für den Marktplatz
    offer: z.enum([COLLECTION_CHOICE, ...OFFERS]),
    // Binder in der Sammlung ("" = ohne Binder)
    binder: z
      .string()
      .optional()
      .transform((v) => (v && UUID_PATTERN.test(v) ? v : null)),
    quantity: z
      .string()
      .optional()
      .transform((v) => (v === undefined || v.trim() === "" ? 1 : Number(v.trim())))
      .pipe(z.number({ message: "invalid_quantity" }).int({ message: "invalid_quantity" }).min(1, { message: "invalid_quantity" }).max(MAX_QUANTITY, { message: "invalid_quantity" })),
    price: z.string().trim().max(20, { message: "invalid_price" }),
    negotiable: checkbox,
    condition: z.union([z.enum(CONDITIONS), z.literal("")]).transform((v) => (v === "" ? null : v)),
    card_language: z.union([z.enum(CARD_LANGUAGES), z.literal("")]).transform((v) => (v === "" ? null : v)),
    grading: optionalText(40),
    // Set-Kürzel (z. B. "MEW") und Kartennummer (z. B. "199/165") für die bessere Suche
    card_code: z
      .string()
      .trim()
      .max(12, { message: "too_long" })
      .refine((v) => /^[A-Za-z0-9:.\- ]*$/.test(v), { message: "invalid_card_code" })
      .transform((v) => (v === "" ? null : v.toUpperCase().replace(/\s+/g, ""))),
    card_no: z
      .string()
      .trim()
      .max(20, { message: "too_long" })
      .refine((v) => /^[A-Za-z0-9/.\- ]*$/.test(v), { message: "invalid_card_number" })
      .transform((v) => (v === "" ? null : v.replace(/\s+/g, ""))),
    city: optionalText(80),
    handover_event: checkbox,
    handover_pickup: checkbox,
    handover_shipping: checkbox,
    photos: z
      .string()
      .transform((s, ctx) => {
        try {
          const arr = s ? JSON.parse(s) : [];
          if (Array.isArray(arr) && arr.every((x) => typeof x === "string" && UUID_PATTERN.test(x))) return arr as string[];
        } catch {}
        ctx.addIssue({ code: "custom", message: "generic" });
        return z.NEVER;
      })
      .pipe(z.array(z.string()).max(MAX_PHOTOS, { message: "too_many_photos" })),
  })
  .transform((v, ctx) => {
    const inCollection = v.offer === COLLECTION_CHOICE;
    // Sammlungsstücke haben keinen Preis; gespeichert wird "Tausch" als Vorgabe für später
    const offer = inCollection ? "trade" : v.offer;
    const cents = offerHasPrice(offer) ? parseEuroToCents(v.price) : null;
    if (offerHasPrice(offer) && (cents === null || Number.isNaN(cents))) {
      ctx.addIssue({ code: "custom", path: ["price"], message: cents === null ? "price_required" : "invalid_price" });
      return z.NEVER;
    }
    if (cents !== null && (cents < 0 || cents > 10_000_000)) {
      ctx.addIssue({ code: "custom", path: ["price"], message: "invalid_price" });
      return z.NEVER;
    }
    // Tausch und Verkauf (Marktplatz): Titel, Spiel, Vorder- und Rückseite Pflicht.
    // Nur Sammlung und Verschenken: bei Einzelkarten und Slabs reicht die Vorderseite.
    const forMarket = isMarketOffer(v.offer);
    if (KINDS_NEEDING_BOTH_SIDES.includes(v.kind) && v.photos.length < (forMarket ? 2 : 1)) {
      ctx.addIssue({ code: "custom", path: ["photos"], message: forMarket ? "front_back_required" : "front_required" });
      return z.NEVER;
    }
    if (forMarket && v.title.length < 3) {
      ctx.addIssue({ code: "custom", path: ["title"], message: v.title === "" ? "title_required" : "title_short" });
      return z.NEVER;
    }
    if (!forMarket && v.title.length > 0 && v.title.length < 3) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "title_short" });
      return z.NEVER;
    }
    if (forMarket && v.tcg === "") {
      ctx.addIssue({ code: "custom", path: ["tcg"], message: "tcg_required" });
      return z.NEVER;
    }
    if (!inCollection && !v.handover_event && !v.handover_pickup && !v.handover_shipping) {
      ctx.addIssue({ code: "custom", path: ["handover"], message: "handover_required" });
      return z.NEVER;
    }
    const withCard = KINDS_WITH_CARD.includes(v.kind);
    const card = { code: withCard ? v.card_code : null, number: withCard ? v.card_no : null };
    const { price: _price, card_code: _code, card_no: _no, binder, ...rest } = v;
    void [_price, _code, _no];
    // Ohne Titel: automatischer Titel aus Kürzel und Nummer bzw. allgemein (wird später durch den
    // Kartennamen aus der Kartendatenbank ersetzt, falls gefunden)
    const title_auto = v.title === "";
    const title = title_auto
      ? [card.code, card.number].filter(Boolean).join(" ") || (KINDS_WITH_CARD.includes(v.kind) ? "Sammlungskarte" : "Sammlungsstück")
      : v.title;
    // Die Datenbank verlangt mindestens eine Übergabeart; in der Sammlung bleibt "beim Event" als Vorgabe
    const handover_event = rest.handover_event || (inCollection && !rest.handover_pickup && !rest.handover_shipping);
    return {
      ...rest,
      title: title.length < 3 ? `Karte ${title}` : title,
      title_auto,
      tcg: v.tcg === "" ? ("other" as const) : v.tcg,
      offer,
      handover_event,
      status: inCollection ? ("collection" as const) : ("active" as const),
      price_cents: cents,
      negotiable: offerHasPrice(offer) ? v.negotiable : false,
      card,
      binder,
    };
  });

export type ListingInput = z.output<typeof listingSchema>;

/** Tausch und Verkauf: Angebote mit vollen Pflichtangaben (Titel, Spiel, Vorder- und Rückseite) */
export function isMarketOffer(offer: string) {
  return offer === "sell" || offer === "trade" || offer === "sell_or_trade";
}

export const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS, { message: "reason_required" }),
  details: optionalText(1000),
});

export const removalReasonSchema = z.enum(REMOVAL_REASONS, { message: "reason_required" });

export const moderationReasonSchema = z
  .string()
  .trim()
  .min(5, { message: "reason_required" })
  .max(1000, { message: "too_long" });
