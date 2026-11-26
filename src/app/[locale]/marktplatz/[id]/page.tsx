/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Avatar } from "@/components/avatar";
import { PriceTag } from "@/components/listing-card";
import { Link } from "@/i18n/navigation";
import { getSessionUser } from "@/lib/auth";
import { getListing } from "@/lib/listings";
import { getListingEvents } from "@/lib/events";
import { eventDay } from "@/lib/event-format";
import { photoUrl } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";
import { DeleteListing, ModerateListing, ReportForm, StartConversation, StatusSwitch } from "./listing-actions";
import { BrandText } from "@/components/brand-text";
import { BackLink } from "@/components/back-link";
import { InterestButton } from "@/components/interest-button";
import { getInterestedPeople, getInterestState } from "@/lib/interests";

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

  const bringTo = publicVisible || isOwner ? await getListingEvents(l.id) : [];
  const [interest, interested] = await Promise.all([
    publicVisible || isOwner ? getInterestState(l.id) : Promise.resolve({ mine: false, count: 0 }),
    isOwner ? getInterestedPeople(l.id) : Promise.resolve([]),
  ]);
  const tInt = await getTranslations("Interest");
  // Tauschinteresse gibt es nur bei Inseraten, die man tauschen kann
  const tradable = l.offer === "trade" || l.offer === "sell_or_trade";
  const showInterest = tradable && publicVisible && !isOwner;
  const interestControl = showInterest ? (
    user ? (
      <InterestButton listingId={l.id} ownerId={l.owner_id} initial={interest.mine} />
    ) : (
      <Link href="/anmelden" className="rounded-full border border-white/25 bg-night/80 px-4 py-2.5 text-sm font-bold text-cream shadow-lg backdrop-blur">
        🔁 {tInt("button")}
      </Link>
    )
  ) : null;
  const tEv = await getTranslations("Events");

  const handover = [
    l.handover_event && t("handoverEvent"),
    l.handover_pickup && t("handoverPickup"),
    l.handover_shipping && t("handoverShipping"),
  ].filter(Boolean);

  return (
    <article className="space-y-5">
      <BackLink fallback="/marktplatz" label={t("backToList")} />
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
        <div className="relative">
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          {photos.map((p, i) => (
            <a
              key={p}
              href={photoUrl(l.owner_id, p)}
              target="_blank"
              rel="noopener"
              className="w-[78%] shrink-0 snap-center overflow-hidden rounded-2xl border border-line bg-night-3 sm:w-[48%]"
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
        {interestControl && <div className="pointer-events-none absolute bottom-5 right-[24%] sm:right-[54%] [&>*]:pointer-events-auto">{interestControl}</div>}
        </div>
      )}
      {photos.length === 0 && interestControl && <div className="flex justify-end">{interestControl}</div>}

      <header className="space-y-2">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-brand/15 px-2.5 py-1 font-semibold text-brand">{tTcg(l.tcg)}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1">{tKind(l.kind)}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1">{tOffer(l.offer)}</span>
          {l.status !== "active" && <span className="rounded-full bg-white/10 px-2.5 py-1">{tStatus(l.status)}</span>}
        </div>
        <h1 className="text-2xl font-bold leading-tight"><BrandText text={l.title} /></h1>
        <p className="text-3xl font-black text-brand">
          <PriceTag offer={l.offer} cents={l.price_cents} negotiable={l.negotiable} />
        </p>
      </header>

      {l.description && <p className="whitespace-pre-line text-cream/90">{l.description}</p>}

      <dl className="card grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {(l.card_name || l.card_set || l.card_number) && (
          <div className="col-span-2 flex items-center gap-3 sm:col-span-3">
            {l.card_image && (
              <img src={l.card_image} alt="" loading="lazy" width={40} height={56} className="h-14 w-10 shrink-0 rounded object-cover" />
            )}
            <div className="min-w-0">
              <dt className="text-cream/60">{t("cardName")}</dt>
              {l.card_name && (
                <dd className="font-medium">
                  {l.card_name}
                  {l.card_name_en && <span className="text-cream/60"> · {l.card_name_en}</span>}
                </dd>
              )}
              <dd className="text-cream/75">{[l.card_set, l.card_number].filter(Boolean).join(" · ")}</dd>
            </div>
          </div>
        )}
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
        {bringTo.length > 0 && (
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-cream/60">{tEv("bringsTo")}</dt>
            <dd className="mt-1 flex flex-wrap gap-2">
              {bringTo.map((ev) => (
                <Link key={ev.id} href={`/termine/${ev.id}`} className="rounded-full border border-brand/50 bg-brand/10 px-3 py-1 text-sm text-brand hover:bg-brand/20">
                  📅 {ev.name} · {eventDay({ ...ev, timezone: null }, locale)}
                </Link>
              ))}
            </dd>
          </div>
        )}
        <div className="col-span-2 sm:col-span-3 text-xs text-cream/50">{t("postedAt", { date: date(l.created_at) })}</div>
      </dl>

      <section className="card flex flex-wrap items-center gap-3">
        <Avatar userId={l.owner_id} avatarId={owner.avatar_id} nickname={owner.nickname} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-cream/60">{t("seller")}</p>
          <Link href={`/u/${owner.nickname}`} className="font-semibold hover:underline">@{owner.nickname}</Link>
          <p className="text-xs text-cream/50">{t("memberSince", { date: date(owner.member_since) })}</p>
        </div>
        {owner.role !== "member" && (
          <span className="rounded-full bg-brand/15 px-3 py-1 text-xs font-semibold text-brand">{tRoles(owner.role)}</span>
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
          {tradable && interest.count > 0 && <p className="text-sm text-cream/70">🔁 {tInt("count", { count: interest.count })}</p>}
          <p className="text-xs text-cream/60">{t("safety")}</p>
        </section>
      )}

      {isOwner && l.status !== "removed" && (tradable || interested.length > 0) && (
        <section id="tauschinteresse" className="card scroll-mt-28 space-y-3">
          <h2 className="font-semibold">🔁 {tInt("ownerTitle", { count: interested.length })}</h2>
          {interested.length === 0 ? (
            <p className="text-sm text-cream/70">{tInt("ownerEmpty")}</p>
          ) : (
            <>
              <p className="text-sm text-cream/70">{tInt("ownerIntro")}</p>
              <ul className="space-y-4">
                {interested.map((p) => (
                  <li key={p.id} className="space-y-2 border-t border-line pt-3 first:border-0 first:pt-0">
                    <div className="flex items-center gap-3">
                      <Link href={`/u/${p.nickname}`} className="shrink-0" aria-label={`@${p.nickname}`}>
                        <Avatar userId={p.id} avatarId={p.avatar_id} nickname={p.nickname} />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link href={`/u/${p.nickname}`} className="font-semibold hover:underline">@{p.nickname}</Link>
                        <p className="text-xs text-cream/60">
                          {tInt("tradeCount", { count: Number(p.trade_count) })} · {format.relativeTime(new Date(p.since), new Date())}
                        </p>
                      </div>
                    </div>
                    {p.cards.length > 0 ? (
                      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                        {p.cards.map((c) => (
                          <Link key={c.id} href={`/marktplatz/${c.id}`} className="w-20 shrink-0" title={c.title}>
                            <span className="block aspect-[3/4] overflow-hidden rounded-md bg-night-3">
                              {c.cover_id ? (
                                <img src={photoUrl(c.owner_id, c.cover_id, "thumb")} alt={c.title} loading="lazy" className="h-full w-full object-cover" />
                              ) : (
                                <span className="flex h-full items-center justify-center p-1 text-center text-[10px] text-cream/60">{c.title}</span>
                              )}
                            </span>
                            <span className="mt-1 block truncate text-[11px] text-cream/80">{c.title}</span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-cream/60">{tInt("noCards")}</p>
                    )}
                    {Number(p.trade_count) > p.cards.length && (
                      <Link href={`/u/${p.nickname}?tab=inserate&angebot=tausch`} className="text-sm text-brand hover:underline">
                        {tInt("allCards")}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
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
