"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError } from "@/components/form-error";
import { requestCode, verifyCode, type LoginState } from "@/lib/actions/auth";

export function LoginForm() {
  const t = useTranslations("Login");
  const [requestState, requestAction, requesting] = useActionState<LoginState, FormData>(requestCode, { step: "email" });
  const [verifyState, verifyAction, verifying] = useActionState<LoginState, FormData>(verifyCode, { step: "code", email: "" });
  const [restart, setRestart] = useState(0);

  const onCodeStep = requestState.step === "code" && restart === 0;

  if (!onCodeStep) {
    return (
      <form action={(fd) => { setRestart(0); requestAction(fd); }} className="card space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="label">{t("email")}</label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            defaultValue={requestState.email}
            aria-invalid={Boolean(requestState.errors?.email)}
            aria-describedby="email-error"
            className="input"
          />
          <FormError id="email-error" code={requestState.errors?.email} />
        </div>
        <FormError code={requestState.errors?._form} />
        <button type="submit" className="btn-primary w-full" disabled={requesting}>
          {requesting ? t("sending") : t("sendCode")}
        </button>
      </form>
    );
  }

  const email = requestState.email;
  return (
    <div className="space-y-3">
      <form action={verifyAction} className="card space-y-4" noValidate>
        <p className="text-sm text-cream/80" role="status">{t("codeSent", { email })}</p>
        <input type="hidden" name="email" value={email} />
        <div>
          <label htmlFor="token" className="label">{t("code")}</label>
          <input
            id="token"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={12}
            required
            autoFocus
            aria-invalid={Boolean(verifyState.errors?.token)}
            aria-describedby="token-error"
            className="input text-center font-mono text-2xl tracking-[0.4em]"
          />
          <FormError id="token-error" code={verifyState.errors?.token ?? verifyState.errors?._form} />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={verifying}>
          {verifying ? t("verifying") : t("verify")}
        </button>
      </form>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <button type="button" className="link" onClick={() => setRestart((n) => n + 1)}>
          {t("otherEmail")}
        </button>
        <form action={requestAction}>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="resend" value="1" />
          <button type="submit" className="link" disabled={requesting}>
            {t("resend")}
          </button>
        </form>
      </div>
    </div>
  );
}
