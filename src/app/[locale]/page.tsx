import { getTranslations, setRequestLocale } from "next-intl/server";
import { EventCard } from "@/components/event-card";
import { ListingCard } from "@/components/listing-card";
import { Link } from "@/i18n/navigation";
import { getMyProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { ensureEventsFresh, getEvents } from "@/lib/events";
import type { ListingSummary } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";

/** Hallenfoto von der Homepage */
const HERO_IMAGE = "https://www.tracacon.de/web/image/5270/hero-halle.jpg";

async function latestListings(): Promise<ListingSummary[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_listings", { p_limit: 8, p_offset: 0 });
  return (data ?? []) as ListingSummary[];
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const configured = isSupabaseConfigured();
  await ensureEventsFresh();
  const [profile, latest, events] = await Promise.all([getMyProfile(), latestListings(), getEvents(false, 2)]);
  const tEv = await getTranslations("Events");

  return (
    <div className="space-y-8">
      <section
        className="relative -mx-4 -mt-6 overflow-hidden bg-cover bg-center px-4 pb-10 pt-14 sm:mx-0 sm:mt-0 sm:rounded-3xl sm:border sm:border-line sm:px-10 sm:pb-14 sm:pt-20"
        style={{ backgroundImage: `url(${HERO_IMAGE})` }}
      >
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_30%,rgb(34_205_215/0.28),transparent_55%),linear-gradient(180deg,rgb(10_13_17/0.55)_0%,rgb(10_13_17/0.8)_60%,#0a0d11_100%)]"
        />
        <div className="relative space-y-4">
          <p className="kicker">Trade · Card · Convention</p>
          <h1 className="text-4xl font-bold leading-[1.02] sm:text-6xl">
            Collect. <span className="text-brand">Connect.</span> Trade.
          </h1>
          {profile?.nickname && <p className="font-display text-lg">{t("hello", { nickname: profile.nickname })}</p>}
          <p className="max-w-xl text-lg font-light text-cream/75">{t("intro")}</p>
          <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/marktplatz" className="btn-primary">{t("toMarket")}</Link>
          {profile?.nickname ? (
            <Link href="/marktplatz/neu" className="btn-ghost">+ {t("sell")}</Link>
          ) : profile ? (
            <Link href="/willkommen" className="btn-ghost">{t("ctaProfile")}</Link>
          ) : (
            <>
              <Link href="/registrieren" className="btn-ghost">{t("ctaRegister")}</Link>
              <Link href="/anmelden" className="btn-ghost">{t("ctaLogin")}</Link>
            </>
          )}
          </div>
        </div>
      </section>

      {events.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="kicker">{tEv("kicker")}</p>
              <h2 className="text-2xl font-medium">{tEv("next")}</h2>
            </div>
            <Link href="/termine" className="link text-sm">{tEv("allEvents")} →</Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {events.map((e) => (
              <li key={e.id} className="flex">
                <EventCard
                  event={e}
                  locale={locale}
                  labels={{ listings: tEv("listingCount", { count: e.listing_count }), checkedIn: tEv("youWereThere") }}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {latest.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="kicker">{t("latestKicker")}</p>
              <h2 className="text-2xl font-medium">{t("latest")}</h2>
            </div>
            <Link href="/marktplatz" className="link text-sm">{t("toMarket")} →</Link>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {latest.map((item) => (
              <li key={item.id} className="flex"><ListingCard item={item} /></li>
            ))}
          </ul>
        </section>
      )}

      {!configured && <p className="card border-brand/40 text-sm text-brand">{t("notConfigured")}</p>}
    </div>
  );
}
