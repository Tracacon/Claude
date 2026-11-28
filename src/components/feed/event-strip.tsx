import { Link } from "@/i18n/navigation";
import { eventSheet } from "@/lib/event-format";
import type { EventSummary } from "@/lib/events";

/** Termine als runde Kacheln oben im Feed, wie die Story-Leiste bei Instagram */
export function EventStrip({ events, locale, allLabel }: { events: EventSummary[]; locale: string; allLabel: string }) {
  return (
    <nav aria-label={allLabel} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex gap-4 pb-1">
        {events.map((e) => {
          const s = eventSheet(e, locale);
          return (
            <li key={e.id} className="w-[72px] shrink-0">
              <Link href={`/termine/${e.id}`} className="flex flex-col items-center gap-1.5 text-center">
                <span className={`rounded-full p-[2.5px] ${e.checked_in ? "bg-tint/25" : "bg-gradient-to-tr from-brand via-brand-light to-brand"}`}>
                  <span className="flex size-[62px] flex-col items-center justify-center rounded-full border-[3px] border-night bg-night-2 font-display leading-none">
                    <span className="text-[10px] font-bold uppercase text-brand-ink">{s.month}</span>
                    <span className="text-xl font-bold">{s.day}</span>
                  </span>
                </span>
                <span className="line-clamp-1 w-full text-xs text-cream/80">{e.city ?? e.name}</span>
              </Link>
            </li>
          );
        })}
        <li className="w-[72px] shrink-0">
          <Link href="/termine" className="flex flex-col items-center gap-1.5 text-center">
            <span className="flex size-[67px] items-center justify-center rounded-full border border-dashed border-cream/30 text-2xl text-cream/70">→</span>
            <span className="text-xs text-cream/80">{allLabel}</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
