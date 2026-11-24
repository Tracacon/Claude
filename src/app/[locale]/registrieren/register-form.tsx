"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { CodeInput } from "@/components/code-input";
import { FormError } from "@/components/form-error";
import { Link } from "@/i18n/navigation";
import { confirmRegistration, register, resendRegistration, type RegisterState } from "@/lib/actions/auth";

/** Registrierung: erst alle Angaben, dann einmalig der Bestätigungscode aus der E-Mail. */
export function RegisterForm() {
  const t = useTranslations("Register");
  const tO = useTranslations("Onboarding");
  const [state, action, pending] = useActionState<RegisterState, FormData>(register, { step: "form" });
  const [confirmState, confirmAction, confirming] = useActionState<RegisterState, FormData>(confirmRegistration, { step: "code" });
  const [resendState, resendAction, resending] = useActionState<RegisterState, FormData>(resendRegistration, { step: "code" });

  if (state.step === "code") {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-2xl font-bold">{t("confirmTitle")}</h1>
        <form action={confirmAction} className="card space-y-4" noValidate>
          <p className="text-sm text-cream/80" role="status">{t("codeSent", { email: state.email ?? "" })}</p>
          <input type="hidden" name="email" value={state.email} />
          <input type="hidden" name="nickname" value={state.nickname} />
          <CodeInput label={t("code")} error={confirmState.errors?.token ?? confirmState.errors?._form} />
          <button type="submit" className="btn-primary w-full" disabled={confirming}>
            {confirming ? t("confirming") : t("confirm")}
          </button>
        </form>
        <form action={resendAction} className="text-sm">
          <input type="hidden" name="email" value={state.email} />
          <input type="hidden" name="nickname" value={state.nickname} />
          <p className="text-cream/60">{t("noMail")}</p>
          <button type="submit" className="link" disabled={resending}>{t("resend")}</button>
          {resendState.resent && !resending && <span role="status" className="ml-2 text-ok">{t("resent")}</span>}
          <FormError code={resendState.errors?.token} />
        </form>
      </div>
    );
  }

  const v = state.values ?? {};
  const e = state.errors ?? {};
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-cream/80">{t("intro")}</p>
      <form key={JSON.stringify(v)} action={action} className="card space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="label">{t("email")}</label>
          <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={v.email} className="input" />
          <FormError code={e.email} />
          {e.email === "email_taken" && (
            <p className="mt-1 text-sm">
              <Link href="/anmelden" className="link">{t("toLogin")}</Link>
              {" · "}
              <Link href="/passwort-vergessen" className="link">{t("toReset")}</Link>
            </p>
          )}
        </div>
        <div>
          <label htmlFor="nickname" className="label">{tO("nickname")}</label>
          <input
            id="nickname"
            name="nickname"
            required
            minLength={3}
            maxLength={24}
            autoComplete="nickname"
            autoCapitalize="none"
            defaultValue={v.nickname}
            aria-describedby="nickname-hint"
            className="input"
          />
          <p id="nickname-hint" className="hint">{tO("nicknameHint")}</p>
          <FormError code={e.nickname} />
        </div>
        <div>
          <label htmlFor="password" className="label">{tO("password")}</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} aria-describedby="pw-hint" className="input" />
          <p id="pw-hint" className="hint">{t("passwordHint")}</p>
          <FormError code={e.password} />
        </div>
        <div>
          <label htmlFor="password2" className="label">{tO("password2")}</label>
          <input id="password2" name="password2" type="password" autoComplete="new-password" required className="input" />
          <FormError code={e.password2} />
        </div>
        <div>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="confirmAge" required className="mt-1 size-5 accent-brand" />
            <span>{tO("confirmAge")}</span>
          </label>
          <FormError code={e.confirmAge} />
        </div>
        <div>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="acceptTerms" required className="mt-1 size-5 accent-brand" />
            <span>
              {tO.rich("acceptTerms", {
                rules: (chunks) => <Link href="/regeln" target="_blank" className="link">{chunks}</Link>,
                privacy: (chunks) => <Link href="/datenschutz" target="_blank" className="link">{chunks}</Link>,
              })}
            </span>
          </label>
          <FormError code={e.acceptTerms} />
        </div>
        <FormError code={e._form} />
        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </button>
      </form>
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">{t("haveAccount")}</p>
        <Link href="/anmelden" className="btn-ghost">{t("toLoginShort")}</Link>
      </div>
    </div>
  );
}
