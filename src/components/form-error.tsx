"use client";

import { useTranslations } from "next-intl";

/** Zeigt einen Fehlercode aus messages/*.json → Errors an. */
export function FormError({ code, id }: { code?: string; id?: string }) {
  const t = useTranslations("Errors");
  if (!code) return null;
  const text = t.has(code) ? t(code) : t("generic");
  return (
    <p id={id} role="alert" className="error">
      {text}
    </p>
  );
}
