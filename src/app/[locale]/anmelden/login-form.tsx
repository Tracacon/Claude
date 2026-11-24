"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError } from "@/components/form-error";
import {
  requestCode,
  signInWithPassword,
  verifyCode,
  type LoginState,
  type PasswordLoginState,
} from "@/lib/actions/auth";

type Mode = "password" | "code";

/** Anmeldung: standardmäßig mit Passwort; mit Code für Registrierung, ohne Passwort oder bei vergessenem Passwort. */
export function LoginForm({ initialMode = "password" }: { initialMode?: Mode }) {
  const t = useTranslations("Login");
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{mode === "password" ? t("title") : t("codeTitle")}</h1>
      <p className="text-cream/80">{mode === "password" ? t("passwordIntro") : t("codeIntro")}</p>
      {mode === "password" ? (
        <PasswordLogin email={email} onEmail={setEmail} onCode={() => setMode("code")} />
      ) : (
        <CodeLogin initialEmail={email} onPassword={() => setMode("password")} />
      )}
      <p className="text-xs text-cream/60">{t("hint")}</p>
    </div>
  );
}

function PasswordLogin({ email, onEmail, onCode }: { email: string; onEmail: (v: string) => void; onCode: () => void }) {
  const t = useTranslations("Login");
  const [state, action, pending] = useActionState<PasswordLoginState, FormData>(signInWithPassword, {});

  return (
    <div className="space-y-4">
      <form action={action} className="card space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="label">{t("email")}</label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            required
            defaultValue={state.email ?? email}
            onChange={(e) => onEmail(e.target.value)}
            className="input"
          />
          <FormError code={state.errors?.email} />
        </div>
        <div>
          <label htmlFor="password" className="label">{t("password")}</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
          <FormError code={state.errors?.password} />
        </div>
        <FormError code={state.errors?._form} />
        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? t("verifying") : t("verify")}
        </button>
        <button type="button" onClick={onCode} className="link block text-sm">
          {t("forgot")}
        </button>
      </form>
      <div className="card space-y-2 text-sm">
        <p className="font-semibold">{t("newHere")}</p>
        <p className="text-cream/70">{t("newHereText")}</p>
        <button type="button" onClick={onCode} className="btn-ghost w-full">
          {t("register")}
        </button>
      </div>
    </div>
  );
}

function CodeLogin({ initialEmail, onPassword }: { initialEmail: string; onPassword: () => void }) {
  const t = useTranslations("Login");
  const [requestState, requestAction, requesting] = useActionState<LoginState, FormData>(requestCode, {
    step: "email",
    email: initialEmail,
  });
  const [verifyState, verifyAction, verifying] = useActionState<LoginState, FormData>(verifyCode, { step: "code", email: "" });
  const [restart, setRestart] = useState(0);

  const onCodeStep = requestState.step === "code" && restart === 0;

  if (!onCodeStep) {
    return (
      <div className="space-y-3">
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
        <button type="button" onClick={onPassword} className="link text-sm">
          {t("withPassword")}
        </button>
      </div>
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
          {verifying ? t("verifying") : t("verifyCode")}
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
