"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { HomeIcon, MarketIcon, MessageIcon, SearchIcon } from "./icons";
import { UserMenu, type UserMenuData } from "./user-menu";

type Labels = { home: string; market: string; messages: string; search: string; profile: string; login: string };

/**
 * Leiste am unteren Rand wie bei Instagram, nur Symbole:
 * Feed · Marktplatz · Nachrichten (Mitte) · Suchen · Profil
 */
export function BottomNav({
  loggedIn,
  onboarded,
  unread,
  menu,
  labels,
}: {
  loggedIn: boolean;
  onboarded: boolean;
  unread: number;
  menu: UserMenuData | null;
  labels: Labels;
}) {
  const pathname = usePathname();
  const is = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  const item = (href: string, Icon: typeof HomeIcon, label: string, active: boolean, badge = 0) => (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-1 items-center justify-center py-3 ${active ? "text-cream" : "text-cream/75"}`}
    >
      <Icon className="size-[26px]" filled={active} />
      {badge > 0 && (
        <span className="absolute left-1/2 top-1.5 ml-1.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">
          {badge}
        </span>
      )}
    </Link>
  );

  return (
    <nav
      aria-label="Navigation"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-base/95 px-[env(safe-area-inset-left)] pb-[max(env(safe-area-inset-bottom),0.25rem)] backdrop-blur sm:hidden"
    >
      {item("/", HomeIcon, labels.home, is("/"))}
      {item("/marktplatz", MarketIcon, labels.market, is("/marktplatz"))}
      {item(onboarded ? "/nachrichten" : loggedIn ? "/willkommen" : "/anmelden", MessageIcon, labels.messages, is("/nachrichten"), unread)}
      {item("/suche", SearchIcon, labels.search, is("/suche"))}
      {menu ? (
        <UserMenu data={menu} variant="bottom" />
      ) : (
        <Link
          href={loggedIn ? "/willkommen" : "/anmelden"}
          aria-label={loggedIn ? labels.profile : labels.login}
          className="flex flex-1 items-center justify-center py-3 text-cream/75"
        >
          <span aria-hidden className="size-[26px] rounded-full border-2 border-current" />
        </Link>
      )}
    </nav>
  );
}
