"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { Link } from "@/i18n/navigation";
import { signInWithPassword, type PasswordLoginState } from "@/lib/actions/auth";

/** Klassische Anmeldung mit E-Mail und Passwort. */
export function LoginForm() {
  const t = useTranslations("Login");
  const [state, action, pending] = useActionState<PasswordLoginState, FormData>(signInWithPassword, {});

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
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
            defaultValue={state.email}
            className="input"
          />
          <FormError code={state.errors?.email} />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="label">{t("password")}</label>
            <Link href="/passwort-vergessen" className="link text-sm">{t("forgot")}</Link>
          </div>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
          <FormError code={state.errors?.password} />
        </div>
        <FormError code={state.errors?._form} />
        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? t("verifying") : t("submit")}
        </button>
      </form>

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">{t("noAccount")}</p>
        <Link href="/registrieren" className="btn-ghost">{t("register")}</Link>
      </div>
      <p className="text-xs text-cream/60">{t("hint")}</p>
    </div>
  );
}
