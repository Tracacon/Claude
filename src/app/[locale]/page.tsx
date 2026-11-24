import { getTranslations, setRequestLocale } from "next-intl/server";
import { EventCard } from "@/components/event-card";
import { ListingCard } from "@/components/listing-card";
import { Link } from "@/i18n/navigation";
import { getMyProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { ensureEventsFresh, getEvents } from "@/lib/events";
import type { ListingSummary } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";

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
      <section className="space-y-3 pt-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber">TRACACON</p>
        <h1 className="text-4xl font-black leading-tight sm:text-5xl">{t("claim")}</h1>
        {profile?.nickname && <p className="text-lg">{t("hello", { nickname: profile.nickname })}</p>}
        <p className="max-w-2xl text-cream/80">{t("intro")}</p>
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
      </section>

      {events.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-xl font-bold">{tEv("next")}</h2>
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
            <h2 className="text-xl font-bold">{t("latest")}</h2>
            <Link href="/marktplatz" className="link text-sm">{t("toMarket")} →</Link>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {latest.map((item) => (
              <li key={item.id} className="flex"><ListingCard item={item} /></li>
            ))}
          </ul>
        </section>
      )}

      <p className="card text-sm text-cream/70">{t("status")}</p>
      {!configured && <p className="card border-amber/40 text-sm text-amber">{t("notConfigured")}</p>}
    </div>
  );
}
