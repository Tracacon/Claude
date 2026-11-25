import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { Avatar } from "@/components/avatar";
import { PostGrid } from "@/components/feed/post-grid";
import { CalendarIcon, MarketIcon, SearchIcon } from "@/components/icons";
import { Link } from "@/i18n/navigation";
import { eventDay } from "@/lib/event-format";
import { getEvents } from "@/lib/events";
import { getExplore, searchProfiles } from "@/lib/feed";

export async function generateMetadata({ params }: PageProps<"/[locale]/suche">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Search" });
  return { title: t("title") };
}

/** Suchen und Entdecken */
export default async function SearchPage({ params, searchParams }: PageProps<"/[locale]/suche">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await connection();
  const t = await getTranslations("Search");
  const tFeed = await getTranslations("Feed");
  const raw = (await searchParams).q;
  const q = (typeof raw === "string" ? raw : "").trim().slice(0, 60);

  const [people, events, explore] = await Promise.all([
    q ? searchProfiles(q) : Promise.resolve([]),
    getEvents(false, 30),
    q ? Promise.resolve([]) : getExplore(),
  ]);
  const matchingEvents = q ? events.filter((e) => `${e.name} ${e.city ?? ""}`.toLowerCase().includes(q.toLowerCase())) : [];

  return (
    <div className="mx-auto max-w-[620px] space-y-5">
      <h1 className="sr-only">{t("title")}</h1>
      <form role="search" className="relative">
        <label htmlFor="q" className="sr-only">{t("label")}</label>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-cream/50" />
        <input id="q" name="q" type="search" defaultValue={q} placeholder={t("placeholder")} autoComplete="off" className="input pl-10" />
      </form>

      {!q && (
        <div className="flex gap-2">
          <Link href="/termine" className="btn-ghost flex-1"><CalendarIcon className="size-5" /> {t("events")}</Link>
          <Link href="/marktplatz" className="btn-ghost flex-1"><MarketIcon className="size-5" /> {t("market")}</Link>
        </div>
      )}

      {q ? (
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="kicker">{t("people")}</h2>
            {people.length === 0 ? (
              <p className="text-sm text-cream/60">{t("noPeople")}</p>
            ) : (
              <ul className="space-y-1">
                {people.map((p) => (
                  <li key={p.id}>
                    <Link href={`/u/${p.nickname}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5">
                      <Avatar userId={p.id} avatarId={p.avatar_id} nickname={p.nickname} size="sm" />
                      <span>
                        <span className="block font-semibold">{p.nickname}</span>
                        <span className="block text-xs text-cream/60">{t("followers", { count: p.follower_count })}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="kicker">{t("market")}</h2>
            <Link href={{ pathname: "/marktplatz", query: { q } }} className="card card-hover flex items-center gap-3 p-4">
              <MarketIcon className="size-6 text-brand" />
              <span>{t("searchMarket", { q })}</span>
            </Link>
          </section>

          {matchingEvents.length > 0 && (
            <section className="space-y-2">
              <h2 className="kicker">{t("events")}</h2>
              <ul className="space-y-1">
                {matchingEvents.map((e) => (
                  <li key={e.id}>
                    <Link href={`/termine/${e.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5">
                      <CalendarIcon className="size-6 text-brand" />
                      <span>
                        <span className="block font-semibold">{e.name}</span>
                        <span className="block text-xs text-cream/60">{eventDay(e, locale)}{e.city ? ` · ${e.city}` : ""}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : explore.length > 0 ? (
        <section className="-mx-4 sm:mx-0">
          <h2 className="sr-only">{t("explore")}</h2>
          <PostGrid posts={explore} label={(p) => tFeed("gridLabel", { likes: p.like_count, comments: p.comment_count })} />
        </section>
      ) : (
        <p className="card text-sm text-cream/70">{t("exploreEmpty")}</p>
      )}
    </div>
  );
}
