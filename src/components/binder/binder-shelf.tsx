import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { NO_BINDER, type BinderSummary } from "@/lib/binder-shared";
import { photoUrl, type CollectionItem } from "@/lib/marketplace";
import { BinderCover } from "./binder-cover";

/** Regal mit den Bindern eines Profils (Reiter Sammlung) */
export async function BinderShelf({
  nickname,
  binders,
  items,
  isMe,
}: {
  nickname: string;
  binders: BinderSummary[];
  items: CollectionItem[];
  isMe: boolean;
}) {
  const t = await getTranslations("Collection");
  const loose = items.filter((i) => !i.binder_id);
  const total = items.reduce((n, i) => n + (i.quantity ?? 1), 0);
  const marked = items.filter((i) => i.status !== "collection").length;
  const looseCover = loose.find((i) => i.cover_photo_id);

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

      {binders.length === 0 && loose.length === 0 ? (
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
                  coverUrl={b.cover_photo_id ? photoUrl(b.owner_id, b.cover_photo_id, "thumb") : null}
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
                  coverUrl={looseCover?.cover_photo_id ? photoUrl(looseCover.owner_id, looseCover.cover_photo_id, "thumb") : null}
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
