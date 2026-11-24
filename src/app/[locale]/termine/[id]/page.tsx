import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { ListingCard } from "@/components/listing-card";
import { Link } from "@/i18n/navigation";
import { getMyProfile } from "@/lib/auth";
import { eventSheet, eventWhen } from "@/lib/event-format";
import { ensureEventsFresh, getEvent, getEventListings } from "@/lib/events";
import { PAGE_SIZE } from "@/lib/marketplace";

export async function generateMetadata({ params }: PageProps<"/[locale]/termine/[id]">): Promise<Metadata> {
  const { id } = await params;
  const e = await getEvent(id);
  return { title: e?.name ?? "TRACACON" };
}

const REGULAR_STEPS = [3, 10, 25];

export default async function EventPage({ params, searchParams }: PageProps<"/[locale]/termine/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await connection();
  await ensureEventsFresh();
  const e = await getEvent(id);
  if (!e) notFound();

  const sp = await searchParams;
  const t = await getTranslations("Events");
  const tm = await getTranslations("Market");
  const page = Math.max(1, Number.parseInt(typeof sp.seite === "string" ? sp.seite : "1", 10) || 1);
  const [profile, { items, total }] = await Promise.all([getMyProfile(), getEventListings(id, page, PAGE_SIZE)]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isTeam = profile?.role === "team" || profile?.role === "admin";

  const justChecked = sp.eingecheckt === "neu" || sp.eingecheckt === "schon";
  const visits = Number.parseInt(typeof sp.besuche === "string" ? sp.besuche : "0", 10) || 0;
  const newStep = sp.eingecheckt === "neu" && REGULAR_STEPS.includes(visits) ? visits : null;
  const sheet = eventSheet(e, locale);
  const where = [e.venue, e.address].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      {justChecked && (
        <section role="status" className="card border-ok/50 bg-ok/10 text-center">
          <p aria-hidden className="text-5xl">✓</p>
          <h2 className="mt-2 text-xl font-bold">{sp.eingecheckt === "neu" ? t("checkedInTitle") : t("alreadyCheckedIn")}</h2>
          <p className="text-cream/80">{t("checkedInText", { name: e.name, count: visits })}</p>
          {newStep && <p className="mt-3 font-semibold text-brand">🎖️ {t("newRegularBadge", { count: newStep })}</p>}
          <p className="mt-2 text-sm text-cream/70">{t("checkedInHint")}</p>
        </section>
      )}

      <section className="card space-y-4">
        <div className="flex items-start gap-4">
          <span aria-hidden className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-brand py-2 font-display text-on-brand">
            <span className="text-xs font-bold uppercase">{sheet.month}</span>
            <span className="text-3xl font-black leading-none">{sheet.day}</span>
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">{e.name}</h1>
            {e.subtitle && <p className="text-cream/80">{e.subtitle}</p>}
            <p className="mt-1 text-sm text-cream/70">{eventWhen(e, locale)}</p>
            {where && (
              <a
                className="link block text-sm"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                📍 {where}
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {e.ticket_url && !e.is_past && (
            <a href={e.ticket_url} target="_blank" rel="noopener noreferrer" className="btn-primary">
              🎟️ {t("tickets")}
            </a>
          )}
          {e.website_url && (
            <a href={e.website_url} target="_blank" rel="noopener noreferrer" className="btn-ghost">
              {t("website")}
            </a>
          )}
          {isTeam && (
            <Link href={`/team/termine/${e.id}/aushang`} className="btn-ghost">
              {t("poster")}
            </Link>
          )}
        </div>

        <p className="text-sm text-cream/70">
          {e.checked_in
            ? `✓ ${t("youWereThere")}`
            : e.checkin_open
              ? t("checkinHowTo")
              : e.is_past
                ? t("checkinOver")
                : t("checkinLater")}
          {e.checkin_count > 0 && ` · ${t("checkinCount", { count: e.checkin_count })}`}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">{t("bringing")}</h2>
            <p className="text-sm text-cream/70">{t("bringingIntro")}</p>
          </div>
          {!e.is_past && profile?.nickname && (
            <Link href={{ pathname: "/marktplatz/neu", query: { termin: e.id } }} className="btn-primary">
              + {t("bringCard")}
            </Link>
          )}
        </div>
        <p className="text-sm text-cream/60" role="status">{tm("results", { count: total })}</p>
        {items.length === 0 ? (
          <p className="card text-cream/70">{e.is_past ? t("bringingEmptyPast") : t("bringingEmpty")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <li key={item.id} className="flex"><ListingCard item={item} /></li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <nav className="flex items-center justify-between text-sm" aria-label={tm("page", { page, pages })}>
            {page > 1 ? (
              <Link href={{ pathname: `/termine/${e.id}`, query: page > 2 ? { seite: String(page - 1) } : {} }} className="link">← {tm("prev")}</Link>
            ) : <span />}
            <span className="text-cream/60">{tm("page", { page, pages })}</span>
            {page < pages ? (
              <Link href={{ pathname: `/termine/${e.id}`, query: { seite: String(page + 1) } }} className="link">{tm("next")} →</Link>
            ) : <span />}
          </nav>
        )}
      </section>

      <Link href="/termine" className="link inline-block text-sm">← {t("allEvents")}</Link>
    </div>
  );
}
