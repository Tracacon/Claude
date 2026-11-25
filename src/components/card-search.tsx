"use client";
/* eslint-disable @next/next/no-img-element -- Kartenbilder kommen direkt aus der Kartendatenbank */

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { findCardByCode, findCards } from "@/lib/actions/cards";
import type { CardHit } from "@/lib/marketplace";
import { setsForCode, suggestSetCodes } from "@/lib/set-codes";

/**
 * Karte finden: schnell über Set-Kürzel und Nummer ("MEW" + "199") oder über den Namen
 * (deutsch oder englisch). Die gewählte Karte landet als Kennung im Formular (card_id);
 * die Kartendaten holt der Server beim Speichern selbst.
 */
export function CardSearch({ initial, onChange }: { initial: CardHit | null; onChange: (card: CardHit | null) => void }) {
  const t = useTranslations("Listing");
  const [card, setCard] = useState<CardHit | null>(initial);

  // Suche über Kürzel und Nummer
  const [code, setCode] = useState("");
  const [number, setNumber] = useState("");
  const [codeFocus, setCodeFocus] = useState(false);
  const [codeResult, setCodeResult] = useState<{ sets: { name: string }[]; hits: CardHit[] } | null>(null);
  const [codePending, startCode] = useTransition();
  const lastCode = useRef("");

  // Suche über den Namen
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CardHit[] | null>(null);
  const [pending, startTransition] = useTransition();
  const last = useRef("");

  const [failed, setFailed] = useState(false);

  const knownSets = setsForCode(code);
  const suggestions = codeFocus && code.trim() && knownSets.length === 0 ? suggestSetCodes(code) : [];

  useEffect(() => {
    const c = code.trim();
    const n = number.trim();
    if (!c || !n) {
      lastCode.current = "";
      return;
    }
    const key = `${c}|${n}`;
    const timer = setTimeout(() => {
      lastCode.current = key;
      startCode(async () => {
        const r = await findCardByCode(c, n);
        if (lastCode.current !== key) return; // inzwischen weitergetippt
        if ("error" in r) {
          setFailed(true);
          setCodeResult(null);
        } else {
          setFailed(false);
          setCodeResult(r);
        }
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [code, number]);

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
        if (last.current !== q) return;
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
    setCode("");
    setNumber("");
    setCodeResult(null);
  }

  const noEnter = (e: React.KeyboardEvent) => {
    // Enter soll hier nicht das ganze Formular abschicken
    if (e.key === "Enter") e.preventDefault();
  };

  if (card) {
    return (
      <div className="space-y-2">
        <input type="hidden" name="card_id" value={card.id} />
        <input type="hidden" name="card_json" value={JSON.stringify(card)} />
        <p className="label">{t("cardChosen")}</p>
        <div className="flex items-center gap-3 rounded-xl border border-brand bg-brand/10 p-3">
          <CardThumb src={card.image} big />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{card.name}</p>
            {card.name_en && <p className="text-sm text-cream/60">{card.name_en}</p>}
            <p className="text-sm text-cream/75">
              {card.set} · {card.number}
            </p>
          </div>
        </div>
        <button type="button" className="btn-ghost" onClick={() => choose(null)}>
          {t("cardChange")}
        </button>
      </div>
    );
  }

  const codeKnown = knownSets.length > 0 ? knownSets : (codeResult?.sets ?? []);
  const showUnknown = code.trim().length >= 2 && knownSets.length === 0 && !codePending && codeResult !== null && codeResult.sets.length === 0;

  return (
    <div className="space-y-4">
      <input type="hidden" name="card_id" value="" />
      <input type="hidden" name="card_json" value="" />

      {/* Schnell über Kürzel und Nummer */}
      <fieldset className="space-y-2 rounded-xl border border-line p-3">
        <legend className="px-1 text-sm font-semibold">{t("codeTitle")}</legend>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <label htmlFor="card-code" className="label">{t("codeLabel")}</label>
            <input
              id="card-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeResult(null);
              }}
              onFocus={() => setCodeFocus(true)}
              onBlur={() => setTimeout(() => setCodeFocus(false), 150)}
              onKeyDown={noEnter}
              placeholder={t("codePlaceholder")}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={40}
              className="input"
              aria-describedby="card-code-hint"
            />
            {suggestions.length > 0 && (
              <ul className="absolute left-0 top-full z-20 mt-1 max-h-64 w-[min(18rem,calc(100vw-3rem))] overflow-y-auto rounded-xl border border-line bg-night-2 p-1 shadow-lg">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setCode(s.code);
                        setCodeFocus(false);
                        document.getElementById("card-number")?.focus();
                      }}
                      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-brand/10"
                    >
                      <span className="w-14 shrink-0 font-semibold text-brand">{s.code}</span>
                      <span className="min-w-0 truncate">{s.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-cream/50">{s.released.slice(0, 4)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label htmlFor="card-number" className="label">{t("numberLabel")}</label>
            <input
              id="card-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              onKeyDown={noEnter}
              placeholder={t("numberPlaceholder")}
              autoComplete="off"
              maxLength={20}
              className="input"
            />
          </div>
        </div>
        <p id="card-code-hint" className="hint">
          {codeKnown.length > 0
            ? codeKnown.map((s) => t("codeSet", { code: code.trim().toUpperCase(), name: s.name })).join(" · ")
            : showUnknown
              ? t("codeUnknown")
              : t("codeHint")}
        </p>
        <div aria-live="polite">
          {codePending && <p className="text-sm text-cream/60">{t("cardSearching")}</p>}
          {!codePending && codeResult && codeResult.sets.length > 0 && number.trim() && codeResult.hits.length === 0 && (
            <p className="text-sm text-cream/75">{t("codeNoHit")}</p>
          )}
          {!codePending && codeResult && codeResult.hits.length > 0 && <HitList hits={codeResult.hits} onPick={choose} />}
        </div>
      </fieldset>

      {/* Über den Namen */}
      <div className="space-y-2">
        <label htmlFor="card-search" className="label">{t("orByName")}</label>
        <input
          id="card-search"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim().length < 2) setHits(null);
          }}
          onKeyDown={noEnter}
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
          {hits && !pending && hits.length === 0 && <p className="text-sm text-cream/75">{t("cardNoHits")}</p>}
          {hits && hits.length > 0 && <HitList hits={hits} onPick={choose} />}
        </div>
      </div>

      {failed && <p className="text-sm text-cream/75">{t("cardSearchError")}</p>}
      <p className="hint">{t("cardManual")}</p>
    </div>
  );
}

function CardThumb({ src, big = false }: { src: string | null; big?: boolean }) {
  const size = big ? "h-[78px] w-14" : "h-[61px] w-11";
  return src ? (
    <img src={src} alt="" loading="lazy" width={big ? 56 : 44} height={big ? 78 : 61} className={`${size} shrink-0 rounded object-cover`} />
  ) : (
    <span className={`${size} shrink-0 rounded bg-night`} />
  );
}

function HitList({ hits, onPick }: { hits: CardHit[]; onPick: (c: CardHit) => void }) {
  return (
    <ul className="max-h-[26rem] space-y-1.5 overflow-y-auto rounded-xl border border-line p-1.5">
      {hits.map((h) => (
        <li key={h.id}>
          <button
            type="button"
            onClick={() => onPick(h)}
            className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-brand/10 focus-visible:bg-brand/10"
          >
            <CardThumb src={h.image} />
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
  );
}
