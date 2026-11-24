/** Anzeige von Terminzeiten in der Ortszeit des Events (Standard: Deutschland). */

type When = { starts_at: string; ends_at: string; timezone: string | null };

const zone = (e: When) => e.timezone || "Europe/Berlin";

function dayKey(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** z. B. "Sa., 3. Jan. 2027" */
export function eventDay(e: When, locale: string) {
  return new Intl.DateTimeFormat(locale, { timeZone: zone(e), weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(e.starts_at),
  );
}

/** z. B. "Sa., 3. Jan. 2027 · 10:00–18:00" oder bei mehreren Tagen "3. Jan. – 4. Jan. 2027" */
export function eventWhen(e: When, locale: string) {
  const tz = zone(e);
  const time = new Intl.DateTimeFormat(locale, { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  if (dayKey(e.starts_at, tz) === dayKey(e.ends_at, tz)) {
    return `${eventDay(e, locale)} · ${time.format(new Date(e.starts_at))}–${time.format(new Date(e.ends_at))}`;
  }
  const day = new Intl.DateTimeFormat(locale, { timeZone: tz, day: "numeric", month: "short" });
  const year = new Intl.DateTimeFormat(locale, { timeZone: tz, year: "numeric" }).format(new Date(e.ends_at));
  return `${day.format(new Date(e.starts_at))} – ${day.format(new Date(e.ends_at))} ${year}`;
}

/** Kalenderblatt: Tag und Monat */
export function eventSheet(e: When, locale: string) {
  const tz = zone(e);
  const d = new Date(e.starts_at);
  return {
    day: new Intl.DateTimeFormat(locale, { timeZone: tz, day: "numeric" }).format(d),
    month: new Intl.DateTimeFormat(locale, { timeZone: tz, month: "short" }).format(d).replace(".", ""),
  };
}

export const CHECKIN_CODE_PATTERN = /^[a-z0-9]{24,64}$/;
