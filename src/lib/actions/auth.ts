"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { mapDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import {
  emailSchema,
  newPasswordSchema,
  otpSchema,
  passwordLoginSchema,
  registerSchema,
  toFieldErrors,
  type FieldErrors,
} from "@/lib/validation";

// ---------------------------------------------------------------------------
// Gemeinsame Hilfen
// ---------------------------------------------------------------------------

function isRateLimited(status?: number, code?: string) {
  return status === 429 || code === "over_email_send_rate_limit" || code === "over_request_rate_limit";
}

/** Nach erfolgreicher Anmeldung: Profil oder Begrüßung, in der Sprache des Profils. */
async function afterLogin(userId: string, href?: string): Promise<never> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname, locale")
    .eq("id", userId)
    .maybeSingle<{ nickname: string | null; locale: "de" | "en" }>();
  const locale = profile?.locale ?? (await getLocale());
  return redirect({ href: href ?? (profile?.nickname ? "/profil" : "/willkommen"), locale });
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

// ---------------------------------------------------------------------------
// Anmelden mit E-Mail und Passwort
// ---------------------------------------------------------------------------

export type PasswordLoginState = { email?: string; errors?: FieldErrors };

export async function signInWithPassword(_prev: PasswordLoginState, formData: FormData): Promise<PasswordLoginState> {
  const email = str(formData, "email");
  const parsed = passwordLoginSchema.safeParse({ email, password: str(formData, "password") });
  if (!parsed.success) return { email, errors: toFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") return { email, errors: { _form: "email_not_confirmed" } };
    return { email, errors: { _form: isRateLimited(error?.status, error?.code) ? "rate_limited" : "login_wrong" } };
  }
  return afterLogin(data.user.id);
}

// ---------------------------------------------------------------------------
// Registrieren: Schritt 1 Angaben, Schritt 2 Bestätigungscode aus der E-Mail
// ---------------------------------------------------------------------------

export type RegisterState = {
  step: "form" | "code";
  values?: Record<string, string>;
  email?: string;
  nickname?: string;
  errors?: FieldErrors;
  resent?: boolean;
};

export async function register(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const values = { email: str(formData, "email"), nickname: str(formData, "nickname") };
  const parsed = registerSchema.safeParse({
    ...values,
    password: str(formData, "password"),
    password2: str(formData, "password2"),
    confirmAge: formData.get("confirmAge") ?? undefined,
    acceptTerms: formData.get("acceptTerms") ?? undefined,
  });
  if (!parsed.success) {
    const errors = toFieldErrors(parsed.error);
    if (!errors.password && !errors.password2 && str(formData, "password") !== str(formData, "password2")) {
      errors.password2 = "password_mismatch";
    }
    return { step: "form", values, errors };
  }

  const locale = await getLocale();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { locale, nickname: parsed.data.nickname } },
  });

  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { step: "form", values, errors: { email: "email_taken" } };
    }
    if (error.code === "weak_password") return { step: "form", values, errors: { password: "password_weak" } };
    if (isRateLimited(error.status, error.code)) return { step: "form", values, errors: { _form: "rate_limited" } };
    console.error("signUp", error.status, error.code);
    return { step: "form", values, errors: { _form: "generic" } };
  }

  // Bei bereits registrierter Adresse liefert Supabase einen Platzhalter ohne Identitäten.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { step: "form", values, errors: { email: "email_taken" } };
  }

  // Ist die E-Mail-Bestätigung in Supabase ausgeschaltet, gibt es sofort eine Sitzung.
  if (data.session && data.user) {
    return finishRegistration(data.user.id, parsed.data.nickname);
  }

  return { step: "code", email: parsed.data.email, nickname: parsed.data.nickname };
}

async function finishRegistration(userId: string, nickname: string): Promise<never> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_onboarding", {
    p_nickname: nickname,
    p_confirm_age: true,
    p_accept_terms: true,
  });
  if (error) {
    // z. B. Nickname inzwischen vergeben: auf der Begrüßungsseite neu wählen
    console.error("complete_onboarding nach Registrierung", mapDbError(error));
    return afterLogin(userId, "/willkommen");
  }
  return afterLogin(userId, "/profil");
}

export async function confirmRegistration(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const email = str(formData, "email");
  const nickname = str(formData, "nickname");
  const parsed = otpSchema.safeParse({ email, token: str(formData, "token").replace(/\s/g, "") });
  if (!parsed.success) return { step: "code", email, nickname, errors: toFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.token, type: "signup" });
  if (error || !data.user) {
    return {
      step: "code",
      email,
      nickname,
      errors: { token: isRateLimited(error?.status, error?.code) ? "rate_limited" : "code_wrong" },
    };
  }
  return finishRegistration(data.user.id, nickname);
}

export async function resendRegistration(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const email = str(formData, "email");
  const nickname = str(formData, "nickname");
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error && isRateLimited(error.status, error.code)) {
    return { step: "code", email, nickname, errors: { token: "rate_limited" } };
  }
  return { step: "code", email, nickname, resent: true };
}

// ---------------------------------------------------------------------------
// Passwort vergessen: Code anfordern, Code prüfen, neues Passwort festlegen
// ---------------------------------------------------------------------------

export type ResetState = { step: "email" | "code" | "password"; email?: string; errors?: FieldErrors; resent?: boolean };

export async function requestResetCode(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") ?? "" });
  if (!parsed.success) return { step: "email", email: str(formData, "email"), errors: toFieldErrors(parsed.error) };

  const supabase = await createClient();
  // shouldCreateUser: false – hier entstehen keine neuen Konten
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data.email, options: { shouldCreateUser: false } });
  if (error && isRateLimited(error.status, error.code)) {
    return { step: "email", email: parsed.data.email, errors: { _form: "rate_limited" } };
  }
  // Gleiche Antwort für bekannte und unbekannte Adressen
  return { step: "code", email: parsed.data.email, resent: formData.get("resend") === "1" };
}

export async function verifyResetCode(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const email = str(formData, "email");
  const parsed = otpSchema.safeParse({ email, token: str(formData, "token").replace(/\s/g, "") });
  if (!parsed.success) return { step: "code", email, errors: toFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.token, type: "email" });
  if (error || !data.user) {
    return { step: "code", email, errors: { token: isRateLimited(error?.status, error?.code) ? "rate_limited" : "code_wrong" } };
  }
  return { step: "password", email };
}

export async function saveNewPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const email = str(formData, "email");
  const parsed = newPasswordSchema.safeParse({ password: str(formData, "password"), password2: str(formData, "password2") });
  if (!parsed.success) return { step: "password", email, errors: toFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { step: "email", errors: { _form: "not_authenticated" } };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error && error.code !== "same_password") {
    const code = error.code === "weak_password" ? "password_weak" : "generic";
    return { step: "password", email, errors: { password: code } };
  }
  return afterLogin(userData.user.id);
}

// ---------------------------------------------------------------------------
// Abmelden
// ---------------------------------------------------------------------------

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const locale = await getLocale();
  redirect({ href: "/", locale });
}
