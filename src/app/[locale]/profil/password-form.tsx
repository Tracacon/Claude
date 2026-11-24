"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { setPassword, type FormState } from "@/lib/actions/profile";

export function PasswordForm() {
  const t = useTranslations("Profile");
  const [state, action, pending] = useActionState<FormState, FormData>(setPassword, {});

  return (
    <form action={action} className="card space-y-4" noValidate>
      <div>
        <h2 className="font-semibold">{t("passwordTitle")}</h2>
        <p className="text-sm text-cream/70">{t("passwordIntro")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="new-password" className="label">{t("newPassword")}</label>
          <input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} className="input" />
          <FormError code={state.errors?.password} />
        </div>
        <div>
          <label htmlFor="new-password2" className="label">{t("repeatPassword")}</label>
          <input id="new-password2" name="password2" type="password" autoComplete="new-password" className="input" />
          <FormError code={state.errors?.password2} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-ghost" disabled={pending}>{t("savePassword")}</button>
        {state.ok && !pending && <span role="status" className="text-sm text-ok">{t("passwordSaved")}</span>}
      </div>
    </form>
  );
}
