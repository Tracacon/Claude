/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Avatar } from "@/components/avatar";
import { FollowButton } from "@/components/follow-button";
import { PriceTag } from "@/components/listing-card";
import { Link } from "@/i18n/navigation";
import { eventDay } from "@/lib/event-format";
import { photoUrl, type CollectionItem, type ListingSummary } from "@/lib/marketplace";
import { BinderShelf } from "@/components/binder/binder-shelf";
import type { BinderSummary, CollectionMark } from "@/lib/binder-shared";
import type { VisitedEvent } from "@/lib/profiles";
import { PostGrid } from "@/components/feed/post-grid";
import { InstagramIcon } from "@/components/icons";
import type { GridPost } from "@/lib/feed-shared";

export type ProfileTab = "sammlung" | "beitraege" | "inserate" | "abzeichen";

/** Filter im Reiter Inserate */
export type OfferFilter = "alle" | "tausch" | "verkauf" | "verschenken";
const OFFER_FILTERS: Record<Exclude<OfferFilter, "alle">, string[]> = {
  tausch: ["trade", "sell_or_trade"],
  verkauf: ["sell", "sell_or_trade"],
  verschenken: ["gift"],
};
export function parseOfferFilter(v: unknown): OfferFilter {
  return v === "tausch" || v === "verkauf" || v === "verschenken" ? v : "alle";
}

export function parseProfileTab(v: unknown): ProfileTab {
  // Ohne Angabe öffnet das Profil die Sammlung
  return v === "beitraege" || v === "inserate" || v === "abzeichen" ? v : "sammlung";
}
import { BADGE_ICONS, type PublicProfile } from "@/lib/social";

/**
 * Profilansicht wie in sozialen Netzwerken: Bild, Zahlen, Beschreibung,
 * darunter Inserate als Bildraster oder Abzeichen.
 */
export async function ProfileView({
  profile: p,
  listings,
  collection = [],
  binders = [],
  events = [],
  posts = [],
  tab,
  loggedIn,
  basePath,
  offerFilter = "alle",
  collectionMark = "alle",
  collectionBinder = null,
}: {
  profile: PublicProfile;
  listings: ListingSummary[];
  /** Sammlung (nur im Reiter Sammlung) */
  collection?: CollectionItem[];
  /** Binder (nur im Reiter Sammlung) */
  binders?: BinderSummary[];
  /** Besuchte Events (nur im Reiter Abzeichen) */
  events?: VisitedEvent[];
  /** Beiträge (nur im Reiter Beiträge) */
  posts?: GridPost[];
  tab: ProfileTab;
  loggedIn: boolean;
  basePath: string;
  offerFilter?: OfferFilter;
  /** Filter im Reiter Sammlung */
  collectionMark?: CollectionMark;
  collectionBinder?: string | null;
}) {
  const t = await getTranslations("Social");
  const tRoles = await getTranslations("Roles");
  const tBadges = await getTranslations("Badges");
  const format = await getFormatter();
  const tEv = await getTranslations("Events");
  const tFeed = await getTranslations("Feed");
  const locale = await getLocale();
  const userPath = `/u/${p.nickname}`;

  const stat = (count: number, label: string, href?: string) => {
    const inner = (
      <>
        <span className="block text-lg font-bold leading-tight">{format.number(count)}</span>
        <span className="text-xs text-cream/70">{label}</span>
      </>
    );
    return href && p.can_view ? (
      <Link href={href} className="rounded-lg px-2 py-1 text-center hover:bg-white/5">{inner}</Link>
    ) : (
      <div className="px-2 py-1 text-center">{inner}</div>
    );
  };

  return (
    <div className="space-y-5">
      <header className="space-y-4">
        <div className="flex items-center gap-4 sm:gap-6">
          <Avatar userId={p.id} avatarId={p.avatar_id} nickname={p.nickname} size="lg" />
          <div className="flex flex-1 justify-around">
            {stat(p.post_count ?? 0, t("posts"), `${basePath}?tab=beitraege`)}
            {stat(p.follower_count, t("followers"), `${userPath}/follower`)}
            {stat(p.following_count, t("followingCount"), `${userPath}/folgt`)}
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold normal-case">{p.nickname}</h1>
            {p.role !== "member" && (
              <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand">{tRoles(p.role)}</span>
            )}
            {p.visibility === "followers" && <span className="text-xs text-cream/60" title={t("privateLabel")}>🔒</span>}
          </div>
          {p.can_view && p.city && <p className="text-sm text-cream/70">📍 {p.city}</p>}
          {p.can_view && p.bio && <p className="whitespace-pre-line text-[15px]">{p.bio}</p>}
          {p.can_view && p.instagram && (
            <a
              href={`https://www.instagram.com/${p.instagram}/`}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-cream hover:text-brand"
              aria-label={t("instagramLink", { name: p.instagram })}
            >
              <InstagramIcon className="size-5" />
              {p.instagram}
            </a>
          )}
          {p.can_view && p.website && (
            <a href={p.website} target="_blank" rel="noopener noreferrer nofollow ugc" className="link break-all text-sm">
              {p.website.replace(/^https:\/\//, "")}
            </a>
          )}
          <p className="text-xs text-cream/50">
            {t("memberSince", { date: format.dateTime(new Date(p.member_since), { month: "long", year: "numeric" }) })}
            {p.follows_me && !p.is_me && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5">{t("followsYou")}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {p.is_me ? (
            <>
              <Link href="/einstellungen" className="btn-ghost flex-1">{t("editProfile")}</Link>
              <Link href="/beitrag/neu" className="btn-ghost flex-1">+ {t("newPost")}</Link>
            </>
          ) : loggedIn && !p.blocked ? (
            <FollowButton userId={p.id} initial={p.my_follow} />
          ) : !loggedIn ? (
            <Link href="/anmelden" className="btn-primary">{t("follow")}</Link>
          ) : null}
        </div>
      </header>

      <nav className="flex border-b border-line text-sm" aria-label={t("sections")}>
        {(["sammlung", "beitraege", "inserate", "abzeichen"] as const).map((x) => (
          <Link
            key={x}
            href={x === "sammlung" ? basePath : `${basePath}?tab=${x}`}
            aria-current={tab === x ? "page" : undefined}
            className={`flex-1 border-b-2 py-2.5 text-center font-semibold ${tab === x ? "border-cream text-cream" : "border-transparent text-cream/55"}`}
          >
            {x === "sammlung"
              ? `📁 ${t("collection")}`
              : x === "beitraege"
                ? `▦ ${t("posts")}`
                : x === "inserate"
                  ? `🃏 ${t("listings")} (${p.listing_count})`
                  : `🏅 ${t("badges")}`}
          </Link>
        ))}
      </nav>

      {!p.can_view ? (
        <div className="card space-y-2 py-10 text-center">
          <p className="text-3xl">🔒</p>
          <p className="font-semibold">{t("privateTitle")}</p>
          <p className="text-sm text-cream/70">{t("privateText", { nickname: p.nickname })}</p>
        </div>
      ) : tab === "sammlung" ? (
        <BinderShelf
          nickname={p.nickname}
          binders={binders}
          items={collection}
          isMe={p.is_me}
          basePath={basePath}
          mark={collectionMark}
          binderFilter={collectionBinder}
        />
      ) : tab === "beitraege" ? (
        posts.length === 0 ? (
          <div className="card space-y-2 py-10 text-center">
            <p className="text-3xl" aria-hidden>📷</p>
            <p className="font-semibold">{p.is_me ? tFeed("profileEmptyMe") : tFeed("profileEmpty")}</p>
            {p.is_me && <Link href="/beitrag/neu" className="btn-primary">{tFeed("firstPost")}</Link>}
          </div>
        ) : (
          <div className="-mx-4 sm:mx-0">
            <PostGrid posts={posts} list="profil" label={(g) => tFeed("gridLabel", { likes: g.like_count, comments: g.comment_count })} />
          </div>
        )
      ) : tab === "abzeichen" ? (
        <div className="space-y-3">
          {p.badges.length === 0 ? (
            <p className="card text-sm text-cream/70">{t("noBadges")}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {p.badges.map((b) => (
                <li key={b} className="card flex flex-col items-center gap-1 p-4 text-center sm:p-4">
                  <span className="text-3xl" aria-hidden>{BADGE_ICONS[b] ?? "🏅"}</span>
                  <span className="text-sm font-semibold">{tBadges.has(`${b}.title`) ? tBadges(`${b}.title`) : b}</span>
                  {tBadges.has(`${b}.text`) && <span className="text-xs text-cream/60">{tBadges(`${b}.text`)}</span>}
                </li>
              ))}
            </ul>
          )}
          <h2 className="pt-2 font-semibold">{tEv("visitedTitle")}</h2>
          {events.length === 0 ? (
            <p className="card text-sm text-cream/70">{p.is_me ? tEv("visitedEmptyMe") : tEv("visitedEmpty")}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {events.map((ev) => (
                <li key={ev.id}>
                  <Link href={`/termine/${ev.id}`} className="card flex h-full flex-col items-center gap-1 p-4 text-center hover:border-brand/50 sm:p-4">
                    <span className="text-3xl" aria-hidden>🎟️</span>
                    <span className="text-sm font-semibold">{ev.name}</span>
                    <span className="text-xs text-cream/60">{eventDay({ starts_at: ev.starts_at, ends_at: ev.starts_at, timezone: null }, locale)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : listings.length === 0 ? (
        <p className="card py-8 text-center text-sm text-cream/70">{p.is_me ? t("noListingsMe") : t("noListings")}</p>
      ) : (
        <div className="space-y-3">
          {/* Filter: alle, nur Tausch, nur Verkauf, nur Verschenken */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label={t("offerFilter")}>
            {(["alle", "tausch", "verkauf", "verschenken"] as const).map((f) => {
              const n = f === "alle" ? listings.length : listings.filter((l) => OFFER_FILTERS[f].includes(l.offer)).length;
              return (
                <Link
                  key={f}
                  href={f === "alle" ? `${basePath}?tab=inserate` : `${basePath}?tab=inserate&angebot=${f}`}
                  aria-current={offerFilter === f ? "true" : undefined}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
                    offerFilter === f ? "border-brand bg-brand/15 font-semibold text-brand" : "border-line text-cream/75"
                  }`}
                >
                  {t(`offer_${f}`)} ({n})
                </Link>
              );
            })}
          </div>
          {(() => {
            const shown = offerFilter === "alle" ? listings : listings.filter((l) => OFFER_FILTERS[offerFilter].includes(l.offer));
            return shown.length === 0 ? (
              <p className="card py-8 text-center text-sm text-cream/70">{t("noListingsFilter")}</p>
            ) : (
        <ul className="grid grid-cols-3 gap-1 sm:gap-2">
          {shown.map((l) => (
            <li key={l.id}>
              <Link href={`/marktplatz/${l.id}`} className="group relative block aspect-[3/4] overflow-hidden rounded-md bg-night-3 sm:rounded-xl">
                {l.cover_photo_id ? (
                  <img src={photoUrl(l.owner_id, l.cover_photo_id, "thumb")} alt={l.title} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center p-2 text-center text-xs text-cream/60">{l.title}</span>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night/90 to-transparent px-1.5 pb-1 pt-4 text-[11px] font-bold text-brand">
                  <PriceTag offer={l.offer} cents={l.price_cents} negotiable={l.negotiable} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
            );
          })()}
        </div>
      )}
    </div>
  );
}

