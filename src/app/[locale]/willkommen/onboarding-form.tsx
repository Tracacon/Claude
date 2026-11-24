"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { Link } from "@/i18n/navigation";
import { completeOnboarding, type FormState } from "@/lib/actions/profile";

export function OnboardingForm() {
  const t = useTranslations("Onboarding");
  const [state, action, pending] = useActionState<FormState, FormData>(completeOnboarding, {});

  return (
    <form action={action} className="card space-y-5" noValidate>
      <div>
        <label htmlFor="nickname" className="label">{t("nickname")}</label>
        <input
          id="nickname"
          name="nickname"
          required
          minLength={3}
          maxLength={24}
          autoComplete="nickname"
          autoCapitalize="none"
          defaultValue={state.values?.nickname}
          aria-invalid={Boolean(state.errors?.nickname)}
          aria-describedby="nickname-hint nickname-error"
          className="input"
        />
        <p id="nickname-hint" className="hint">{t("nicknameHint")}</p>
        <FormError id="nickname-error" code={state.errors?.nickname} />
      </div>

      <div>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="confirmAge" required className="mt-1 size-5 accent-amber" />
          <span>{t("confirmAge")}</span>
        </label>
        <FormError code={state.errors?.confirmAge} />
      </div>

      <div>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="acceptTerms" required className="mt-1 size-5 accent-amber" />
          <span>
            {t.rich("acceptTerms", {
              rules: (chunks) => <Link href="/regeln" target="_blank" className="link">{chunks}</Link>,
              privacy: (chunks) => <Link href="/datenschutz" target="_blank" className="link">{chunks}</Link>,
            })}
          </span>
        </label>
        <FormError code={state.errors?.acceptTerms} />
      </div>

      <FormError code={state.errors?._form} />
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? t("saving") : t("submit")}
      </button>
    </form>
  );
}
