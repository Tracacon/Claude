import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Pair = { week: number; prev: number };
type Stats = {
  generated_at: string;
  members: { total: number } & Pair;
  active: { week: number; today: number; now: number };
  listings: { active: number; done: number } & Pair;
  posts: Pair;
  comments: Pair;
  likes: Pair;
  messages: Pair;
  chats: Pair;
  follows: Pair;
  reports_open: number;
  push_users: number;
  members_weekly: { week: string; count: number }[];
  games: { tcg: string; count: number }[];
  offers: Record<string, number>;
  events: { name: string; starts_at: string; checkins: number }[];
};

export async function generateMetadata({ params }: PageProps<"/[locale]/team/zahlen">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Stats" });
  return { title: t("title") };
}

/** Veränderung zur Vorwoche als kleiner farbiger Hinweis. */
function Trend({ week, prev, label }: Pair & { label: (n: string) => string }) {
  if (week === prev) return <span className="text-xs text-cream/50">{label("±0")}</span>;
  const up = week > prev;
  const diff = `${up ? "+" : "−"}${Math.abs(week - prev)}`;
  return <span className={`text-xs font-semibold ${up ? "text-brand" : "text-danger"}`}>{label(diff)}</span>;
}

function Tile({ title, value, hint, children }: { title: string; value: number; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="card space-y-1 p-4">
      <p className="text-xs uppercase tracking-wide text-cream/60">{title}</p>
      <p className="text-3xl font-black tabular-nums">{value}</p>
      {hint && <p className="text-xs text-cream/60">{hint}</p>}
      {children}
    </div>
  );
}

/** Waagrechte Balken (z. B. Inserate je Spiel). */
function Bars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2 text-sm">
          <span className="truncate text-cream/80">{r.label}</span>
          <span className="h-3 rounded-full bg-white/5">
            <span className="block h-3 rounded-full bg-brand" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function TeamStatsPage({ params }: PageProps<"/[locale]/team/zahlen">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole("team", "admin");
  const [t, tTcg, tOffer, format] = await Promise.all([
    getTranslations("Stats"),
    getTranslations("Tcg"),
    getTranslations("Offer"),
    getFormatter(),
  ]);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_stats");
  if (error || !data) {
    console.error("team_stats", error?.message);
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="card text-brand">{t("unavailable")}</p>
      </div>
    );
  }
  const s = data as Stats;
  const vs = (n: string) => t("vsPrev", { n });
  const weekly = s.members_weekly;
  const maxWeek = Math.max(1, ...weekly.map((w) => Number(w.count)));
  const offerKeys = ["sell", "trade", "sell_or_trade", "gift"] as const;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-cream/70">
          {t("intro", {
            when: format.dateTime(new Date(s.generated_at), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }),
          })}
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("community")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile title={t("members")} value={s.members.total} hint={t("newThisWeek", { n: s.members.week })}>
            <Trend week={s.members.week} prev={s.members.prev} label={vs} />
          </Tile>
          <Tile title={t("activeWeek")} value={s.active.week} hint={t("activeToday", { n: s.active.today, now: s.active.now })} />
          <Tile title={t("follows")} value={s.follows.week} hint={t("last7")}>
            <Trend {...s.follows} label={vs} />
          </Tile>
          <Tile title={t("pushUsers")} value={s.push_users} hint={t("pushHint")} />
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">{t("weeklyTitle")}</h2>
        <div className="flex h-36 items-end gap-1" role="img" aria-label={t("weeklyTitle")}>
          {weekly.map((w, i) => (
            <div key={w.week} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] tabular-nums text-cream/70">{Number(w.count) || ""}</span>
              <span
                className="w-full rounded-t bg-brand"
                style={{ height: `${Math.max(2, (Number(w.count) / maxWeek) * 100)}%`, opacity: Number(w.count) ? 1 : 0.25 }}
              />
              {/* Datum nur an jeder zweiten Säule, sonst wird es auf dem Handy zu eng */}
              <span className="h-3 text-[10px] leading-3 text-cream/50">
                {(weekly.length - 1 - i) % 2 === 0
                  ? format.dateTime(new Date(w.week), { day: "numeric", month: "numeric", timeZone: "Europe/Berlin" })
                  : ""}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-cream/50">{t("weeklyHint")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("activity")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile title={t("listingsNew")} value={s.listings.week} hint={t("listingsActive", { n: s.listings.active })}>
            <Trend week={s.listings.week} prev={s.listings.prev} label={vs} />
          </Tile>
          <Tile title={t("posts")} value={s.posts.week} hint={t("last7")}>
            <Trend {...s.posts} label={vs} />
          </Tile>
          <Tile title={t("messages")} value={s.messages.week} hint={t("chatsNew", { n: s.chats.week })}>
            <Trend {...s.messages} label={vs} />
          </Tile>
          <Tile title={t("interactions")} value={s.likes.week + s.comments.week} hint={t("likesComments", { likes: s.likes.week, comments: s.comments.week })}>
            <Trend week={s.likes.week + s.comments.week} prev={s.likes.prev + s.comments.prev} label={vs} />
          </Tile>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="font-semibold">{t("gamesTitle")}</h2>
          {s.games.length === 0 ? (
            <p className="text-sm text-cream/60">{t("none")}</p>
          ) : (
            <Bars rows={s.games.map((g) => ({ label: tTcg(g.tcg as never), value: Number(g.count) }))} />
          )}
        </section>
        <section className="card space-y-3">
          <h2 className="font-semibold">{t("offersTitle")}</h2>
          <Bars rows={offerKeys.map((k) => ({ label: tOffer(k), value: Number(s.offers[k] ?? 0) }))} />
          <p className="text-xs text-cream/60">{t("done", { n: s.listings.done })}</p>
        </section>
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold">{t("eventsTitle")}</h2>
        {s.events.length === 0 ? (
          <p className="text-sm text-cream/60">{t("none")}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {s.events.map((e) => (
              <li key={`${e.name}-${e.starts_at}`} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  {e.name}{" "}
                  <span className="text-cream/50">
                    · {format.dateTime(new Date(e.starts_at), { dateStyle: "medium", timeZone: "Europe/Berlin" })}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{t("checkins", { n: Number(e.checkins) })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card flex items-center justify-between gap-3">
        <span>{t("reportsOpen")}</span>
        <span className={`text-2xl font-black tabular-nums ${s.reports_open > 0 ? "text-danger" : ""}`}>{s.reports_open}</span>
      </section>
    </div>
  );
}
