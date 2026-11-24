import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { PENDING_CHECKIN_COOKIE, runCheckin } from "@/lib/checkin";
import { CHECKIN_CODE_PATTERN } from "@/lib/event-format";
import { getMyProfile } from "@/lib/auth";

/**
 * Ziel des QR-Aushangs am Eingang: /checkin/<code>.
 * Angemeldet → sofort einchecken und zur Terminseite mit Bestätigung.
 * Nicht angemeldet → Code merken, anmelden oder registrieren, danach geht es automatisch weiter.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ locale: string; code: string }> }) {
  const { locale: rawLocale, code: rawCode } = await ctx.params;
  const locale = (routing.locales as readonly string[]).includes(rawLocale) ? rawLocale : routing.defaultLocale;
  const code = rawCode.toLowerCase();
  // Relativ weiterleiten, damit der Hostname genau so bleibt, wie er aufgerufen wurde
  const to = (path: string) => new NextResponse(null, { status: 303, headers: { Location: `/${locale}${path}` } });

  if (!CHECKIN_CODE_PATTERN.test(code)) return to("/termine?checkin=checkin_invalid");

  const profile = await getMyProfile();
  if (!profile || !profile.nickname) {
    const res = to(profile ? "/willkommen?checkin=1" : "/anmelden?checkin=1");
    res.cookies.set(PENDING_CHECKIN_COOKIE, code, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 6,
    });
    return res;
  }

  return to(await runCheckin(code));
}
