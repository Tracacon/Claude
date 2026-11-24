/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { PriceTag } from "@/components/listing-card";
import { Link } from "@/i18n/navigation";
import { requireProfile } from "@/lib/auth";
import { photoUrl, type ListingStatus, type Offer, type Tcg } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";

type Mine = {
  id: string;
  title: string;
  tcg: Tcg;
  offer: Offer;
  price_cents: number | null;
  status: ListingStatus;
  removed_reason: string | null;
  created_at: string;
  cover_photo_id: string | null;
};

export async function generateMetadata({ params }: PageProps<"/[locale]/meine-inserate">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Listing" });
  return { title: t("mineTitle") };
}

const statusColor: Record<ListingStatus, string> = {
  active: "bg-ok/15 text-ok",
  reserved: "bg-brand/15 text-brand",
  done: "bg-white/10 text-cream/70",
  removed: "bg-danger/15 text-danger",
};

export default async function MyListingsPage({ params }: PageProps<"/[locale]/meine-inserate">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_listings");
  const items = (data ?? []) as Mine[];

  const t = await getTranslations("Listing");
  const tStatus = await getTranslations("Status");
  const tTcg = await getTranslations("Tcg");
  const format = await getFormatter();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("mineTitle")}</h1>
        <Link href="/marktplatz/neu" className="btn-primary">+ {t("mineNew")}</Link>
      </div>
      {items.length === 0 ? (
        <p className="card text-cream/70">{t("mineEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((l) => (
            <li key={l.id}>
              <Link href={`/marktplatz/${l.id}`} className="card flex gap-3 p-3 hover:border-brand/50 sm:p-3">
                <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-night-3">
                  {l.cover_photo_id && (
                    <img src={photoUrl(profile.id, l.cover_photo_id, "thumb")} alt="" loading="lazy" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{l.title}</p>
                  <p className="text-xs text-cream/60">
                    {tTcg(l.tcg)} · {format.dateTime(new Date(l.created_at), { dateStyle: "short" })}
                  </p>
                  <p className="text-sm font-bold text-brand">
                    <PriceTag offer={l.offer} cents={l.price_cents} negotiable={false} />
                  </p>
                  {l.status === "removed" && l.removed_reason && (
                    <p className="mt-1 line-clamp-2 text-xs text-danger">{l.removed_reason}</p>
                  )}
                </div>
                <span className={`h-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor[l.status]}`}>
                  {tStatus(l.status)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
