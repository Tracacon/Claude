import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getNewMembers, touchPresence } from "@/lib/notifications";
import { getUserMenu } from "@/lib/user-menu-data";
import { BackButton } from "./back-button";
import { BottomNav } from "./bottom-nav";
import { NavTracker } from "./nav-tracker";
import { CreateMenu } from "./create-menu";
import { HeartIcon } from "./icons";
import { LanguageSwitch } from "./language-switch";
import { ThemeToggle } from "./theme-toggle";
import { PresencePing } from "./presence-ping";
import { NewMembersBar } from "./feed/new-members-bar";
import { UserMenu } from "./user-menu";

const LOGO_URL = "https://www.tracacon.de/web/image/website/1/logo/TRACACON"; // Dateiname der Bildadresse bei Odoo, wird nicht angezeigt

export async function SiteHeader() {
  const t = await getTranslations("Nav");
  const { profile, onboarded, isTeam, reports, unread, activity, menu } = await getUserMenu();
  const [newMembers] = await Promise.all([getNewMembers(50), onboarded ? touchPresence() : undefined]);

  return (
    <>
      <NavTracker />
      <header className="sticky top-0 z-20 border-b border-line bg-base/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
          <BackButton label={t("back")} />
          <Link href="/" className="shrink-0" aria-label="Tracacon">
            {/* Logo direkt von der Homepage, damit es immer gleich aussieht */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt="Tracacon" width={112} height={32} className="h-8 w-auto" />
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
            <Link href="/termine" className="hidden rounded-lg px-2 py-1.5 font-display text-[13px] font-medium uppercase tracking-wider text-cream/85 hover:text-brand-ink sm:inline">
              {t("events")}
            </Link>
            <Link href="/marktplatz" className="hidden rounded-lg px-2 py-1.5 font-display text-[13px] font-medium uppercase tracking-wider text-cream/85 hover:text-brand-ink sm:inline">
              {t("market")}
            </Link>
            <Link href="/suche" className="hidden rounded-lg px-2 py-1.5 font-display text-[13px] font-medium uppercase tracking-wider text-cream/85 hover:text-brand-ink sm:inline">
              {t("search")}
            </Link>
            {onboarded && (
              <Link href="/nachrichten" className="hidden rounded-lg px-2 py-1.5 font-display text-[13px] font-medium uppercase tracking-wider text-cream/85 hover:text-brand-ink sm:inline">
                {t("messages")}
                {unread > 0 && (
                  <span className="ml-1 rounded-full bg-brand px-1.5 py-0.5 text-xs font-bold text-on-brand">{unread}</span>
                )}
              </Link>
            )}
            {onboarded && (
              <CreateMenu
                labels={{
                  create: t("create"),
                  post: t("createPost"),
                  postHint: t("createPostHint"),
                  listing: t("createListing"),
                  listingHint: t("createListingHint"),
                  collection: t("createCollection"),
                  collectionHint: t("createCollectionHint"),
                  close: t("close"),
                }}
              />
            )}
            {onboarded && (
              <Link
                href="/aktivitaet"
                aria-label={activity > 0 ? t("activityCount", { count: activity }) : t("activity")}
                className="relative rounded-lg p-1.5 text-cream hover:text-brand-ink"
              >
                <HeartIcon className="size-[26px]" />
                {activity > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-danger px-1 text-center text-xs font-bold leading-5 text-white">
                    {activity > 99 ? "99+" : activity}
                  </span>
                )}
              </Link>
            )}
            {isTeam && (
              <Link href="/moderation" className="relative rounded-lg px-2 py-1.5 hover:bg-tint/5" aria-label={t("moderation")}>
                <span className="hidden sm:inline">{t("moderation")}</span>
                <span className="sm:hidden" aria-hidden>⚑</span>
                {reports > 0 && (
                  <span className="ml-1 rounded-full bg-danger px-1.5 py-0.5 text-xs font-bold text-white">{reports}</span>
                )}
              </Link>
            )}
            {menu ? (
              <UserMenu data={menu} variant="header" />
            ) : profile ? (
              <Link href="/willkommen" className="rounded-lg px-2 py-1.5 hover:bg-tint/5">
                {t("profile")}
              </Link>
            ) : (
              <>
                <Link href="/registrieren" className="hidden rounded-lg px-2 py-1.5 font-display text-[13px] font-medium uppercase tracking-wider text-cream/85 hover:text-brand-ink sm:inline">
                  {t("register")}
                </Link>
                <Link href="/anmelden" className="btn-primary px-3 py-1.5">
                  {t("login")}
                </Link>
              </>
            )}
            <ThemeToggle labels={{ toLight: t("themeLight"), toDark: t("themeDark") }} />
            <LanguageSwitch label={t("language")} />
          </nav>
        </div>
        <NewMembersBar people={newMembers} />
      </header>
      {onboarded && <PresencePing />}
      <BottomNav
        loggedIn={Boolean(profile)}
        onboarded={onboarded}
        unread={unread}
        menu={menu}
        labels={{
          home: t("home"),
          market: t("market"),
          messages: t("messages"),
          search: t("search"),
          profile: t("profile"),
          login: t("login"),
        }}
      />
    </>
  );
}
