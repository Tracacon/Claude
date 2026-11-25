import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import QRCode from "qrcode";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth";
import { eventWhen } from "@/lib/event-format";
import { getEvent } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { PosterActions } from "./poster-actions";
import { PosterExport } from "./poster-export";

export async function generateMetadata({ params }: PageProps<"/[locale]/team/termine/[id]/aushang">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Events" });
  return { title: t("poster"), robots: { index: false } };
}

/** Adresse der App, unter der der Aushang aufgerufen wurde */
async function appOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Dateiname aus dem Termin-Namen */
function slug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "termin"
  );
}

export default async function PosterPage({ params }: PageProps<"/[locale]/team/termine/[id]/aushang">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireRole("team", "admin");
  const e = await getEvent(id);
  if (!e) notFound();
  const t = await getTranslations("Events");

  const supabase = await createClient();
  const { data: code, error } = await supabase.rpc("team_checkin_code", { p_event: id, p_renew: false });
  if (error || !code) {
    console.error("team_checkin_code", error?.message);
    notFound();
  }
  const url = `${await appOrigin()}/checkin/${code as string}`;
  const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#000000", light: "#ffffff" } });

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <Link href="/team/termine" className="link text-sm">← {t("teamTitle")}</Link>
        <p className="mt-2 text-sm text-cream/70">{t("posterIntro")}</p>
      </div>
      <PosterActions eventId={id} />
      <PosterExport
        url={url}
        fileName={`tracacon-checkin-${slug(e.name)}`}
        text={[
          t("posterHeadline"),
          `${e.name} · ${eventWhen(e, locale)}`,
          "",
          `1. ${t("posterStep1")}`,
          `2. ${t("posterStep2")}`,
          `3. ${t("posterStep3")}`,
          "",
          t("exportTextWindow"),
        ].join("\n")}
      />

      <article className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center text-black print:max-w-none print:rounded-none print:p-0">
        <p className="text-sm font-bold uppercase tracking-[0.3em]">TRACACON</p>
        <h1 className="mt-2 text-3xl font-black">{t("posterHeadline")}</h1>
        <p className="mt-1 text-lg">{e.name}</p>
        <p className="text-sm text-neutral-600">{eventWhen(e, locale)}</p>
        <div
          role="img"
          aria-label={t("posterQr")}
          className="mx-auto my-6 w-full max-w-sm [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <ol className="mx-auto max-w-sm space-y-1 text-left text-base">
          <li>1. {t("posterStep1")}</li>
          <li>2. {t("posterStep2")}</li>
          <li>3. {t("posterStep3")}</li>
        </ol>
        <p className="mt-6 break-all text-xs text-neutral-500" data-testid="checkin-url">{url}</p>
      </article>
    </div>
  );
}
