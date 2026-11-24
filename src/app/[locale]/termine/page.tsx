import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { EventCard } from "@/components/event-card";
import { FormError } from "@/components/form-error";
import { ensureEventsFresh, getEvents } from "@/lib/events";

export async function generateMetadata({ params }: PageProps<"/[locale]/termine">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Events" });
  return { title: t("title"), description: t("intro") };
}

export default async function EventsPage({ params, searchParams }: PageProps<"/[locale]/termine">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await connection();
  const sp = await searchParams;
  const t = await getTranslations("Events");
  await ensureEventsFresh();
  const [upcoming, past] = await Promise.all([getEvents(false), getEvents(true, 20)]);
  const checkinError = typeof sp.checkin === "string" ? sp.checkin : null;
  const labels = (n: number, checked: boolean) => ({
    listings: t("listingCount", { count: n }),
    checkedIn: checked ? t("youWereThere") : "",
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-cream/70">{t("intro")}</p>
      </div>

      {checkinError && (
        <div className="card border-danger/40">
          <p className="font-semibold">{t("checkinFailed")}</p>
          <FormError code={checkinError} />
        </div>
      )}

      {upcoming.length === 0 ? (
        <p className="card text-cream/70">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {upcoming.map((e) => (
            <li key={e.id} className="flex">
              <EventCard event={e} locale={locale} labels={labels(e.listing_count, e.checked_in)} />
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <details className="space-y-3">
          <summary className="cursor-pointer text-sm text-cream/70">{t("past", { count: past.length })}</summary>
          <ul className="mt-3 space-y-3 opacity-80">
            {past.map((e) => (
              <li key={e.id} className="flex">
                <EventCard event={e} locale={locale} labels={labels(0, e.checked_in)} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
