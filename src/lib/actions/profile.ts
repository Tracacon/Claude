"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { takePendingCheckin } from "@/lib/checkin";
import { requireProfile, requireUser } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { POST_BUCKET } from "@/lib/feed-shared";
import { PHOTO_BUCKET } from "@/lib/marketplace";
import { AVATAR_BUCKET } from "@/lib/social";
import { createClient } from "@/lib/supabase/server";
import { newPasswordSchema, onboardingSchema, profileSchema, toFieldErrors, type FieldErrors } from "@/lib/validation";

export type FormState = { ok?: boolean; errors?: FieldErrors; values?: Record<string, string> };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function completeOnboarding(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const values = { nickname: str(formData, "nickname") };
  const parsed = onboardingSchema.safeParse({
    nickname: values.nickname,
    password: str(formData, "password"),
    password2: str(formData, "password2"),
    confirmAge: formData.get("confirmAge") ?? undefined,
    acceptTerms: formData.get("acceptTerms") ?? undefined,
  });
  if (!parsed.success) {
    const errors = toFieldErrors(parsed.error);
    // Die Prüfung auf gleiche Passwörter läuft in zod erst, wenn alles andere stimmt; hier sofort melden.
    if (!errors.password && !errors.password2 && str(formData, "password") !== str(formData, "password2")) {
      errors.password2 = "password_mismatch";
    }
    return { errors, values };
  }

  const supabase = await createClient();
  const pw = await supabase.auth.updateUser({ password: parsed.data.password });
  if (pw.error && pw.error.code !== "same_password") {
    return { errors: { password: passwordErrorCode(pw.error.code) }, values };
  }

  const { error } = await supabase.rpc("complete_onboarding", {
    p_nickname: parsed.data.nickname,
    p_confirm_age: true,
    p_accept_terms: true,
  });
  if (error) {
    const code = mapDbError(error);
    return { errors: code === "nickname_taken" || code === "invalid_nickname" ? { nickname: code } : { _form: code }, values };
  }

  revalidatePath("/", "layout");
  const locale = await getLocale();
  return redirect({ href: (await takePendingCheckin()) ?? "/profil", locale });
}

function passwordErrorCode(code?: string) {
  if (code === "weak_password") return "password_weak";
  if (code === "same_password") return "password_same";
  if (code === "reauthentication_needed" || code === "reauth_nonce_missing") return "reauth_needed";
  if (code === "over_request_rate_limit") return "rate_limited";
  return "generic";
}

/** Passwort festlegen oder ändern (im Profil). */
export async function setPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = newPasswordSchema.safeParse({ password: str(formData, "password"), password2: str(formData, "password2") });
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { errors: { password: passwordErrorCode(error.code) } };
  return { ok: true };
}

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await requireProfile();
  const values = {
    city: str(formData, "city"),
    bio: str(formData, "bio"),
    website: str(formData, "website"),
    instagram: str(formData, "instagram"),
    locale: str(formData, "locale"),
  };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { errors: toFieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", profile.id);
  if (error) return { errors: { _form: mapDbError(error) }, values };

  revalidatePath("/", "layout");
  // Im Formular den bereinigten Namen zeigen (aus einem eingefügten Link wird "name")
  values.instagram = parsed.data.instagram ?? "";
  if (parsed.data.locale !== profile.locale) {
    return redirect({ href: "/einstellungen", locale: parsed.data.locale });
  }
  return { ok: true, values };
}

export async function deleteAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const confirm = str(formData, "confirm").trim().toUpperCase();
  if (confirm !== "LÖSCHEN" && confirm !== "DELETE") {
    return { errors: { confirm: "delete_confirm" } };
  }

  const supabase = await createClient();
  const user = await requireUser();

  // Fotos im Speicher zuerst löschen; die Datenbank entfernt danach Konto, Profil und Inserate.
  const { data: files } = await supabase.storage.from(PHOTO_BUCKET).list(user.id, { limit: 1000 });
  if (files && files.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .remove(files.map((f) => `${user.id}/${f.name}`));
    if (storageError) console.error("Fotos beim Kontolöschen nicht entfernt", storageError.message);
  }

  const { data: avatars } = await supabase.storage.from(AVATAR_BUCKET).list(user.id, { limit: 100 });
  if (avatars && avatars.length > 0) {
    await supabase.storage.from(AVATAR_BUCKET).remove(avatars.map((f) => `${user.id}/${f.name}`));
  }

  const { data: postFiles } = await supabase.storage.from(POST_BUCKET).list(user.id, { limit: 1000 });
  if (postFiles && postFiles.length > 0) {
    await supabase.storage.from(POST_BUCKET).remove(postFiles.map((f) => `${user.id}/${f.name}`));
  }

  const { error } = await supabase.rpc("delete_own_account");
  if (error) return { errors: { _form: mapDbError(error) } };

  // Konto ist weg; lokale Sitzung entfernen.
  await supabase.auth.signOut({ scope: "local" });
  const locale = await getLocale();
  return redirect({ href: "/", locale });
}
