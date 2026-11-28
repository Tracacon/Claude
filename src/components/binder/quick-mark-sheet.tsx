"use client";
/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { OfferIcon } from "@/components/offer-icon";
import { Link, useRouter } from "@/i18n/navigation";
import { quickMark } from "@/lib/actions/listings";
import { centsToInput } from "@/lib/marketplace";
import type { PocketCard } from "./binder-view";

const OPTIONS = ["collection", "trade", "sell", "sell_or_trade", "gift"] as const;
type Option = (typeof OPTIONS)[number];

/**
 * Schnell markieren direkt im Binder: Karte antippen → dieses Fenster.
 * Ein Tipp markiert zum Tauschen oder Verschenken bzw. legt zurück in die Sammlung;
 * für Verkauf kommt kurz das Preisfeld. Fehlt etwas (Rückseite, Titel), führt ein Knopf zum Ergänzen.
 */
export function QuickMarkSheet({
  card,
  returnTo,
  onClose,
  onMarked,
}: {
  card: PocketCard;
  /** Binder-Adresse: nach dem Ergänzen geht es hierhin zurück */
  returnTo: string;
  onClose: () => void;
  onMarked: (mark: PocketCard["mark"], offer: string, priceCents: number | null) => void;
}) {
  const t = useTranslations("QuickMark");
  const tOffer = useTranslations("Offer");
  const tErr = useTranslations("Errors");
  const tL = useTranslations("Listing");
  const router = useRouter();
  const current: Option = card.mark ?? "collection";
  const [choice, setChoice] = useState<Option>(current);
  const [price, setPrice] = useState(centsToInput(card.price_cents));
  const [negotiable, setNegotiable] = useState(card.negotiable);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const needsPrice = choice === "sell" || choice === "sell_or_trade";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function apply(opt: Option) {
    setError(undefined);
    startTransition(async () => {
      const r = await quickMark(card.id, opt, price, negotiable);
      if (r.error) {
        setError(r.error);
        return;
      }
      const cents = opt === "sell" || opt === "sell_or_trade" ? Math.round(Number(price.replace(/\./g, "").replace(",", ".")) * 100) : null;
      onMarked(opt === "collection" ? null : opt, opt === "collection" ? card.offer : opt, cents);
      router.refresh();
      onClose();
    });
  }

  function pick(opt: Option) {
    setChoice(opt);
    setError(undefined);
    // Ohne Preis sofort übernehmen
    if (opt !== "sell" && opt !== "sell_or_trade") apply(opt);
  }

  // Beim Ergänzen das gewählte Angebot gleich vorauswählen
  const editHref = `/marktplatz/${card.id}/bearbeiten?zurueck=${encodeURIComponent(returnTo)}${choice !== current ? `&angebot=${choice}` : ""}`;
  const missing = error === "front_back_required" || error === "title_required" || error === "tcg_required";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={card.title}>
      <button type="button" aria-label={t("close")} className="absolute inset-0 bg-night/75" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-3xl border-t border-line bg-night-2 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl sm:rounded-3xl sm:border">
        <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/20 sm:hidden" />
        <div className="flex items-center gap-3">
          <span className="block aspect-[63/88] w-16 shrink-0 overflow-hidden rounded-md border border-white/15 bg-night-3">
            {card.front && <img src={card.front} alt="" className="h-full w-full object-cover" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{card.title}</p>
            <p className="text-sm text-cream/60">{card.mark ? tOffer(card.mark) : t("onlyCollection")}</p>
            <div className="mt-1.5 flex gap-3 text-sm">
              <Link href={`/marktplatz/${card.id}`} className="text-brand hover:underline">{t("view")}</Link>
              <Link href={editHref} className="text-brand hover:underline">{t("edit")}</Link>
            </div>
          </div>
        </div>

        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-cream/60">{t("markAs")}</p>
        <div className="grid grid-cols-5 gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o}
              type="button"
              disabled={pending}
              onClick={() => pick(o)}
              aria-pressed={choice === o}
              className={`flex flex-col items-center gap-1 rounded-2xl border px-1 py-2.5 text-[11px] font-semibold leading-tight transition-colors ${
                choice === o ? "border-brand bg-brand text-on-brand" : "border-line text-cream/80 hover:border-brand/60"
              }`}
            >
              <OfferIcon offer={o} className="size-6" />
              {o === "collection" ? t("onlyCollectionShort") : tOffer(o)}
            </button>
          ))}
        </div>

        {needsPrice && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line px-4 py-2">
            <span className="text-2xl font-black text-brand" aria-hidden>€</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              autoFocus
              placeholder={tL("priceHint")}
              aria-label={tL("price")}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-2xl font-black outline-none placeholder:text-base placeholder:font-normal placeholder:text-cream/40"
            />
            <label className="flex shrink-0 items-center gap-2 text-sm">
              <input type="checkbox" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} className="size-5 accent-brand" />
              {tL("negotiable")}
            </label>
          </div>
        )}

        {error && (
          <div role="alert" className="mt-3 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
            <p>{tErr.has(error) ? tErr(error) : tErr("generic")}</p>
            {missing && (
              <Link href={editHref} className="btn-primary mt-2 w-full">{t("complete")}</Link>
            )}
          </div>
        )}

        {needsPrice && (
          <button type="button" className="btn-primary mt-3 w-full" disabled={pending || price.trim() === ""} onClick={() => apply(choice)}>
            {pending ? t("saving") : t("apply")}
          </button>
        )}
        {!needsPrice && pending && <p className="mt-3 text-center text-sm text-cream/70">{t("saving")}</p>}
      </div>
    </div>,
    document.body,
  );
}
