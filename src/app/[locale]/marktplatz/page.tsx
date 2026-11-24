import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { ListingCard } from "@/components/listing-card";
import { Link } from "@/i18n/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { KINDS, OFFERS, PAGE_SIZE, SORTS, TCGS, parseEuroToCents, type ListingSummary } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/marktplatz">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Market" });
  return { title: t("title"), description: t("intro") };
}

const pick = <T extends string>(list: readonly T[], v: unknown): T | null =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null;

export default async function MarketPage({ params, searchParams }: PageProps<"/[locale]/marktplatz">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await connection();
  const sp = await searchParams;
  const t = await getTranslations("Market");
  const tTcg = await getTranslations("Tcg");
  const tKind = await getTranslations("Kind");
  const tOffer = await getTranslations("Offer");

  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const tcg = pick(TCGS, sp.spiel);
  const kind = pick(KINDS, sp.art);
  const offer = pick(OFFERS, sp.angebot);
  const sort = pick(SORTS, sp.sort) ?? "newest";
  const minRaw = typeof sp.preis_min === "string" ? sp.preis_min : "";
  const maxRaw = typeof sp.preis_max === "string" ? sp.preis_max : "";
  const min = parseEuroToCents(minRaw);
  const max = parseEuroToCents(maxRaw);
  const page = Math.max(1, Number.parseInt(typeof sp.seite === "string" ? sp.seite : "1", 10) || 1);

  let items: ListingSummary[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("search_listings", {
      p_query: q || null,
      p_tcg: tcg,
      p_kind: kind,
      p_offer: offer,
      p_min_cents: min !== null && !Number.isNaN(min) ? min : null,
      p_max_cents: max !== null && !Number.isNaN(max) ? max : null,
      p_sort: sort,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    });
    if (error) console.error("search_listings", error.message);
    items = (data ?? []) as ListingSummary[];
  }
  const total = items[0] ? Number(items[0].total_count) : 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(q || tcg || kind || offer || minRaw || maxRaw);

  const query = (p: number) => ({
    ...(q ? { q } : {}),
    ...(tcg ? { spiel: tcg } : {}),
    ...(kind ? { art: kind } : {}),
    ...(offer ? { angebot: offer } : {}),
    ...(minRaw ? { preis_min: minRaw } : {}),
    ...(maxRaw ? { preis_max: maxRaw } : {}),
    ...(sort !== "newest" ? { sort } : {}),
    ...(p > 1 ? { seite: String(p) } : {}),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-cream/70">{t("intro")}</p>
        </div>
        <Link href="/marktplatz/neu" className="btn-primary hidden sm:inline-flex">+ {t("sell")}</Link>
      </div>

      <form role="search" className="card space-y-3 p-4 sm:p-4">
        <div className="flex gap-2">
          <label htmlFor="q" className="sr-only">{t("search")}</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder={t("searchPlaceholder")} className="input" />
          <button type="submit" className="btn-primary shrink-0">{t("filter")}</button>
        </div>
        <details open={filtered || sort !== "newest"}>
          <summary className="cursor-pointer text-sm text-cream/70">{t("game")}, {t("kind")}, {t("offer")}, {t("sort")} …</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="spiel" className="label">{t("game")}</label>
              <select id="spiel" name="spiel" defaultValue={tcg ?? ""} className="input">
                <option value="">{t("allGames")}</option>
                {TCGS.map((x) => <option key={x} value={x}>{tTcg(x)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="art" className="label">{t("kind")}</label>
              <select id="art" name="art" defaultValue={kind ?? ""} className="input">
                <option value="">{t("allKinds")}</option>
                {KINDS.map((x) => <option key={x} value={x}>{tKind(x)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="angebot" className="label">{t("offer")}</label>
              <select id="angebot" name="angebot" defaultValue={offer ?? ""} className="input">
                <option value="">{t("allOffers")}</option>
                {OFFERS.map((x) => <option key={x} value={x}>{tOffer(x)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="preis_min" className="label">{t("priceMin")}</label>
              <input id="preis_min" name="preis_min" inputMode="decimal" defaultValue={minRaw} className="input" />
            </div>
            <div>
              <label htmlFor="preis_max" className="label">{t("priceMax")}</label>
              <input id="preis_max" name="preis_max" inputMode="decimal" defaultValue={maxRaw} className="input" />
            </div>
            <div>
              <label htmlFor="sort" className="label">{t("sort")}</label>
              <select id="sort" name="sort" defaultValue={sort} className="input">
                <option value="newest">{t("sortNewest")}</option>
                <option value="price_asc">{t("sortPriceAsc")}</option>
                <option value="price_desc">{t("sortPriceDesc")}</option>
              </select>
            </div>
          </div>
          {filtered && (
            <Link href="/marktplatz" className="link mt-3 inline-block text-sm">{t("reset")}</Link>
          )}
        </details>
      </form>

      <p className="text-sm text-cream/60" role="status">{t("results", { count: total })}</p>

      {items.length === 0 ? (
        <p className="card text-cream/70">{filtered ? t("empty") : t("emptyAll")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <li key={item.id} className="flex"><ListingCard item={item} /></li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label={t("page", { page, pages })}>
          {page > 1 ? <Link href={{ pathname: "/marktplatz", query: query(page - 1) }} className="link">← {t("prev")}</Link> : <span />}
          <span className="text-cream/60">{t("page", { page, pages })}</span>
          {page < pages ? <Link href={{ pathname: "/marktplatz", query: query(page + 1) }} className="link">{t("next")} →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
