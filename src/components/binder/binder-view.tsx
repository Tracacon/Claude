"use client";
/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { FormError } from "@/components/form-error";
import { Link, useRouter } from "@/i18n/navigation";
import { moveToPocket } from "@/lib/actions/binders";
import {
  BINDER_COLOR_STYLES,
  COLLECTION_MARKS,
  matchesMark,
  POCKETS_PER_PAGE,
  type BinderColor,
  type BinderEffect,
  type CollectionMark,
} from "@/lib/binder-shared";
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
 * Eigentümer können Karten umsortieren (gedrückt halten und mit dem Finger ziehen, oder
 * im Modus „Umsortieren“ antippen) und über das
 * Plus in leeren Fächern neue oder vorhandene Karten genau dort einsortieren.
 */
export function BinderView({
  cards: initial,
  color,
  effect = "none",
  sortable,
  binderId,
  pickable = [],
}: {
  cards: PocketCard[];
  color: BinderColor;
  effect?: BinderEffect;
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
  const tC = useTranslations("Collection");
  /** Hervorheben: passende Karten bleiben hell, die anderen werden abgedunkelt */
  const [highlight, setHighlight] = useState<CollectionMark>("alle");

  // --- Ziehen mit dem Finger (gedrückt halten) bzw. der Maus -------------------
  const pocketEls = useRef(new Map<number, HTMLElement>());
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; target: number | null } | null>(null);
  const dragRef = useRef(drag);
  const press = useRef<{ id: string; x: number; y: number; mouse: boolean; timer: number | null } | null>(null);
  const suppressClick = useRef(false);
  const edgeTimer = useRef<number | null>(null);

  // Neue Daten vom Server (nach dem Umsortieren) übernehmen
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setCards(initial);
  }

  const c = BINDER_COLOR_STYLES[color] ?? BINDER_COLOR_STYLES.night;
  const last = cards.reduce((m, x) => Math.max(m, x.pocket), -1);
  // Seiten bis zur letzten Karte; beim Sortieren eine leere Seite mehr; immer gerade Anzahl (Doppelseiten)
  let pageCount = Math.max(1, Math.floor(last / POCKETS_PER_PAGE) + 1 + (sorting || drag ? 1 : 0));
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

  /** Karte in ein Fach legen; liegt dort eine Karte, tauschen beide den Platz */
  function dropCard(cardId: string, pocket: number) {
    const card = cards.find((x) => x.id === cardId);
    setSelected(null);
    if (!card || card.pocket === pocket) return;
    const before = cards;
    const other = byPocket.get(pocket);
    setCards(cards.map((x) => (x.id === card.id ? { ...x, pocket } : other && x.id === other.id ? { ...x, pocket: card.pocket } : x)));
    setError(undefined);
    startTransition(async () => {
      const r = await moveToPocket(card.id, pocket);
      if (r.error) {
        setCards(before);
        setError(r.error);
      } else router.refresh();
    });
  }

  function drop(pocket: number) {
    if (selected) dropCard(selected, pocket);
  }

  /** Fach unter dem Finger, mit Toleranz: auch knapp daneben zählt, das nächste Fach gewinnt */
  const findTarget = useCallback((x: number, y: number) => {
    let best: number | null = null;
    let bestDist = Infinity;
    for (const [pocket, el] of pocketEls.current) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const tolX = r.width * 0.4;
      const tolY = r.height * 0.3;
      if (x < r.left - tolX || x > r.right + tolX || y < r.top - tolY || y > r.bottom + tolY) continue;
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (d < bestDist) {
        bestDist = d;
        best = pocket;
      }
    }
    return best;
  }, []);

  const setDragState = useCallback((d: typeof drag) => {
    dragRef.current = d;
    setDrag(d);
  }, []);

  function startPress(e: React.PointerEvent, card: PocketCard) {
    if (!sortable || pending || e.button > 0) return;
    const mouse = e.pointerType === "mouse";
    const p = { id: card.id, x: e.clientX, y: e.clientY, mouse, timer: null as number | null };
    if (!mouse) {
      // Finger: kurz gedrückt halten, dann geht es los
      p.timer = window.setTimeout(() => {
        if (press.current !== p) return;
        navigator.vibrate?.(15);
        setDragState({ id: card.id, x: p.x, y: p.y, target: card.pocket });
      }, 280);
    }
    press.current = p;
  }

  // Bewegen, Loslassen und Umblättern am Rand während des Ziehens
  useEffect(() => {
    if (!sortable) return;
    const stopEdge = () => {
      if (edgeTimer.current) window.clearInterval(edgeTimer.current);
      edgeTimer.current = null;
    };
    const onMove = (e: PointerEvent) => {
      const p = press.current;
      const d = dragRef.current;
      if (!d) {
        if (!p) return;
        const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
        if (p.mouse && moved > 6) {
          setDragState({ id: p.id, x: e.clientX, y: e.clientY, target: findTarget(e.clientX, e.clientY) });
        } else if (!p.mouse && moved > 10) {
          // Finger bewegt sich vor dem Festhalten: das ist Wischen bzw. Scrollen
          if (p.timer) window.clearTimeout(p.timer);
          press.current = null;
        }
        return;
      }
      setDragState({ ...d, x: e.clientX, y: e.clientY, target: findTarget(e.clientX, e.clientY) });
      // Am Rand des Binders festhalten: Seite umblättern
      const el = scroller.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dir = e.clientX < r.left + 28 ? -1 : e.clientX > r.right - 28 ? 1 : 0;
      if (dir === 0) stopEdge();
      else if (!edgeTimer.current) {
        edgeTimer.current = window.setInterval(() => el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" }), 700);
      }
    };
    const onUp = () => {
      const p = press.current;
      if (p?.timer) window.clearTimeout(p.timer);
      press.current = null;
      stopEdge();
      const d = dragRef.current;
      if (!d) return;
      suppressClick.current = true;
      window.setTimeout(() => (suppressClick.current = false), 50);
      setDragState(null);
      if (d.target !== null) dropCard(d.id, d.target);
    };
    // Während des Ziehens darf die Seite nicht scrollen
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("touchmove", onTouchMove);
      stopEdge();
    };
    // dropCard ändert sich mit jeder Karte; die Listener lesen den Stand über Refs bzw. neu
  });

  const dragged = drag ? cards.find((x) => x.id === drag.id) : null;

  const pageLabel =
    perView > 1
      ? t("pages", { from: page + 1, to: Math.min(page + perView, pageCount), count: pageCount })
      : t("page", { page: page + 1, count: pageCount });

  return (
    <div className="space-y-3">
      {sortable && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-cream/70" role="status">
            {drag ? t("dragging") : sorting ? (selected ? t("sortPickTarget") : t("sortPickCard")) : t("sortIntro")}
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

      {cards.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label={t("highlight")}>
          {COLLECTION_MARKS.map((m) => {
            const n = cards.filter((x) => matchesMark(x.mark, m)).length;
            if (m !== "alle" && n === 0) return null;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setHighlight(m)}
                aria-pressed={highlight === m}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
                  highlight === m ? "border-brand bg-brand/15 font-semibold text-brand" : "border-line text-cream/75 hover:bg-white/5"
                }`}
              >
                {tC(`mark_${m}`)} ({n})
              </button>
            );
          })}
        </div>
      )}

      {/* Einband */}
      <div
        className="relative rounded-xl p-2 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.9)] sm:p-3"
        style={{ background: `radial-gradient(140% 100% at 20% 0%, ${c.base} 0%, ${c.edge} 100%)` }}
      >
        {effect !== "none" && <span aria-hidden className={`binder-fx binder-fx-${effect}`} />}
        <div
          ref={scroller}
          className="relative flex snap-x snap-mandatory overflow-x-auto rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                        <img src={card.front} alt={card.title} draggable={false} loading={p < 2 ? "eager" : "lazy"} className="absolute inset-[3px] h-[calc(100%-6px)] w-[calc(100%-6px)] rounded-[4px] object-cover" />
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
                  const isTarget = drag !== null && drag.target === pocket;
                  const isOrigin = drag !== null && card?.id === drag.id;
                  const pocketClass = `relative block aspect-[63/88] rounded-[6px] border transition-shadow select-none [-webkit-touch-callout:none] ${
                    isTarget
                      ? "border-brand ring-2 ring-brand shadow-[0_0_18px_4px_rgba(34,205,215,0.75)]"
                      : isSel
                        ? "border-brand ring-2 ring-brand"
                        : card
                          ? "border-white/20"
                          : "border-dashed border-white/12 bg-white/[0.025]"
                  } ${isOrigin ? "opacity-30" : ""} ${card && !matchesMark(card.mark, highlight) ? "opacity-25 grayscale" : ""}`;
                  const refFn = (el: HTMLElement | null) => {
                    if (el) pocketEls.current.set(pocket, el);
                    else pocketEls.current.delete(pocket);
                  };
                  const pressProps = card && sortable
                    ? {
                        onPointerDown: (ev: React.PointerEvent) => startPress(ev, card),
                        onContextMenu: (ev: React.MouseEvent) => ev.preventDefault(),
                        onClickCapture: (ev: React.MouseEvent) => {
                          if (suppressClick.current) {
                            ev.preventDefault();
                            ev.stopPropagation();
                          }
                        },
                        draggable: false,
                      }
                    : {};
                  return (
                    <li key={pocket}>
                      {sorting ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => (selected ? drop(pocket) : card && setSelected(card.id))}
                          ref={refFn}
                          {...pressProps}
                          className={`${pocketClass} w-full ${selected && !isSel ? "hover:border-brand/70" : ""} ${card ? "cursor-grab" : ""}`}
                          aria-label={card ? t("pocketCard", { title: card.title }) : t("pocketEmpty", { pocket: pocket + 1 })}
                          aria-pressed={Boolean(isSel)}
                        >
                          {inner}
                        </button>
                      ) : card ? (
                        <Link
                          href={`/marktplatz/${card.id}`}
                          ref={refFn}
                          {...pressProps}
                          className={`${pocketClass} hover:-translate-y-0.5`}
                          title={card.title}
                        >
                          {inner}
                        </Link>
                      ) : canAdd ? (
                        // Leeres Fach im eigenen Binder: Plus zum Einsortieren genau hier
                        <button
                          type="button"
                          ref={refFn}
                          onClick={() => setSheet({ pocket })}
                          className={`${pocketClass} group w-full hover:border-brand/70 hover:bg-brand/5`}
                          aria-label={t("pocketAdd", { pocket: pocket + 1 })}
                        >
                          <span className="absolute inset-0 flex items-center justify-center text-2xl font-light text-cream/25 group-hover:text-brand">+</span>
                        </button>
                      ) : (
                        <span ref={refFn} className={pocketClass} aria-label={t("pocketEmpty", { pocket: pocket + 1 })} />
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      </div>

      {drag &&
        dragged &&
        createPortal(
          <div className="binder-drag-ghost w-24" style={{ left: drag.x, top: drag.y }} aria-hidden>
            {dragged.front ? (
              <img src={dragged.front} alt="" className="aspect-[63/88] w-full object-cover" />
            ) : (
              <span className="flex aspect-[63/88] items-center justify-center bg-night-3 p-1 text-center text-[10px]">{dragged.title}</span>
            )}
          </div>,
          document.body,
        )}

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
