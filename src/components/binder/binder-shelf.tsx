/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  COLLECTION_MARKS,
  matchesMark,
  NO_BINDER,
  type BinderSummary,
  type CollectionMark,
} from "@/lib/binder-shared";
import { photoUrl, type CollectionItem } from "@/lib/marketplace";
import { BinderCover } from "./binder-cover";

const MARK_ICON: Record<string, string> = { trade: "🔁", sell_or_trade: "🔁€", sell: "€", gift: "🎁" };

const markOf = (i: CollectionItem) => (i.status === "collection" ? null : i.offer);

/**
 * Reiter Sammlung: oben ein aufklappbarer Filter (Markierung und Binder).
 * Ohne Filter: Regal mit den Bindern. Mit Filter: alle passenden Karten als Raster.
 */
export async function BinderShelf({
  nickname,
  binders,
  items,
  isMe,
  basePath,
  mark = "alle",
  binderFilter = null,
}: {
  nickname: string;
  binders: BinderSummary[];
  items: CollectionItem[];
  isMe: boolean;
  /** Adresse des Profils (/profil oder /u/name) für die Filter-Links */
  basePath: string;
  mark?: CollectionMark;
  /** Binder-ID, "ohne" oder null (alle) */
  binderFilter?: string | null;
}) {
  const t = await getTranslations("Collection");
  const loose = items.filter((i) => !i.binder_id);
  const total = items.reduce((n, i) => n + (i.quantity ?? 1), 0);
  const marked = items.filter((i) => i.status !== "collection").length;
  const binderName = new Map(binders.map((b) => [b.id, b.name]));
  const validBinder = binderFilter === NO_BINDER || (binderFilter !== null && binderName.has(binderFilter)) ? binderFilter : null;
  const active = mark !== "alle" || validBinder !== null;

  const inBinder = (i: CollectionItem) =>
    validBinder === null ? true : validBinder === NO_BINDER ? !i.binder_id : i.binder_id === validBinder;
  const shown = items.filter((i) => inBinder(i) && matchesMark(markOf(i), mark));

  const href = (m: CollectionMark, b: string | null) => {
    const q = new URLSearchParams({ tab: "sammlung" });
    if (m !== "alle") q.set("filter", m);
    if (b) q.set("binder", b);
    return `${basePath}?${q.toString()}`;
  };
  const countFor = (m: CollectionMark) => items.filter((i) => inBinder(i) && matchesMark(markOf(i), m)).length;
  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-sm ${on ? "border-brand bg-brand/15 font-semibold text-brand" : "border-line text-cream/75 hover:bg-white/5"}`;

  const summary = [
    mark !== "alle" ? t(`mark_${mark}`) : null,
    validBinder ? (validBinder === NO_BINDER ? t("noBinder") : binderName.get(validBinder)) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-cream/70">
          {t("count", { count: total })}
          {marked > 0 && ` · ${t("markedCount", { count: marked })}`}
        </p>
        {isMe && (
          <div className="flex gap-2">
            <Link href="/binder/neu" className="btn-ghost">+ {t("newBinder")}</Link>
            <Link href="/marktplatz/neu?sammlung=1" className="btn-primary">+ {t("add")}</Link>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <details open={active} className="group rounded-2xl border border-line bg-night-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden>⚙</span>
              <span className="font-semibold">{t("filter")}</span>
              <span className="truncate text-sm text-cream/60">{active ? summary : t("filterAll")}</span>
            </span>
            <span aria-hidden className="text-cream/60 transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="space-y-3 border-t border-line px-4 py-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-cream/60">{t("filterShow")}</p>
              <div className="-mx-1 flex flex-wrap gap-2 px-1" role="group" aria-label={t("filterShow")}>
                {COLLECTION_MARKS.map((m) => (
                  <Link key={m} href={href(m, validBinder)} className={chip(mark === m)} aria-current={mark === m ? "true" : undefined}>
                    {t(`mark_${m}`)} ({countFor(m)})
                  </Link>
                ))}
              </div>
            </div>
            {(binders.length > 0 || loose.length > 0) && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-cream/60">{t("filterBinder")}</p>
                <div className="-mx-1 flex flex-wrap gap-2 px-1" role="group" aria-label={t("filterBinder")}>
                  <Link href={href(mark, null)} className={chip(validBinder === null)}>{t("allBinders")}</Link>
                  {binders.map((b) => (
                    <Link key={b.id} href={href(mark, b.id)} className={chip(validBinder === b.id)}>📁 {b.name}</Link>
                  ))}
                  {loose.length > 0 && (
                    <Link href={href(mark, NO_BINDER)} className={chip(validBinder === NO_BINDER)}>{t("noBinder")}</Link>
                  )}
                </div>
              </div>
            )}
            {active && (
              <Link href={`${basePath}?tab=sammlung`} className="inline-block text-sm text-brand hover:underline">✕ {t("filterReset")}</Link>
            )}
          </div>
        </details>
      )}

      {active ? (
        shown.length === 0 ? (
          <p className="card py-8 text-center text-sm text-cream/70">{t("filterEmpty")}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {shown.map((c) => {
              const m = markOf(c);
              return (
                <li key={c.id}>
                  <Link href={`/marktplatz/${c.id}`} className="group block" title={c.title}>
                    <span className="relative block aspect-[63/88] overflow-hidden rounded-md border border-white/15 bg-night-3 transition-transform group-hover:-translate-y-0.5">
                      {c.cover_photo_id ? (
                        <img src={photoUrl(c.owner_id, c.cover_photo_id, "thumb")} alt={c.title} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center p-1 text-center text-[11px] text-cream/70">{c.title}</span>
                      )}
                      {m && (
                        <span className="absolute right-1 top-1 rounded bg-brand px-1 py-0.5 text-[10px] font-bold leading-none text-on-brand shadow">
                          {MARK_ICON[m]}
                        </span>
                      )}
                      {c.quantity > 1 && (
                        <span className="absolute bottom-1 left-1 rounded bg-night/85 px-1 py-0.5 text-[10px] font-semibold leading-none">×{c.quantity}</span>
                      )}
                    </span>
                    <span className="mt-1 block truncate text-xs">{c.title}</span>
                    <span className="block truncate text-[11px] text-cream/55">
                      📁 {c.binder_id ? binderName.get(c.binder_id) ?? t("noBinder") : t("noBinder")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      ) : binders.length === 0 && loose.length === 0 ? (
        <div className="card space-y-2 py-10 text-center">
          <p className="text-3xl" aria-hidden>📁</p>
          <p className="font-semibold">{isMe ? t("emptyMe") : t("empty")}</p>
          {isMe && <p className="text-sm text-cream/70">{t("emptyMeHint")}</p>}
          {isMe && <Link href="/binder/neu" className="btn-primary">{t("firstBinder")}</Link>}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
          {binders.map((b) => (
            <li key={b.id}>
              <Link href={`/u/${nickname}/binder/${b.id}`} className="group block" aria-label={t("openBinder", { name: b.name })}>
                <BinderCover
                  name={b.name}
                  color={b.color}
                  effect={b.effect}
                  imageUrl={b.cover_image ? photoUrl(b.owner_id, b.cover_image, "thumb") : null}
                  subtitle={t("count", { count: b.card_count })}
                  locked={b.visibility === "public" ? null : b.visibility}
                />
              </Link>
            </li>
          ))}
          {loose.length > 0 && (
            <li>
              <Link href={`/u/${nickname}/binder/${NO_BINDER}`} className="group block" aria-label={t("openBinder", { name: t("noBinder") })}>
                <BinderCover
                  name={t("noBinder")}
                  color="night"
                  dashed
                  subtitle={t("count", { count: loose.length })}
                />
              </Link>
            </li>
          )}
          {isMe && (
            <li>
              <Link
                href="/binder/neu"
                className="flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-l-md rounded-r-2xl border-2 border-dashed border-line text-cream/60 hover:border-brand/60 hover:text-brand"
              >
                <span className="text-3xl leading-none">+</span>
                <span className="text-sm font-semibold">{t("newBinder")}</span>
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
