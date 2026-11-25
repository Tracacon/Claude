"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Link } from "@/i18n/navigation";

/** Freundliche Fehlerseite, falls beim Laden einer Seite etwas schiefgeht. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("Errors");
  useEffect(() => {
    // Landet im Cloudflare-Protokoll und im Wochenbericht
    console.error("Seitenfehler", error.digest ?? "", error.message);
  }, [error]);
  return (
    <div className="space-y-4 py-10 text-center">
      <p className="text-5xl" aria-hidden>
        😵
      </p>
      <h1 className="text-xl font-bold">{t("title")}</h1>
      <p className="text-cream/70">{t("text")}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => reset()} className="btn-primary">
          {t("retry")}
        </button>
        <Link href="/" className="btn-ghost">
          {t("home")}
        </Link>
      </div>
      {error.digest && <p className="text-xs text-cream/40">{t("code", { code: error.digest })}</p>}
    </div>
  );
}
