import { NextResponse, type NextRequest } from "next/server";
import { icsFile } from "@/lib/event-details";
import { getEvent } from "@/lib/events";
import { routing } from "@/i18n/routing";

/** Kalenderdatei (.ics) zum Termin: öffnet sich auf dem Handy direkt im Kalender. */
export async function GET(request: NextRequest, ctx: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: rawLocale, id } = await ctx.params;
  const locale = (routing.locales as readonly string[]).includes(rawLocale) ? rawLocale : routing.defaultLocale;
  const e = await getEvent(id);
  if (!e) return new NextResponse("Nicht gefunden", { status: 404 });
  const url = `${request.nextUrl.origin}/${locale}/termine/${e.id}`;
  const body = icsFile({ id: e.id, name: e.name, starts_at: e.starts_at, ends_at: e.ends_at, venue: e.venue, address: e.address, url });
  const file = e.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "termin";
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file)}.ics"; filename*=UTF-8''${encodeURIComponent(file)}.ics`,
      "Cache-Control": "no-store",
    },
  });
}
