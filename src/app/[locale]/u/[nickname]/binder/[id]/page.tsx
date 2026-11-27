import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { BinderView, type PocketCard } from "@/components/binder/binder-view";
import type { PickCard } from "@/components/binder/add-to-binder-sheet";
import { Link } from "@/i18n/navigation";
import { NO_BINDER } from "@/lib/binder-shared";
import { getProfileBinders } from "@/lib/binders";
import { photoUrl, UUID_PATTERN, type CollectionItem } from "@/lib/marketplace";
import { getProfileCollection, getPublicProfile } from "@/lib/profiles";

export async function generateMetadata({ params }: PageProps<"/[locale]/u/[nickname]/binder/[id]">): Promise<Metadata> {
  const { nickname } = await params;
  return { title: `@${decodeURIComponent(nickname)}` };
}

function toPocket(i: CollectionItem, pocket: number): PocketCard {
  return {
    id: i.id,
    title: i.title,
    front: i.cover_photo_id ? photoUrl(i.owner_id, i.cover_photo_id, "thumb") : null,
    pocket,
    quantity: i.quantity ?? 1,
    mark: i.status === "collection" ? null : i.offer,
  };
}

/** Ein Binder zum Durchblättern (oder alle Karten ohne Binder) */
export default async function BinderPage({ params }: PageProps<"/[locale]/u/[nickname]/binder/[id]">) {
  const { locale, nickname: raw, id } = await params;
  setRequestLocale(locale);
  const nickname = decodeURIComponent(raw);
  const loose = id === NO_BINDER;
  if (!loose && !UUID_PATTERN.test(id)) notFound();

  const profile = await getPublicProfile(nickname);
  if (!profile || !profile.can_view) notFound();
  const [binders, items] = await Promise.all([getProfileBinders(profile.nickname), getProfileCollection(profile.nickname)]);
  const binder = loose ? null : binders.find((b) => b.id === id);
  if (!loose && !binder) notFound();

  const t = await getTranslations("Binder");
  const tC = await getTranslations("Collection");
  const cards = loose
    ? items
        .filter((i) => !i.binder_id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((i, n) => toPocket(i, n))
    : items.filter((i) => i.binder_id === id && i.pocket !== null).map((i) => toPocket(i, i.pocket!));
  // Eigene Karten, die man in diesen Binder legen kann: ohne Binder und aus anderen Bindern
  const binderName = new Map(binders.map((b) => [b.id, b.name]));
  const pickable: PickCard[] =
    profile.is_me && binder
      ? items
          .filter((i) => i.binder_id !== binder.id)
          .map((i) => ({
            id: i.id,
            title: i.title,
            front: i.cover_photo_id ? photoUrl(i.owner_id, i.cover_photo_id, "thumb") : null,
            binderName: i.binder_id ? binderName.get(i.binder_id) ?? null : null,
          }))
      : [];
  const profilePath = profile.is_me ? "/profil" : `/u/${profile.nickname}`;
  const name = binder?.name ?? tC("noBinder");

  return (
    <div className="space-y-4">
      <BackLink fallback={profilePath} label={t("back")} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold normal-case">{name}</h1>
          <p className="text-sm text-cream/70">
            <Link href={profilePath} className="hover:underline">@{profile.nickname}</Link>
            {" · "}
            {tC("count", { count: cards.length })}
            {binder && binder.visibility !== "public" && ` · ${binder.visibility === "private" ? "🔒" : "👥"} ${t(`visibility_${binder.visibility}`)}`}
          </p>
          {loose && profile.is_me && <p className="hint">{t("looseHint")}</p>}
        </div>
        {profile.is_me && (
          <div className="flex gap-2">
            {binder ? (
              <Link href={`/binder/${binder.id}/bearbeiten`} className="btn-ghost">{t("edit")}</Link>
            ) : (
              <Link href="/marktplatz/neu?sammlung=1&zurueck=ohne" className="btn-primary">+ {tC("add")}</Link>
            )}
          </div>
        )}
      </header>
      <BinderView
        cards={cards}
        color={binder?.color ?? "black"}
        effect={binder?.effect ?? "none"}
        sortable={profile.is_me && !loose}
        binderId={binder?.id}
        pickable={pickable}
      />
    </div>
  );
}
