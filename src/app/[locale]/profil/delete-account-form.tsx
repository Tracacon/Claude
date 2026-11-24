"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { deleteAccount, type FormState } from "@/lib/actions/profile";

export function DeleteAccountForm() {
  const t = useTranslations("Profile");
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccount, {});

  return (
    <details className="card border-danger/30">
      <summary className="cursor-pointer font-semibold text-danger">{t("dangerTitle")}</summary>
      <form action={action} className="mt-4 space-y-3" noValidate>
        <p className="text-sm text-cream/80">{t("dangerText")}</p>
        <div>
          <label htmlFor="confirm" className="label">{t("deleteConfirm")}</label>
          <input id="confirm" name="confirm" autoComplete="off" placeholder={t("deleteWord")} className="input" />
          <FormError code={state.errors?.confirm} />
        </div>
        <FormError code={state.errors?._form} />
        <button type="submit" className="btn-danger" disabled={pending}>
          {pending ? t("deleting") : t("delete")}
        </button>
      </form>
    </details>
  );
}
