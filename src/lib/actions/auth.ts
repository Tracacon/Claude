"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, otpSchema, toFieldErrors, type FieldErrors } from "@/lib/validation";

export type LoginState =
  | { step: "email"; email?: string; errors?: FieldErrors }
  | { step: "code"; email: string; errors?: FieldErrors; resent?: boolean };

function authErrorCode(status?: number, code?: string) {
  if (status === 429 || code === "over_email_send_rate_limit" || code === "over_request_rate_limit") {
    return "rate_limited";
  }
  return "generic";
}

/** Schritt 1: Einmalcode per E-Mail anfordern. Legt bei Bedarf ein Konto an. */
export async function requestCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") ?? "" });
  if (!parsed.success) {
    return { step: "email", email: String(formData.get("email") ?? ""), errors: toFieldErrors(parsed.error) };
  }

  const locale = await getLocale();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: true, data: { locale } },
  });

  if (error) {
    console.error("signInWithOtp", error.status, error.code);
    return { step: "email", email: parsed.data.email, errors: { _form: authErrorCode(error.status, error.code) } };
  }

  // Bewusst gleiche Antwort für bekannte und neue Adressen.
  return { step: "code", email: parsed.data.email, resent: formData.get("resend") === "1" };
}

/** Schritt 2: Code prüfen und Sitzung setzen. */
export async function verifyCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const raw = { email: formData.get("email") ?? "", token: String(formData.get("token") ?? "").replace(/\s/g, "") };
  const parsed = otpSchema.safeParse(raw);
  if (!parsed.success) {
    return { step: "code", email: String(raw.email), errors: toFieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: "email",
  });

  if (error || !data.user) {
    const code = error?.status === 429 ? "rate_limited" : "code_wrong";
    return { step: "code", email: parsed.data.email, errors: { token: code } };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname, locale")
    .eq("id", data.user.id)
    .maybeSingle<{ nickname: string | null; locale: "de" | "en" }>();

  const locale = profile?.locale ?? (await getLocale());
  return redirect({ href: profile?.nickname ? "/profil" : "/willkommen", locale });
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const locale = await getLocale();
  redirect({ href: "/", locale });
}
