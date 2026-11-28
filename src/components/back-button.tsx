"use client";

import { usePathname, useRouter } from "@/i18n/navigation";
import { getBackTarget, navDepth, parentPath, prevPath, TOP_LEVEL } from "@/lib/nav-history";

/** Zurück-Pfeil oben links. Auf den Seiten der unteren Leiste wird er nicht gezeigt. */
export function BackButton({ label }: { label: string }) {
  const pathname = usePathname();
  const router = useRouter();
  if (TOP_LEVEL.has(pathname)) return null;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        // Fest vorgegebenes Ziel (z. B. Karte einpflegen → zurück zum Binder)
        const target = getBackTarget(pathname);
        if (target) {
          if (navDepth() > 0 && prevPath() === target) router.back();
          else router.replace(target);
          return;
        }
        if (navDepth() > 0) router.back();
        else router.push(parentPath(pathname));
      }}
      className="-ml-2 grid size-10 shrink-0 place-items-center rounded-full text-cream hover:bg-tint/10 hover:text-brand-ink"
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </button>
  );
}
