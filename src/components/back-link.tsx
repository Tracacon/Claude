"use client";

import { useRouter } from "@/i18n/navigation";

/**
 * „← Zurück“: führt dorthin zurück, wo man herkam (mit Filtern und Scrollposition).
 * Kam man von außen (z. B. geteilter Link), geht es stattdessen zur angegebenen Seite.
 */
export function BackLink({ fallback, label }: { fallback: string; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        const fromApp = document.referrer.startsWith(window.location.origin) && window.history.length > 1;
        if (fromApp) router.back();
        else router.push(fallback);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg py-1 pr-2 text-sm font-semibold text-cream/80 hover:text-brand"
    >
      <span aria-hidden className="text-lg leading-none">←</span>
      {label}
    </button>
  );
}
