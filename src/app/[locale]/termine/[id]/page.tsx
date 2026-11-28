/* eslint-disable @next/next/no-img-element -- Titelbild kommt direkt von tracacon.de */
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
import { BrandText } from "@/components/brand-text";
import { EventDealers } from "@/components/event-dealers";
import { ShareButton } from "@/components/share-button";
import { googleCalendarUrl, type DescBlock, type TextPart } from "@/lib/event-details";

export async function generateMetadata({ params }: PageProps<"/[locale]/termine/[id]">): Promise<Metadata> {
  const { id } = await params;
  const e = await getEvent(id);
  const cover = e?.details?.cover_url;
  return { title: e?.name ?? "Tracacon", ...(cover ? { openGraph: { images: [cover] } } : {}) };
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
  const details = e.details ?? {};
  const dealers = details.dealers ?? [];
  const tables = details.tables ?? null;
  // Knöpfe aus der Odoo-Beschreibung, die es oben schon gibt (Tickets), nicht doppelt zeigen
  const isTicketLink = (href?: string) => !!href && (href === e.ticket_url || /eventim/i.test(href));
  const description = (details.description ?? []).filter(
    (b) => !(b.parts.length === 1 && b.parts[0].href && isTicketLink(b.parts[0].href)),
  );
  const box = description.filter((b) => b.box);
  const rest = description.filter((b) => !b.box);
  const calendarEvent = { name: e.name, starts_at: e.starts_at, ends_at: e.ends_at, venue: e.venue, address: e.address, url: e.website_url ?? "" };

  return (
    <div className="space-y-6">
      {justChecked && (
        <section role="status" className="card border-ok/50 bg-ok/10 text-center">
          <p aria-hidden className="text-5xl">✓</p>
          <h2 className="mt-2 text-xl font-bold">{sp.eingecheckt === "neu" ? t("checkedInTitle") : t("alreadyCheckedIn")}</h2>
          <p className="text-cream/80">{t("checkedInText", { name: e.name, count: visits })}</p>
          {newStep && <p className="mt-3 font-semibold text-brand-ink">🎖️ {t("newRegularBadge", { count: newStep })}</p>}
          <p className="mt-2 text-sm text-cream/70">{t("checkedInHint")}</p>
        </section>
      )}

      <section className="card space-y-4 overflow-hidden">
        {details.cover_url && (
          <img
            src={details.cover_url}
            alt=""
            className="-mx-5 -mt-5 aspect-[16/7] w-[calc(100%+2.5rem)] max-w-none object-cover sm:-mx-6 sm:-mt-6 sm:w-[calc(100%+3rem)]"
          />
        )}
        <div className="flex items-start gap-4">
          <span aria-hidden className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-brand py-2 font-display text-on-brand">
            <span className="text-xs font-bold uppercase">{sheet.month}</span>
            <span className="text-3xl font-black leading-none">{sheet.day}</span>
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight"><BrandText text={e.name} /></h1>
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
          {!e.is_past && (
            <>
              <a href={`/${locale}/termine/${e.id}/kalender`} className="btn-ghost">📅 {t("calendarIcs")}</a>
              <a href={googleCalendarUrl(calendarEvent)} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                {t("calendarGoogle")}
              </a>
            </>
          )}
          <ShareButton title={e.name} path={`/termine/${e.id}`} label={t("share")} copied={t("copied")} />
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

      {description.length > 0 && (
        <section className="card space-y-3" aria-label={t("about")}>
          {box.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-brand/40 bg-brand/[0.07] p-4">
              <DescBlocks blocks={box} />
            </div>
          )}
          <DescBlocks blocks={rest} />
        </section>
      )}

      {(dealers.length > 0 || !e.is_past) && (
        <section className="space-y-3" id="haendler">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <span className="kicker">{t("dealersKicker")}</span>
              <h2 className="text-xl font-bold">{t("dealersTitle")}</h2>
            </div>
            {dealers.length > 0 && <span className="text-sm text-cream/60">{t("dealersCount", { count: dealers.length })}</span>}
          </div>
          {tables && tables.total > 0 && !e.is_past && (
            <p className="flex flex-wrap items-center gap-3 text-sm">
              {tables.on_sale && tables.free > 0 ? (
                <>
                  <span className="rounded-full bg-ok/20 px-3 py-1 text-ok">{t("tablesFree", { count: tables.free })}</span>
                  {e.website_url && (
                    <a href={e.website_url} target="_blank" rel="noopener noreferrer" className="link">{t("tablesBook")} →</a>
                  )}
                </>
              ) : (
                <span className="rounded-full bg-tint/10 px-3 py-1 text-cream/80">{t("tablesSoldOut")}</span>
              )}
            </p>
          )}
          {dealers.length > 0 ? (
            <EventDealers
              dealers={dealers}
              labels={{
                all: t("filterAll"),
                filter: t("filterLabel"),
                products: { singles: t("productSingles"), sealed: t("productSealed"), graded: t("productGraded") },
              }}
            />
          ) : (
            <p className="card text-cream/70">{t("dealersSoon")}</p>
          )}
        </section>
      )}

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

function Parts({ parts }: { parts: TextPart[] }) {
  return (
    <>
      {parts.map((p, i) => {
        const text = p.bold ? <b className="font-semibold text-cream">{p.text}</b> : p.text;
        return p.href ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="link">{text}</a>
        ) : (
          <span key={i} className="whitespace-pre-line">{text}</span>
        );
      })}
    </>
  );
}

/** Beschreibung aus Odoo: Überschriften, Absätze und Aufzählungen (nur Text, kein HTML) */
function DescBlocks({ blocks }: { blocks: DescBlock[] }) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "li") {
      const items: DescBlock[] = [];
      while (i < blocks.length && blocks[i].type === "li") items.push(blocks[i++]);
      i--;
      out.push(
        <ul key={i} className="list-disc space-y-1 pl-5 text-sm text-cream/85 marker:text-brand-ink">
          {items.map((li, j) => (
            <li key={j}><Parts parts={li.parts} /></li>
          ))}
        </ul>,
      );
    } else if (b.type === "h") {
      out.push(<h3 key={i} className="pt-1 font-display text-lg font-semibold"><Parts parts={b.parts} /></h3>);
    } else {
      out.push(<p key={i} className="text-sm leading-relaxed text-cream/85"><Parts parts={b.parts} /></p>);
    }
  }
  return <>{out}</>;
}
