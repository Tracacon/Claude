"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireProfile, requireUser } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { PHOTO_BUCKET } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";
import { onboardingSchema, profileSchema, toFieldErrors, type FieldErrors } from "@/lib/validation";

export type FormState = { ok?: boolean; errors?: FieldErrors; values?: Record<string, string> };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function completeOnboarding(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const values = { nickname: str(formData, "nickname") };
  const parsed = onboardingSchema.safeParse({
    nickname: values.nickname,
    confirmAge: formData.get("confirmAge") ?? undefined,
    acceptTerms: formData.get("acceptTerms") ?? undefined,
  });
  if (!parsed.success) return { errors: toFieldErrors(parsed.error), values };

  const supabase = await createClient();
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
  return redirect({ href: "/profil", locale });
}

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await requireProfile();
  const values = {
    city: str(formData, "city"),
    bio: str(formData, "bio"),
    website: str(formData, "website"),
    locale: str(formData, "locale"),
  };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { errors: toFieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", profile.id);
  if (error) return { errors: { _form: mapDbError(error) }, values };

  revalidatePath("/", "layout");
  if (parsed.data.locale !== profile.locale) {
    return redirect({ href: "/profil", locale: parsed.data.locale });
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

  const { error } = await supabase.rpc("delete_own_account");
  if (error) return { errors: { _form: mapDbError(error) } };

  // Konto ist weg; lokale Sitzung entfernen.
  await supabase.auth.signOut({ scope: "local" });
  const locale = await getLocale();
  return redirect({ href: "/", locale });
}
