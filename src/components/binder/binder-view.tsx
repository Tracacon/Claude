"use client";
/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { FormError } from "@/components/form-error";
import { Link, useRouter } from "@/i18n/navigation";
import { moveToPocket } from "@/lib/actions/binders";
import { BINDER_COLOR_STYLES, POCKETS_PER_PAGE, type BinderColor } from "@/lib/binder-shared";
import { AddToBinderSheet, type PickCard } from "./add-to-binder-sheet";

export type PocketCard = {
  id: string;
  title: string;
  /** Vorderseite (erstes Foto) */
  front: string | null;
  pocket: number;
  quantity: number;
  /** Markierung für den Marktplatz, null = nur Sammlung */
  mark: "trade" | "sell" | "sell_or_trade" | "gift" | null;
};

const MARK_ICON: Record<string, string> = { trade: "🔁", sell_or_trade: "🔁€", sell: "€", gift: "🎁" };

/**
 * Aufgeschlagener Sammelkartenbinder: Seiten mit 3 × 3 Fächern zum Durchblättern.
 * Handy: eine Seite, wischen. Breiter Bildschirm: Doppelseite wie ein echter Binder.
 * Eigentümer können Karten umsortieren (antippen oder mit der Maus ziehen) und über das
 * Plus in leeren Fächern neue oder vorhandene Karten genau dort einsortieren.
 */
export function BinderView({
  cards: initial,
  color,
  sortable,
  binderId,
  pickable = [],
}: {
  cards: PocketCard[];
  color: BinderColor;
  /** Eigener Binder: Umsortieren und Hinzufügen erlaubt */
  sortable: boolean;
  binderId?: string;
  /** Eigene Karten aus anderen Bindern oder ohne Binder */
  pickable?: PickCard[];
}) {
  const t = useTranslations("Binder");
  const tOffer = useTranslations("Offer");
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [sorting, setSorting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [perView, setPerView] = useState(1);
  /** Offenes Auswahlfenster: Fach (ab 0) oder null = nächste freie Fächer */
  const [sheet, setSheet] = useState<{ pocket: number | null } | null>(null);
  const canAdd = sortable && Boolean(binderId);

  // Neue Daten vom Server (nach dem Umsortieren) übernehmen
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setCards(initial);
  }

  const c = BINDER_COLOR_STYLES[color] ?? BINDER_COLOR_STYLES.night;
  const last = cards.reduce((m, x) => Math.max(m, x.pocket), -1);
  // Seiten bis zur letzten Karte; beim Sortieren eine leere Seite mehr; immer gerade Anzahl (Doppelseiten)
  let pageCount = Math.max(1, Math.floor(last / POCKETS_PER_PAGE) + 1 + (sorting ? 1 : 0));
  if (pageCount % 2 === 1) pageCount += 1;

  const byPocket = useMemo(() => new Map(cards.map((x) => [x.pocket, x])), [cards]);

  // Aktuelle Seite aus der Scrollposition
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => {
      const first = el.firstElementChild as HTMLElement | null;
      const w = first?.offsetWidth || el.clientWidth;
      setPerView(Math.max(1, Math.round(el.clientWidth / w)));
      setPage(Math.round(el.scrollLeft / w));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [pageCount]);

  const go = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  };

  function drop(pocket: number) {
    if (!selected) return;
    const card = cards.find((x) => x.id === selected);
    if (!card || card.pocket === pocket) {
      setSelected(null);
      return;
    }
    const before = cards;
    const other = byPocket.get(pocket);
    setCards(cards.map((x) => (x.id === card.id ? { ...x, pocket } : other && x.id === other.id ? { ...x, pocket: card.pocket } : x)));
    setSelected(null);
    setError(undefined);
    startTransition(async () => {
      const r = await moveToPocket(card.id, pocket);
      if (r.error) {
        setCards(before);
        setError(r.error);
      } else router.refresh();
    });
  }

  const pageLabel =
    perView > 1
      ? t("pages", { from: page + 1, to: Math.min(page + perView, pageCount), count: pageCount })
      : t("page", { page: page + 1, count: pageCount });

  return (
    <div className="space-y-3">
      {sortable && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-cream/70" role="status">
            {sorting ? (selected ? t("sortPickTarget") : t("sortPickCard")) : t("sortIntro")}
          </p>
          <div className="flex gap-2">
            {canAdd && !sorting && (
              <button type="button" onClick={() => setSheet({ pocket: null })} className="btn-primary">
                + {t("add")}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSorting((s) => !s);
                setSelected(null);
              }}
              className={sorting ? "btn-primary" : "btn-ghost"}
              aria-pressed={sorting}
            >
              {sorting ? t("sortDone") : `↔ ${t("sort")}`}
            </button>
          </div>
        </div>
      )}
      <FormError code={error} />

      {/* Einband */}
      <div
        className="rounded-xl p-2 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.9)] sm:p-3"
        style={{ background: `radial-gradient(140% 100% at 20% 0%, ${c.base} 0%, ${c.edge} 100%)` }}
      >
        <div
          ref={scroller}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label={t("pagesLabel")}
        >
          {Array.from({ length: pageCount }, (_, p) => (
            <section
              key={p}
              aria-label={t("page", { page: p + 1, count: pageCount })}
              className={`relative w-full shrink-0 snap-start bg-[#0f1419] py-3 pr-3 pl-7 md:w-1/2 ${
                p % 2 === 0 ? "md:rounded-l-lg md:border-r md:border-black/60" : "md:rounded-r-lg"
              } rounded-lg md:rounded-none`}
            >
              {/* Lochung für die Ringe */}
              <span aria-hidden className="absolute inset-y-0 left-2 flex flex-col justify-around py-[12%]">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-2.5 rounded-full bg-black shadow-[inset_0_1px_2px_rgba(255,255,255,0.25)]" />
                ))}
              </span>
              <ol className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {Array.from({ length: POCKETS_PER_PAGE }, (_, i) => {
                  const pocket = p * POCKETS_PER_PAGE + i;
                  const card = byPocket.get(pocket);
                  const isSel = card && selected === card.id;
                  const inner = (
                    <>
                      {card?.front ? (
                        <img src={card.front} alt={card.title} loading={p < 2 ? "eager" : "lazy"} className="absolute inset-[3px] h-[calc(100%-6px)] w-[calc(100%-6px)] rounded-[4px] object-cover" />
                      ) : card ? (
                        <span className="absolute inset-[3px] flex items-center justify-center rounded-[4px] bg-night-3 p-1 text-center text-[10px] text-cream/70">{card.title}</span>
                      ) : null}
                      {/* Schutzhülle: Glanz und Einstecklasche */}
                      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[6px] bg-[linear-gradient(125deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0.04)_30%,transparent_55%,rgba(255,255,255,0.08)_100%)]" />
                      <span aria-hidden className="pointer-events-none absolute inset-x-1 top-[6%] h-px bg-white/25" />
                      {card?.mark && (
                        <span className="absolute right-1 top-1 rounded bg-brand px-1 py-0.5 text-[10px] font-bold leading-none text-on-brand shadow" title={tOffer(card.mark)}>
                          {MARK_ICON[card.mark]}
                        </span>
                      )}
                      {card && card.quantity > 1 && (
                        <span className="absolute bottom-1 left-1 rounded bg-night/85 px-1 py-0.5 text-[10px] font-semibold leading-none text-cream">×{card.quantity}</span>
                      )}
                    </>
                  );
                  const pocketClass = `relative block aspect-[63/88] rounded-[6px] border ${
                    isSel ? "border-brand ring-2 ring-brand" : card ? "border-white/20" : "border-dashed border-white/12 bg-white/[0.025]"
                  }`;
                  return (
                    <li key={pocket}>
                      {sorting ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => (selected ? drop(pocket) : card && setSelected(card.id))}
                          // Am Computer: Karte mit der Maus in ein anderes Fach ziehen
                          draggable={Boolean(card)}
                          onDragStart={(ev) => {
                            if (!card) return;
                            ev.dataTransfer.effectAllowed = "move";
                            ev.dataTransfer.setData("text/plain", card.id);
                            setSelected(card.id);
                          }}
                          onDragOver={(ev) => {
                            ev.preventDefault();
                            ev.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(ev) => {
                            ev.preventDefault();
                            drop(pocket);
                          }}
                          className={`${pocketClass} w-full ${selected && !isSel ? "hover:border-brand/70" : ""} ${card ? "cursor-grab active:cursor-grabbing" : ""}`}
                          aria-label={card ? t("pocketCard", { title: card.title }) : t("pocketEmpty", { pocket: pocket + 1 })}
                          aria-pressed={Boolean(isSel)}
                        >
                          {inner}
                        </button>
                      ) : card ? (
                        <Link href={`/marktplatz/${card.id}`} className={`${pocketClass} transition-transform hover:-translate-y-0.5`} title={card.title}>
                          {inner}
                        </Link>
                      ) : canAdd ? (
                        // Leeres Fach im eigenen Binder: Plus zum Einsortieren genau hier
                        <button
                          type="button"
                          onClick={() => setSheet({ pocket })}
                          className={`${pocketClass} group w-full hover:border-brand/70 hover:bg-brand/5`}
                          aria-label={t("pocketAdd", { pocket: pocket + 1 })}
                        >
                          <span className="absolute inset-0 flex items-center justify-center text-2xl font-light text-cream/25 group-hover:text-brand">+</span>
                        </button>
                      ) : (
                        <span className={pocketClass} aria-label={t("pocketEmpty", { pocket: pocket + 1 })} />
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      </div>

      {sheet && binderId && (
        <AddToBinderSheet binderId={binderId} pocket={sheet.pocket} cards={pickable} onClose={() => setSheet(null)} />
      )}

      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => go(-1)} disabled={page === 0} className="btn-ghost disabled:opacity-40" aria-label={t("prev")}>
          ‹ {t("prev")}
        </button>
        <span className="text-sm text-cream/70">{pageLabel}</span>
        <button type="button" onClick={() => go(1)} disabled={page + perView >= pageCount} className="btn-ghost disabled:opacity-40" aria-label={t("next")}>
          {t("next")} ›
        </button>
      </div>
    </div>
  );
}
