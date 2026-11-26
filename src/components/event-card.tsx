/* eslint-disable @next/next/no-img-element -- Titelbild kommt direkt von tracacon.de */
import { Link } from "@/i18n/navigation";
import { eventSheet, eventWhen } from "@/lib/event-format";

type CardEvent = {
  id: string;
  name: string;
  subtitle?: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string | null;
  venue?: string | null;
  city: string | null;
  listing_count?: number;
  checked_in?: boolean;
  cover_url?: string | null;
  dealer_count?: number;
};

/** Termin als Karte mit Kalenderblatt */
export function EventCard({
  event,
  locale,
  labels,
}: {
  event: CardEvent;
  locale: string;
  labels: { listings: string; checkedIn: string; dealers?: string; tables?: string };
}) {
  const sheet = eventSheet(event, locale);
  return (
    <Link href={`/termine/${event.id}`} className="card card-hover relative flex w-full items-center gap-4 overflow-hidden p-4">
      {event.cover_url && (
        <img src={event.cover_url} alt="" aria-hidden className="pointer-events-none absolute inset-0 size-full object-cover opacity-20" loading="lazy" />
      )}
      <span aria-hidden className="relative flex w-14 shrink-0 flex-col items-center rounded-xl bg-brand py-1.5 font-display text-on-brand">
        <span className="text-xs font-bold uppercase">{sheet.month}</span>
        <span className="text-2xl font-black leading-none">{sheet.day}</span>
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block font-display text-lg font-medium leading-snug">{event.name}</span>
        <span className="block text-sm text-cream/70">{eventWhen(event, locale)}</span>
        {(event.venue || event.city) && (
          <span className="block truncate text-sm text-cream/60">{[event.venue, event.city].filter(Boolean).join(" · ")}</span>
        )}
        <span className="mt-1 flex flex-wrap gap-2 text-xs">
          {event.listing_count ? (
            <span className="rounded-full bg-white/10 px-2 py-0.5">🃏 {labels.listings}</span>
          ) : null}
          {event.dealer_count && labels.dealers ? (
            <span className="rounded-full bg-white/10 px-2 py-0.5">🏪 {labels.dealers}</span>
          ) : null}
          {labels.tables && <span className="rounded-full bg-white/10 px-2 py-0.5">{labels.tables}</span>}
          {event.checked_in && <span className="rounded-full bg-ok/20 px-2 py-0.5 text-ok">✓ {labels.checkedIn}</span>}
        </span>
      </span>
    </Link>
  );
}
