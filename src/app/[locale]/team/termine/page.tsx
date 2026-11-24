import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth";
import { eventDay } from "@/lib/event-format";
import { getSyncState, isEventSyncConfigured } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { SyncButton } from "./sync-button";

type Row = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  city: string | null;
  published: boolean;
  has_code: boolean;
  checkin_count: number;
};

export async function generateMetadata({ params }: PageProps<"/[locale]/team/termine">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Events" });
  return { title: t("teamTitle") };
}

export default async function TeamEventsPage({ params }: PageProps<"/[locale]/team/termine">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole("team", "admin");
  const t = await getTranslations("Events");
  const format = await getFormatter();

  const supabase = await createClient();
  const [{ data, error }, sync] = await Promise.all([supabase.rpc("team_event_overview"), getSyncState()]);
  if (error) console.error("team_event_overview", error.message);
  const rows = (data ?? []) as Row[];
  const configured = isEventSyncConfigured();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("teamTitle")}</h1>
        <p className="text-sm text-cream/70">{t("teamIntro")}</p>
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold">{t("syncTitle")}</h2>
        {!configured && <p className="text-sm text-brand">{t("syncNotConfigured")}</p>}
        <p className="text-sm text-cream/70">
          {sync.synced_at
            ? t("syncLast", { when: format.dateTime(new Date(sync.synced_at), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }) })
            : t("syncNever")}
        </p>
        {sync.error && <p className="error">{t("syncError", { error: sync.error })}</p>}
        {configured && <SyncButton />}
      </section>

      {rows.length === 0 ? (
        <p className="card text-cream/70">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <Link href={`/termine/${r.id}`} className="font-semibold hover:text-brand">{r.name}</Link>
                <p className="text-sm text-cream/70">
                  {eventDay({ ...r, timezone: null }, locale)}
                  {r.city ? ` · ${r.city}` : ""}
                  {!r.published && ` · ${t("hidden")}`}
                </p>
                <p className="text-sm text-cream/60">{t("checkinCount", { count: Number(r.checkin_count) })}</p>
              </div>
              <Link href={`/team/termine/${r.id}/aushang`} className="btn-ghost">
                {r.has_code ? t("poster") : t("posterCreate")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
