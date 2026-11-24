import { z } from "zod";
import {
  CARD_LANGUAGES,
  CONDITIONS,
  KINDS,
  MAX_PHOTOS,
  OFFERS,
  REPORT_REASONS,
  TCGS,
  UUID_PATTERN,
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

export const nicknameSchema = z.string().trim().regex(NICKNAME_PATTERN, { message: "invalid_nickname" });

export const onboardingSchema = z.object({
  nickname: nicknameSchema,
  confirmAge: z.literal("on", { message: "age_required" }),
  acceptTerms: z.literal("on", { message: "terms_required" }),
});

export const profileSchema = z.object({
  city: optionalText(80),
  bio: optionalText(500),
  website: z
    .string()
    .trim()
    .max(200, { message: "too_long" })
    .refine((v) => v === "" || /^https:\/\/[^\s]+\.[^\s]+$/.test(v), { message: "invalid_website" })
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
    title: z.string().trim().min(3, { message: "title_short" }).max(100, { message: "too_long" }),
    description: optionalText(2000),
    tcg: z.enum(TCGS, { message: "tcg_required" }),
    kind: z.enum(KINDS),
    offer: z.enum(OFFERS),
    price: z.string().trim().max(20, { message: "invalid_price" }),
    negotiable: checkbox,
    condition: z.union([z.enum(CONDITIONS), z.literal("")]).transform((v) => (v === "" ? null : v)),
    card_language: z.union([z.enum(CARD_LANGUAGES), z.literal("")]).transform((v) => (v === "" ? null : v)),
    grading: optionalText(40),
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
    const cents = v.offer === "trade" ? null : parseEuroToCents(v.price);
    if (v.offer !== "trade" && (cents === null || Number.isNaN(cents))) {
      ctx.addIssue({ code: "custom", path: ["price"], message: cents === null ? "price_required" : "invalid_price" });
      return z.NEVER;
    }
    if (cents !== null && (cents < 0 || cents > 10_000_000)) {
      ctx.addIssue({ code: "custom", path: ["price"], message: "invalid_price" });
      return z.NEVER;
    }
    if (!v.handover_event && !v.handover_pickup && !v.handover_shipping) {
      ctx.addIssue({ code: "custom", path: ["handover"], message: "handover_required" });
      return z.NEVER;
    }
    const { price: _price, ...rest } = v;
    void _price;
    return { ...rest, price_cents: cents, negotiable: v.offer === "trade" ? false : v.negotiable };
  });

export type ListingInput = z.output<typeof listingSchema>;

export const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS, { message: "reason_required" }),
  details: optionalText(1000),
});

export const moderationReasonSchema = z
  .string()
  .trim()
  .min(5, { message: "reason_required" })
  .max(1000, { message: "too_long" });
