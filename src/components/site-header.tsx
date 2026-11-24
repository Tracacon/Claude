import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getMyProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "./bottom-nav";
import { LanguageSwitch } from "./language-switch";
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

export async function SiteHeader() {
  const t = await getTranslations("Nav");
  const profile = await getMyProfile();
  const isTeam = profile?.role === "team" || profile?.role === "admin";
  const onboarded = Boolean(profile?.nickname);
  const [reports, unread, requests] = await Promise.all([
    openReports(isTeam),
    unreadMessages(onboarded),
    pendingRequests(onboarded),
  ]);
  const menu: UserMenuData | null =
    profile && profile.nickname
      ? {
          id: profile.id,
          nickname: profile.nickname,
          avatarId: profile.avatar_id,
          role: profile.role,
          unread,
          requests,
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
            admin: t("admin"),
            logout: t("logout"),
            profile: t("profile"),
            close: t("close"),
          },
        }
      : null;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-white/10 bg-night/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/" className="text-lg font-black tracking-wider text-amber">
            TRACACON
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
            <Link href="/marktplatz" className="hidden rounded-lg px-2 py-1.5 hover:bg-white/5 sm:inline">
              {t("market")}
            </Link>
            {onboarded && (
              <Link href="/marktplatz/neu" className="hidden rounded-lg px-2 py-1.5 hover:bg-white/5 sm:inline">
                {t("sell")}
              </Link>
            )}
            {onboarded && (
              <Link href="/nachrichten" className="hidden rounded-lg px-2 py-1.5 hover:bg-white/5 sm:inline">
                {t("messages")}
                {unread > 0 && (
                  <span className="ml-1 rounded-full bg-amber px-1.5 py-0.5 text-xs font-bold text-night">{unread}</span>
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
                <Link href="/registrieren" className="hidden rounded-lg px-2 py-1.5 hover:bg-white/5 sm:inline">
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
      <BottomNav
        loggedIn={Boolean(profile)}
        onboarded={onboarded}
        unread={unread}
        menu={menu}
        labels={{
          home: t("home"),
          market: t("market"),
          sell: t("sell"),
          messages: t("messages"),
          profile: t("profile"),
          login: t("login"),
        }}
      />
    </>
  );
}
