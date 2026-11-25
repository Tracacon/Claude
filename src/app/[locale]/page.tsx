import { getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { FeedList } from "@/components/feed/feed-list";
import { EventStrip } from "@/components/feed/event-strip";
import { NewMembersBar } from "@/components/feed/new-members-bar";
import { OnlineStrip } from "@/components/feed/online-strip";
import { PushSettings } from "@/components/push-settings";
import { Link } from "@/i18n/navigation";
import { getMyProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { ensureEventsFresh, getEvents } from "@/lib/events";
import { FEED_PAGE, getFeed } from "@/lib/feed";
import { ensureInstagramFresh } from "@/lib/instagram";
import { getNewMembers, getOnlineContacts } from "@/lib/notifications";
import { isPushConfigured } from "@/lib/push";

/** Startseite = Feed wie bei Instagram */
export default async function FeedPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await connection();
  const t = await getTranslations("Feed");
  const tHome = await getTranslations("Home");
  const configured = isSupabaseConfigured();
  await Promise.all([ensureEventsFresh(), ensureInstagramFresh()]);
  const [profile, events, items] = await Promise.all([getMyProfile(), getEvents(false, 12), getFeed()]);
  const loggedIn = Boolean(profile?.nickname);
  const [online, newMembers] = await Promise.all([loggedIn ? getOnlineContacts() : [], getNewMembers()]);
  const isTeam = profile?.role === "team" || profile?.role === "admin";

  return (
    <div className="mx-auto max-w-[470px] space-y-5">
      <h1 className="sr-only">{t("title")}</h1>

      {!profile && (
        <section className="card space-y-3 bg-[radial-gradient(ellipse_at_10%_0%,rgb(34_205_215/0.22),transparent_60%)]">
          <p className="kicker">Trade · Card · Convention</p>
          <p className="font-display text-2xl font-bold leading-tight">
            Trading · <span className="text-brand">Dealing</span> · Connecting
          </p>
          <p className="text-sm text-cream/75">{tHome("intro")}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/registrieren" className="btn-primary">{tHome("ctaRegister")}</Link>
            <Link href="/anmelden" className="btn-ghost">{tHome("ctaLogin")}</Link>
          </div>
        </section>
      )}
      {profile && !profile.nickname && (
        <Link href="/willkommen" className="card block text-sm text-brand">{tHome("ctaProfile")} →</Link>
      )}

      {loggedIn && <PushSettings available={isPushConfigured()} compact />}

      <NewMembersBar people={newMembers} />

      {events.length > 0 && <EventStrip events={events} locale={locale} allLabel={t("allEvents")} />}

      <OnlineStrip people={online} />

      {items.length === 0 ? (
        <section className="card space-y-3 text-center">
          <p className="font-display text-lg font-semibold">{t("emptyTitle")}</p>
          <p className="text-sm text-cream/70">{t("emptyText")}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/suche" className="btn-ghost">{t("findPeople")}</Link>
            {loggedIn && <Link href="/beitrag/neu" className="btn-primary">{t("firstPost")}</Link>}
          </div>
        </section>
      ) : (
        <div className="-mx-4 sm:mx-0">
          <FeedList initial={items} loggedIn={loggedIn} isTeam={isTeam} pageSize={FEED_PAGE} />
        </div>
      )}

      {!configured && <p className="card border-brand/40 text-sm text-brand">{tHome("notConfigured")}</p>}
    </div>
  );
}
