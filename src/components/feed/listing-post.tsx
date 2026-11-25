"use client";
/* eslint-disable @next/next/no-img-element -- Fotos kommen direkt aus Supabase Storage */

import { useFormatter, useTranslations } from "next-intl";
import { Avatar } from "@/components/avatar";
import { Link } from "@/i18n/navigation";
import type { ListingItem } from "@/lib/feed-shared";
import { photoUrl } from "@/lib/marketplace";

/** Neues Inserat im Feed: sieht aus wie ein Beitrag, mit Preis und Knopf zum Inserat */
export function ListingPost({ item }: { item: ListingItem }) {
  const t = useTranslations("Feed");
  const tl = useTranslations("Market");
  const format = useFormatter();
  const price =
    item.offer === "gift"
      ? tl("giftOnly")
      : item.offer === "trade" || item.price_cents == null
        ? tl("tradeOnly")
      : format.number(item.price_cents / 100, { style: "currency", currency: "EUR" });

  return (
    <article className="border-b border-line pb-4 sm:rounded-2xl sm:border sm:bg-night-2" aria-label={t("listingBy", { nickname: item.author.nickname })}>
      <header className="flex items-center gap-3 px-3 py-2.5">
        <Link href={`/u/${item.author.nickname}`} className="flex min-w-0 items-center gap-3">
          <Avatar userId={item.author.id} avatarId={item.author.avatar_id} nickname={item.author.nickname} size="xs" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{item.author.nickname}</span>
            <span className="block text-xs text-cream/60">{t("newListing")}{item.city ? ` · ${item.city}` : ""}</span>
          </span>
        </Link>
      </header>
      <Link href={`/marktplatz/${item.id}`} className="relative block aspect-[4/5] bg-night-3">
        {item.photos[0] ? (
          <img src={photoUrl(item.author.id, item.photos[0])} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-cream/40">{tl("noPhoto")}</span>
        )}
        {price && (
          <span className="absolute bottom-3 left-3 rounded-lg bg-brand px-2.5 py-1 font-display text-lg font-bold text-on-brand shadow-cta">
            {price}
            {item.negotiable && item.price_cents != null && <span className="ml-1 text-xs font-semibold">{tl("vb")}</span>}
          </span>
        )}
      </Link>
      <div className="flex items-center gap-3 px-3 pt-3">
        <p className="min-w-0 flex-1 truncate font-semibold">{item.title}</p>
        <Link href={`/marktplatz/${item.id}`} className="btn-primary shrink-0 px-3 py-1.5">{t("viewListing")}</Link>
      </div>
    </article>
  );
}
