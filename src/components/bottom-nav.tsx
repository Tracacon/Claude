"use client";

import { Link, usePathname } from "@/i18n/navigation";

type Labels = { home: string; market: string; sell: string; mine: string; profile: string; login: string };

/** Navigationsleiste am unteren Rand, nur auf schmalen Bildschirmen. */
export function BottomNav({ loggedIn, onboarded, labels }: { loggedIn: boolean; onboarded: boolean; labels: Labels }) {
  const pathname = usePathname();
  const is = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const marketActive = is("/marktplatz") && !is("/marktplatz/neu");

  const item = (href: string, icon: string, label: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-amber" : "text-cream/70"}`}
    >
      <span aria-hidden className="text-lg leading-none">{icon}</span>
      {label}
    </Link>
  );

  return (
    <nav
      aria-label="Navigation"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-white/10 bg-night/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      {item("/", "⌂", labels.home, is("/"))}
      {item("/marktplatz", "▦", labels.market, marketActive)}
      {onboarded && (
        <Link
          href="/marktplatz/neu"
          aria-current={is("/marktplatz/neu") ? "page" : undefined}
          className="flex flex-1 flex-col items-center justify-center"
          aria-label={labels.sell}
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-amber text-2xl font-bold text-night shadow-lg">+</span>
        </Link>
      )}
      {onboarded && item("/meine-inserate", "☰", labels.mine, is("/meine-inserate"))}
      {loggedIn
        ? item(onboarded ? "/profil" : "/willkommen", "◉", labels.profile, is("/profil") || is("/willkommen"))
        : item("/anmelden", "→", labels.login, is("/anmelden"))}
    </nav>
  );
}
