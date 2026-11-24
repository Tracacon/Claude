/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { photoUrl, type ListingSummary } from "@/lib/marketplace";

export function PriceTag({ offer, cents, negotiable }: { offer: string; cents: number | null; negotiable: boolean }) {
  const t = useTranslations("Market");
  const format = useFormatter();
  if (offer === "trade" || cents === null) return <span>{t("tradeOnly")}</span>;
  return (
    <span>
      {format.number(cents / 100, { style: "currency", currency: "EUR" })}
      {negotiable && <span className="ml-1 text-xs font-normal text-cream/70">{t("vb")}</span>}
    </span>
  );
}

export function ListingCard({ item }: { item: ListingSummary }) {
  const t = useTranslations("Market");
  const tTcg = useTranslations("Tcg");
  const tStatus = useTranslations("Status");
  const tOffer = useTranslations("Offer");

  return (
    <Link
      href={`/marktplatz/${item.id}`}
      className="card-hover group flex flex-col overflow-hidden rounded-2xl border border-line bg-night-2"
    >
      <div className="relative aspect-[3/4] bg-night-3">
        {item.cover_photo_id ? (
          <img
            src={photoUrl(item.owner_id, item.cover_photo_id, "thumb")}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-cream/40">{t("noPhoto")}</div>
        )}
        {item.status === "reserved" && (
          <span className="absolute left-2 top-2 rounded-full bg-night/85 px-2 py-0.5 text-xs font-semibold text-brand">
            {tStatus("reserved")}
          </span>
        )}
        {item.offer !== "sell" && (
          <span className="absolute right-2 top-2 rounded-full bg-night/85 px-2 py-0.5 text-xs">{tOffer(item.offer)}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-brand">{item.title}</p>
        <p className="text-xs text-cream/60">{tTcg(item.tcg)}{item.city ? ` · ${item.city}` : ""}</p>
        <p className="mt-auto pt-1 font-bold text-brand">
          <PriceTag offer={item.offer} cents={item.price_cents} negotiable={item.negotiable} />
        </p>
      </div>
    </Link>
  );
}
