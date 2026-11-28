"use client";

import { useLocale } from "next-intl";
import { useTransition, type ReactNode } from "react";
import { getPathname, useRouter } from "@/i18n/navigation";

/**
 * Link mit sichtbarer Rückmeldung: zeigt sofort einen Ladekreis, bis die neue Seite da ist.
 * Für Stellen, an denen die Zielseite etwas länger lädt (z. B. aus einem Fenster heraus).
 */
export function PendingLink({
  href,
  className,
  pendingLabel,
  children,
}: {
  href: string;
  className?: string;
  pendingLabel: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  return (
    <a
      href={getPathname({ href, locale })}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        startTransition(() => router.push(href));
      }}
      aria-busy={pending}
      className={`${className ?? ""} ${pending ? "pointer-events-none opacity-80" : ""}`}
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          {pendingLabel}
        </span>
      ) : (
        children
      )}
    </a>
  );
}
