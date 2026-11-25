import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getMyProfile } from "@/lib/auth";
import { touchPresence, unreadNotificationCount } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "./bottom-nav";
import { CreateMenu } from "./create-menu";
import { HeartIcon } from "./icons";
import { LanguageSwitch } from "./language-switch";
import { PresencePing } from "./presence-ping";
import { UserMenu, type UserMenuData } from "./user-menu";

async function unreadMessages(onboarded: boolean) {
  if (!onboarded) return 0;
  const supabase = await createClient();
  const { data } = await supabase.rpc("unread_message_count");
  return Number(data ?? 0);
}

async function pendingRequests(onboarded: boolean) {
  if (!onboarded) return 0;
  const supabase = await createClient();
  const { data } = await supabase.rpc("pending_follow_request_count");
  return Number(data ?? 0);
}

async function openReports(isTeam: boolean) {
  if (!isTeam) return 0;
  const supabase = await createClient();
  const { data } = await supabase.rpc("open_report_count");
  return Number(data ?? 0);
}

const LOGO_URL = "https://www.tracacon.de/web/image/website/1/logo/TRACACON"; // Dateiname der Bildadresse bei Odoo, wird nicht angezeigt

export async function SiteHeader() {
  const t = await getTranslations("Nav");
  const profile = await getMyProfile();
  const isTeam = profile?.role === "team" || profile?.role === "admin";
  const onboarded = Boolean(profile?.nickname);
  const [reports, unread, requests, notes] = await Promise.all([
    openReports(isTeam),
    unreadMessages(onboarded),
    pendingRequests(onboarded),
    onboarded ? unreadNotificationCount() : 0,
    onboarded ? touchPresence() : undefined,
  ]);
  // Offene Anfragen stehen auch als Benachrichtigung in der Liste; die größere Zahl zählt
  const activity = Math.max(notes, requests);
  const menu: UserMenuData | null =
    profile && profile.nickname
      ? {
          id: profile.id,
          nickname: profile.nickname,
          avatarId: profile.avatar_id,
          role: profile.role,
          unread,
          requests: activity,
          reports,
          labels: {
            menu: t("menu"),
            myProfile: t("myProfile"),
            myListings: t("myListings"),
            messages: t("messages"),
            followers: t("followers"),
            following: t("following"),
            requests: t("requests"),
            badges: t("badges"),
            settings: t("settings"),
            moderation: t("moderation"),
            teamEvents: t("teamEvents"),
            admin: t("admin"),
            logout: t("logout"),
            profile: t("profile"),
            close: t("close"),
          },
        }
      : null;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-black/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <Link href="/" className="shrink-0" aria-label="Tracacon">
            {/* Logo direkt von der Homepage, damit es immer gleich aussieht */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt="Tracacon" width={112} height={32} className="h-8 w-auto" />
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
            <Link href="/termine" className="hidden rounded-lg px-2 py-1.5 font-display text-[13px] font-medium uppercase tracking-wider text-cream/85 hover:text-brand sm:inline">
              {t("events")}
            </Link>
            <Link href="/marktplatz" className="hidden rounded-lg px-2 py-1.5 font-display text-[13px] font-medium uppercase tracking-wider text-cream/85 hover:text-brand sm:inline">
              {t("market")}
            </Link>
            <Link href="/suche" className="hidden rounded-lg px-2 py-1.5 font-display text-[13px] font-medium uppercase tracking-wider text-cream/85 hover:text-brand sm:inline">
              {t("search")}
            </Link>
            {onboarded && (
              <Link href="/nachrichten" className="hidden rounded-lg px-2 py-1.5 font-display text-[13px] font-medium uppercase tracking-wider text-cream/85 hover:text-brand sm:inline">
                {t("messages")}
                {unread > 0 && (
                  <span className="ml-1 rounded-full bg-brand px-1.5 py-0.5 text-xs font-bold text-night">{unread}</span>
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
                  close: t("close"),
                }}
              />
            )}
            {onboarded && (
              <Link
                href="/aktivitaet"
                aria-label={activity > 0 ? t("activityCount", { count: activity }) : t("activity")}
                className="relative rounded-lg p-1.5 text-cream hover:text-brand"
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
              <Link href="/moderation" className="relative rounded-lg px-2 py-1.5 hover:bg-white/5" aria-label={t("moderation")}>
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
              <Link href="/willkommen" className="rounded-lg px-2 py-1.5 hover:bg-white/5">
                {t("profile")}
              </Link>
            ) : (
              <>
                <Link href="/registrieren" className="hidden rounded-lg px-2 py-1.5 font-display text-[13px] font-medium uppercase tracking-wider text-cream/85 hover:text-brand sm:inline">
                  {t("register")}
                </Link>
                <Link href="/anmelden" className="btn-primary px-3 py-1.5">
                  {t("login")}
                </Link>
              </>
            )}
            <LanguageSwitch label={t("language")} />
          </nav>
        </div>
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
