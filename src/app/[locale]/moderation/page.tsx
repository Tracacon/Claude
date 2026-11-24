import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth";
import type { ListingStatus, ReportReason } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";
import { ReportActions } from "./report-actions";

type OpenReport = {
  id: string;
  reason: ReportReason;
  details: string | null;
  created_at: string;
  reporter_nickname: string | null;
  listing_id: string | null;
  listing_title: string | null;
  listing_status: ListingStatus | null;
  listing_owner_nickname: string | null;
  profile_id: string | null;
  profile_nickname: string | null;
  conversation_id: string | null;
  conversation_title: string | null;
  total_count: number;
};

export async function generateMetadata({ params }: PageProps<"/[locale]/moderation">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Moderation" });
  return { title: t("title") };
}

export default async function ModerationPage({ params }: PageProps<"/[locale]/moderation">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole("team", "admin");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_open_reports", { p_limit: 100, p_offset: 0 });
  const reports = (data ?? []) as OpenReport[];

  const t = await getTranslations("Moderation");
  const tReason = await getTranslations("ReportReason");
  const tStatus = await getTranslations("Status");
  const format = await getFormatter();
  const total = reports[0] ? Number(reports[0].total_count) : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-cream/70">{t("intro")}</p>
        {total > 0 && <p className="mt-1 text-sm font-semibold text-brand">{t("openCount", { count: total })}</p>}
      </div>
      {error && <p className="error">{error.message}</p>}
      {reports.length === 0 ? (
        <p className="card text-cream/70">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="card space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-danger/15 px-2.5 py-1 font-semibold text-danger">{tReason(r.reason)}</span>
                <span className="rounded-full bg-white/10 px-2.5 py-1">
                  {r.listing_id ? t("listing") : r.conversation_id ? t("conversation") : t("profile")}
                </span>
                <span className="text-cream/50">
                  {t("reportedBy", {
                    nickname: r.reporter_nickname ?? "?",
                    date: format.dateTime(new Date(r.created_at), { dateStyle: "short", timeStyle: "short" }),
                  })}
                </span>
              </div>
              {r.listing_id ? (
                <p>
                  <Link href={`/marktplatz/${r.listing_id}`} className="font-semibold hover:underline">
                    {r.listing_title ?? t("listingGone")}
                  </Link>
                  {r.listing_owner_nickname && (
                    <span className="text-sm text-cream/60"> · {t("by", { nickname: `@${r.listing_owner_nickname}` })}</span>
                  )}
                  {r.listing_status && r.listing_status !== "active" && (
                    <span className="ml-2 text-xs text-cream/60">({tStatus(r.listing_status)})</span>
                  )}
                </p>
              ) : r.conversation_id ? (
                <p>
                  <Link href={`/moderation/unterhaltung/${r.conversation_id}`} className="font-semibold hover:underline">
                    {t("readConversation")}: {r.conversation_title}
                  </Link>
                </p>
              ) : (
                <p>
                  {r.profile_nickname ? (
                    <Link href={`/u/${r.profile_nickname}`} className="font-semibold hover:underline">@{r.profile_nickname}</Link>
                  ) : (
                    <span className="text-cream/60">?</span>
                  )}
                </p>
              )}
              <div className="rounded-xl bg-night-3 p-3 text-sm">
                <span className="text-cream/60">{t("details")}: </span>
                <span className="whitespace-pre-line">{r.details ?? t("none")}</span>
              </div>
              <ReportActions
                reportId={r.id}
                listingId={r.listing_id && r.listing_status !== "removed" ? r.listing_id : null}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
