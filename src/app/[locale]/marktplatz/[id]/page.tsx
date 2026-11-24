/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { PriceTag } from "@/components/listing-card";
import { Link } from "@/i18n/navigation";
import { getSessionUser } from "@/lib/auth";
import { getListing } from "@/lib/listings";
import { photoUrl } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";
import { DeleteListing, ModerateListing, ReportForm, StartConversation, StatusSwitch } from "./listing-actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/marktplatz/[id]">): Promise<Metadata> {
  const { id } = await params;
  const data = await getListing(id);
  if (!data) return {};
  return {
    title: data.listing.title,
    openGraph: data.photos[0] ? { images: [photoUrl(data.listing.owner_id, data.photos[0])] } : undefined,
  };
}

export default async function ListingPage({ params }: PageProps<"/[locale]/marktplatz/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [data, user] = await Promise.all([getListing(id), getSessionUser()]);
  if (!data) notFound();

  const { listing: l, owner, photos, is_owner: isOwner, can_moderate: canModerate } = data;
  const t = await getTranslations("Listing");
  const tTcg = await getTranslations("Tcg");
  const tKind = await getTranslations("Kind");
  const tOffer = await getTranslations("Offer");
  const tCond = await getTranslations("Condition");
  const tLang = await getTranslations("CardLanguage");
  const tStatus = await getTranslations("Status");
  const tRoles = await getTranslations("Roles");
  const format = await getFormatter();
  const date = (d: string) => format.dateTime(new Date(d), { dateStyle: "medium" });
  const publicVisible = l.status === "active" || l.status === "reserved";
  let existingConversation: string | null = null;
  if (user && !isOwner) {
    const supabase = await createClient();
    const { data: conv } = await supabase.rpc("my_conversation_for_listing", { p_listing_id: l.id });
    existingConversation = (conv as string | null) ?? null;
  }

  const handover = [
    l.handover_event && t("handoverEvent"),
    l.handover_pickup && t("handoverPickup"),
    l.handover_shipping && t("handoverShipping"),
  ].filter(Boolean);

  return (
    <article className="space-y-5">
      {l.status === "removed" && (
        <div role="alert" className="card border-danger/50">
          <p className="font-semibold text-danger">{t("removedTitle")}</p>
          <p className="mt-1 text-sm">{t("removedText")}</p>
          <p className="mt-2 whitespace-pre-line rounded-xl bg-night-3 p-3 text-sm">{l.removed_reason}</p>
          <p className="mt-2 text-xs text-cream/60">{t("removedContact")}</p>
        </div>
      )}
      {!publicVisible && l.status !== "removed" && <p className="card text-sm text-cream/70">{t("notVisible")}</p>}

      {photos.length > 0 && (
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          {photos.map((p, i) => (
            <a
              key={p}
              href={photoUrl(l.owner_id, p)}
              target="_blank"
              rel="noopener"
              className="w-[78%] shrink-0 snap-center overflow-hidden rounded-2xl border border-white/10 bg-night-3 sm:w-[48%]"
            >
              <img
                src={photoUrl(l.owner_id, p)}
                alt={`${l.title} – ${i + 1}`}
                loading={i === 0 ? "eager" : "lazy"}
                className="aspect-[3/4] w-full object-contain"
              />
            </a>
          ))}
        </div>
      )}

      <header className="space-y-2">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-amber/15 px-2.5 py-1 font-semibold text-amber">{tTcg(l.tcg)}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1">{tKind(l.kind)}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1">{tOffer(l.offer)}</span>
          {l.status !== "active" && <span className="rounded-full bg-white/10 px-2.5 py-1">{tStatus(l.status)}</span>}
        </div>
        <h1 className="text-2xl font-bold leading-tight">{l.title}</h1>
        <p className="text-3xl font-black text-amber">
          <PriceTag offer={l.offer} cents={l.price_cents} negotiable={l.negotiable} />
        </p>
      </header>

      {l.description && <p className="whitespace-pre-line text-cream/90">{l.description}</p>}

      <dl className="card grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {l.condition && (
          <div><dt className="text-cream/60">{t("condition")}</dt><dd>{tCond(l.condition)}</dd></div>
        )}
        {l.card_language && (
          <div><dt className="text-cream/60">{t("cardLanguage")}</dt><dd>{tLang(l.card_language)}</dd></div>
        )}
        {l.grading && (
          <div><dt className="text-cream/60">{t("grading")}</dt><dd>{l.grading}</dd></div>
        )}
        {l.city && (
          <div><dt className="text-cream/60">{t("city")}</dt><dd>{l.city}</dd></div>
        )}
        <div className="col-span-2"><dt className="text-cream/60">{t("handover")}</dt><dd>{handover.join(" · ")}</dd></div>
        <div className="col-span-2 sm:col-span-3 text-xs text-cream/50">{t("postedAt", { date: date(l.created_at) })}</div>
      </dl>

      <section className="card flex flex-wrap items-center gap-3">
        <div aria-hidden className="flex size-11 items-center justify-center rounded-full bg-amber text-lg font-black text-night">
          {owner.nickname.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-cream/60">{t("seller")}</p>
          {user ? (
            <Link href={`/u/${owner.nickname}`} className="font-semibold hover:underline">@{owner.nickname}</Link>
          ) : (
            <p className="font-semibold">@{owner.nickname}</p>
          )}
          <p className="text-xs text-cream/50">{t("memberSince", { date: date(owner.member_since) })}</p>
        </div>
        {owner.role !== "member" && (
          <span className="rounded-full bg-amber/15 px-3 py-1 text-xs font-semibold text-amber">{tRoles(owner.role)}</span>
        )}
      </section>

      {!isOwner && publicVisible && (
        <section className="card space-y-2">
          <h2 className="font-semibold">{t("contactTitle")}</h2>
          {!user ? (
            <>
              <p className="text-sm text-cream/80">{t("contactLogin")}</p>
              <Link href="/anmelden" className="btn-primary w-full">{t("contactLoginButton")}</Link>
            </>
          ) : existingConversation ? (
            <Link href={`/nachrichten/${existingConversation}`} className="btn-primary w-full">{t("openConversation")}</Link>
          ) : (
            <StartConversation listingId={l.id} label={t("writeMessage")} />
          )}
          <p className="text-xs text-cream/60">{t("safety")}</p>
        </section>
      )}

      {isOwner && (
        <section className="card space-y-4">
          <h2 className="font-semibold">{t("ownerTools")}</h2>
          {l.status !== "removed" && (
            <>
              <div className="flex flex-wrap gap-3">
                <Link href={`/marktplatz/${l.id}/bearbeiten`} className="btn-ghost">{t("edit")}</Link>
              </div>
              <StatusSwitch id={l.id} status={l.status} />
            </>
          )}
          <DeleteListing id={l.id} />
        </section>
      )}

      {canModerate && !isOwner && <ModerateListing id={l.id} removed={l.status === "removed"} />}

      {user && !isOwner && publicVisible && <ReportForm listingId={l.id} label={t("report")} />}
    </article>
  );
}
