"use client";

import { usePathname, useRouter } from "@/i18n/navigation";
import { navDepth, parentPath, TOP_LEVEL } from "@/lib/nav-history";

/** Zurück-Pfeil oben links. Auf den Seiten der unteren Leiste wird er nicht gezeigt. */
export function BackButton({ label }: { label: string }) {
  const pathname = usePathname();
  const router = useRouter();
  if (TOP_LEVEL.has(pathname)) return null;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => (navDepth() > 0 ? router.back() : router.push(parentPath(pathname)))}
      className="-ml-2 grid size-10 shrink-0 place-items-center rounded-full text-cream hover:bg-white/10 hover:text-brand"
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </button>
  );
}
