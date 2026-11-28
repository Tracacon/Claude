"use client";

import { useFormatter } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Link, usePathname } from "@/i18n/navigation";
import type { MiniProfile } from "@/lib/notifications";

/**
 * Laufschrift "Neu dabei" plus aufklappbare Liste.
 * Tippen auf den Balken öffnet bzw. schließt die Liste darunter (kein Seitenwechsel).
 * In der Liste führt jeder Eintrag zum Profil.
 */
export function NewMembersTicker({
  people,
  labels,
  welcome,
}: {
  people: MiniProfile[];
  labels: { badge: string; title: string; open: string; close: string; joined: string; count: string };
  /** "Willkommen, @name!" je Person (gleiche Reihenfolge) */
  welcome: string[];
}) {
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Bei Seitenwechsel schließen
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  // Klick daneben oder Escape schließt
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Laufschrift: höchstens 20 Namen; mindestens 6 je Hälfte, dann zwei gleiche Hälften (lückenlos)
  const ticker = people.slice(0, 20).map((p, i) => ({ p, text: welcome[i] }));
  let half = ticker;
  while (half.length < 6) half = [...half, ...ticker];
  const loop = [...half, ...half];
  const seconds = Math.max(24, loop.length * 4);

  return (
    <div ref={box} className="relative">
      <section aria-label={labels.title} className="border-t border-line bg-night-2/95">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="neu-dabei-liste"
          aria-label={open ? labels.close : labels.open}
          className="mx-auto flex h-8 w-full max-w-5xl items-center text-left"
        >
          <span className="flex h-full shrink-0 items-center gap-1 bg-brand/15 px-3 text-[11px] font-bold uppercase tracking-wide text-brand">
            {labels.badge}
            <svg viewBox="0 0 24 24" className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
          <span className="relative h-full min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-24px),transparent)]">
            <span
              aria-hidden
              className="flex h-full w-max items-center gap-6 pl-3 motion-safe:animate-[ticker_var(--d)_linear_infinite] hover:[animation-play-state:paused]"
              style={{ "--d": `${seconds}s` } as React.CSSProperties}
            >
              {loop.map(({ p, text }, i) => (
                <span key={`${p.id}-${i}`} className="flex shrink-0 items-center gap-1.5 text-xs text-cream/85">
                  <Avatar userId={p.id} avatarId={p.avatar_id} nickname={p.nickname} size="2xs" />
                  <span>{text}</span>
                </span>
              ))}
            </span>
          </span>
        </button>
      </section>

      {open && (
        <div
          id="neu-dabei-liste"
          className="absolute inset-x-0 top-full z-30 border-b border-line bg-night-2 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8)]"
        >
          <div className="mx-auto max-w-5xl">
            <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-cream/60">{labels.count}</p>
            <ul className="max-h-[55vh] overflow-y-auto overscroll-contain px-2 pb-3">
              {people.map((p) => (
                <li key={p.id}>
                  <Link href={`/u/${p.nickname}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5">
                    <Avatar userId={p.id} avatarId={p.avatar_id} nickname={p.nickname} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">@{p.nickname}</span>
                      {p.created_at && (
                        <span className="block text-xs text-cream/60">
                          {labels.joined} {format.relativeTime(new Date(p.created_at), new Date())}
                        </span>
                      )}
                    </span>
                    <span className="text-lg text-cream/40" aria-hidden>›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
