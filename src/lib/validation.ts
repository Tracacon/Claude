import { z } from "zod";

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
