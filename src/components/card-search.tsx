"use client";
/* eslint-disable @next/next/no-img-element -- Kartenbilder kommen direkt aus der Kartendatenbank */

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { findCards } from "@/lib/actions/cards";
import type { CardHit } from "@/lib/marketplace";

/**
 * Kartensuche beim Tippen: Name (deutsch oder englisch) oder Nummer von der Karte.
 * Die gewählte Karte landet als Kennung im Formular (card_id); die Daten holt der Server beim Speichern.
 */
export function CardSearch({ initial, onChange }: { initial: CardHit | null; onChange: (card: CardHit | null) => void }) {
  const t = useTranslations("Listing");
  const [card, setCard] = useState<CardHit | null>(initial);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CardHit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const last = useRef("");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      last.current = "";
      return;
    }
    const timer = setTimeout(() => {
      last.current = q;
      startTransition(async () => {
        const r = await findCards(q);
        if (last.current !== q) return; // inzwischen weitergetippt
        if ("hits" in r) {
          setFailed(false);
          setHits(r.hits);
        } else {
          setFailed(true);
          setHits(null);
        }
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  function choose(c: CardHit | null) {
    setCard(c);
    onChange(c);
    setQuery("");
    setHits(null);
  }

  const json = card ? JSON.stringify(card) : "";

  if (card) {
    return (
      <div className="space-y-2">
        <input type="hidden" name="card_id" value={card.id} />
        <input type="hidden" name="card_json" value={json} />
        <p className="label">{t("cardChosen")}</p>
        <div className="flex items-center gap-3 rounded-xl border border-brand bg-brand/10 p-3">
          {card.image ? (
            <img src={card.image} alt="" width={56} height={78} className="h-[78px] w-14 shrink-0 rounded object-cover" />
          ) : (
            <span className="h-[78px] w-14 shrink-0 rounded bg-night" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{card.name}</p>
            {card.name_en && <p className="text-sm text-cream/60">{card.name_en}</p>}
            <p className="text-sm text-cream/75">
              {card.set} · {card.number}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => choose(null)}>
            {t("cardChange")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name="card_id" value="" />
      <input type="hidden" name="card_json" value="" />
      <label htmlFor="card-search" className="label">{t("cardSearch")}</label>
      <input
        id="card-search"
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value.trim().length < 2) setHits(null);
        }}
        onKeyDown={(e) => {
          // Enter soll hier nicht das ganze Formular abschicken
          if (e.key === "Enter") e.preventDefault();
        }}
        placeholder={t("cardSearchPlaceholder")}
        autoComplete="off"
        enterKeyHint="search"
        className="input"
        aria-describedby="card-search-hint"
        aria-controls="card-hits"
      />
      <p id="card-search-hint" className="hint">{t("cardSearchHint")}</p>

      <div id="card-hits" aria-live="polite">
        {pending && <p className="text-sm text-cream/60">{t("cardSearching")}</p>}
        {failed && !pending && <p className="text-sm text-cream/75">{t("cardSearchError")}</p>}
        {hits && !pending && hits.length === 0 && <p className="text-sm text-cream/75">{t("cardNoHits")}</p>}
        {hits && hits.length > 0 && (
          <ul className="max-h-[26rem] space-y-1.5 overflow-y-auto rounded-xl border border-line p-1.5">
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => choose(h)}
                  className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-brand/10 focus-visible:bg-brand/10"
                >
                  {h.image ? (
                    <img src={h.image} alt="" loading="lazy" width={44} height={61} className="h-[61px] w-11 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="h-[61px] w-11 shrink-0 rounded bg-night" />
                  )}
                  <span className="min-w-0">
                    <span className="block font-medium">{h.name}</span>
                    {h.name_en && <span className="block text-xs text-cream/60">{h.name_en}</span>}
                    <span className="block text-sm text-cream/75">
                      {h.set} · {h.number}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="hint">{t("cardManual")}</p>
    </div>
  );
}
