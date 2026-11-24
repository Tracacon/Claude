"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { CodeInput } from "@/components/code-input";
import { FormError } from "@/components/form-error";
import { Link } from "@/i18n/navigation";
import { requestResetCode, saveNewPassword, verifyResetCode, type ResetState } from "@/lib/actions/auth";

/** Passwort vergessen: E-Mail → Code → neues Passwort. */
export function ResetForm() {
  const t = useTranslations("Reset");
  const tO = useTranslations("Onboarding");
  const [requestState, requestAction, requesting] = useActionState<ResetState, FormData>(requestResetCode, { step: "email" });
  const [verifyState, verifyAction, verifying] = useActionState<ResetState, FormData>(verifyResetCode, { step: "code" });
  const [saveState, saveAction, saving] = useActionState<ResetState, FormData>(saveNewPassword, { step: "password" });
  const [restart, setRestart] = useState(0);

  const step = verifyState.step === "password" ? "password" : requestState.step === "code" && restart === 0 ? "code" : "email";
  const email = requestState.email ?? "";

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{step === "password" ? t("newTitle") : t("title")}</h1>

      {step === "email" && (
        <>
          <p className="text-cream/80">{t("intro")}</p>
          <form action={(fd) => { setRestart(0); requestAction(fd); }} className="card space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="label">{t("email")}</label>
              <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={email} className="input" />
              <FormError code={requestState.errors?.email} />
            </div>
            <FormError code={requestState.errors?._form} />
            <button type="submit" className="btn-primary w-full" disabled={requesting}>{t("sendCode")}</button>
          </form>
          <Link href="/anmelden" className="link text-sm">← {t("backToLogin")}</Link>
        </>
      )}

      {step === "code" && (
        <>
          <form action={verifyAction} className="card space-y-4" noValidate>
            <p className="text-sm text-cream/80" role="status">{t("codeSent", { email })}</p>
            <input type="hidden" name="email" value={email} />
            <CodeInput label={t("code")} error={verifyState.errors?.token} />
            <button type="submit" className="btn-primary w-full" disabled={verifying}>{t("confirm")}</button>
          </form>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <button type="button" className="link" onClick={() => setRestart((n) => n + 1)}>{t("otherEmail")}</button>
            <form action={requestAction}>
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="resend" value="1" />
              <button type="submit" className="link" disabled={requesting}>{t("resend")}</button>
            </form>
          </div>
        </>
      )}

      {step === "password" && (
        <>
          <p className="text-cream/80">{t("newIntro")}</p>
          <form action={saveAction} className="card space-y-4" noValidate>
            <input type="hidden" name="email" value={email} />
            <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
            <div>
              <label htmlFor="password" className="label">{t("newPassword")}</label>
              <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="input" />
              <FormError code={saveState.errors?.password} />
            </div>
            <div>
              <label htmlFor="password2" className="label">{tO("password2")}</label>
              <input id="password2" name="password2" type="password" autoComplete="new-password" required className="input" />
              <FormError code={saveState.errors?.password2} />
            </div>
            <FormError code={saveState.errors?._form} />
            <button type="submit" className="btn-primary w-full" disabled={saving}>{t("save")}</button>
          </form>
        </>
      )}
    </div>
  );
}
