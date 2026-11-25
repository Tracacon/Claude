"use client";
/* eslint-disable @next/next/no-img-element -- Kartenbilder kommen direkt aus der Kartendatenbank */

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { findCardByCode } from "@/lib/actions/cards";
import type { CardHit } from "@/lib/marketplace";
import { setsForCode, suggestSetCodes } from "@/lib/set-codes";

/**
 * Felder "Set-Kürzel" und "Kartennummer" im Inserat-Formular.
 * Beim Kürzel helfen Vorschläge (auch über den Set-Namen). Bei Pokémon zeigt eine kleine Vorschau,
 * welche Karte gefunden wurde; gespeichert werden Kürzel und Nummer, die Kartendaten holt der Server.
 */
export function CardCodeFields({
  initialCode,
  initialNumber,
  lookup,
}: {
  initialCode: string;
  initialNumber: string;
  /** Karte in der Kartendatenbank nachschlagen (nur Pokémon) */
  lookup: boolean;
}) {
  const t = useTranslations("Listing");
  const [code, setCode] = useState(initialCode);
  const [number, setNumber] = useState(initialNumber);
  const [focus, setFocus] = useState(false);
  const [found, setFound] = useState<CardHit | null>(null);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
  const last = useRef("");

  const knownSets = setsForCode(code);
  const suggestions = focus && code.trim() && knownSets.length === 0 ? suggestSetCodes(code) : [];

  useEffect(() => {
    const c = code.trim();
    const n = number.trim();
    if (!lookup || !c || !n) {
      last.current = "";
      return;
    }
    const key = `${c}|${n}`;
    const timer = setTimeout(() => {
      last.current = key;
      startTransition(async () => {
        const r = await findCardByCode(c, n);
        if (last.current !== key) return; // inzwischen weitergetippt
        setFound("hits" in r && r.hits.length > 0 ? r.hits[0] : null);
        setSearched(!("error" in r));
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [code, number, lookup]);

  const noEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") e.preventDefault();
  };

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="relative">
          <label htmlFor="card_code" className="label">{t("cardCode")}</label>
          <input
            id="card_code"
            name="card_code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setFound(null);
              setSearched(false);
            }}
            onFocus={() => setFocus(true)}
            onBlur={() => setTimeout(() => setFocus(false), 150)}
            onKeyDown={noEnter}
            placeholder={t("cardCodePlaceholder")}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
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
                      setFocus(false);
                      document.getElementById("card_no")?.focus();
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
          <label htmlFor="card_no" className="label">{t("cardNo")}</label>
          <input
            id="card_no"
            name="card_no"
            value={number}
            onChange={(e) => {
              setNumber(e.target.value);
              setFound(null);
              setSearched(false);
            }}
            onKeyDown={noEnter}
            placeholder={t("cardNoPlaceholder")}
            autoComplete="off"
            maxLength={20}
            className="input"
          />
        </div>
      </div>

      <p id="card-code-hint" className="hint">
        {knownSets.length > 0 ? knownSets.map((s) => `${s.code} = ${s.name}`).join(" · ") : t("cardCodeHint")}
      </p>

      {lookup && (
        <div aria-live="polite">
          {pending && <p className="text-sm text-cream/60">{t("cardLooking")}</p>}
          {!pending && found && (
            <div className="flex items-center gap-3 rounded-xl border border-brand/60 bg-brand/10 p-2.5">
              {found.image ? (
                <img src={found.image} alt="" width={40} height={56} className="h-14 w-10 shrink-0 rounded object-cover" />
              ) : (
                <span className="h-14 w-10 shrink-0 rounded bg-night" />
              )}
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{t("cardFound", { name: found.name })}</p>
                <p className="text-cream/70">
                  {found.set} · {found.number}
                </p>
              </div>
            </div>
          )}
          {!pending && !found && searched && <p className="text-sm text-cream/70">{t("cardNotFound")}</p>}
        </div>
      )}
    </div>
  );
}
