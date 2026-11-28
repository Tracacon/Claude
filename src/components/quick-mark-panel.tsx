"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { OfferIcon } from "@/components/offer-icon";
import { useRouter } from "@/i18n/navigation";
import { PendingLink } from "@/components/pending-link";
import { quickMark } from "@/lib/actions/listings";
import { centsToInput } from "@/lib/marketplace";

export const MARK_OPTIONS = ["collection", "trade", "sell", "sell_or_trade", "gift"] as const;
export type MarkOption = (typeof MARK_OPTIONS)[number];

/** Die fünf Auswahlknöpfe mit Symbol (Sammlung, Tausch, Verkauf, Verkauf oder Tausch, Verschenken) */
export function MarkButtons({
  value,
  onPick,
  disabled,
  name,
}: {
  value: MarkOption;
  onPick: (o: MarkOption) => void;
  disabled?: boolean;
  /** Als Formularfeld (Radio-Knöpfe mit diesem Namen) */
  name?: string;
}) {
  const t = useTranslations("QuickMark");
  const tOffer = useTranslations("Offer");
  const cls = (on: boolean) =>
    `flex flex-col items-center gap-1 rounded-2xl border px-1 py-2.5 text-[11px] font-semibold leading-tight transition-colors ${
      on ? "border-brand bg-brand text-on-brand" : "border-line bg-night-2 text-cream/80 hover:border-brand/60"
    }`;
  return (
    <div className="grid grid-cols-5 gap-2">
      {MARK_OPTIONS.map((o) =>
        name ? (
          <label key={o} className={`${cls(value === o)} cursor-pointer`}>
            <input type="radio" name={name} value={o} checked={value === o} onChange={() => onPick(o)} className="sr-only" />
            <OfferIcon offer={o} className="size-6" />
            {o === "collection" ? t("onlyCollectionShort") : tOffer(o)}
          </label>
        ) : (
          <button key={o} type="button" disabled={disabled} onClick={() => onPick(o)} aria-pressed={value === o} className={cls(value === o)}>
            <OfferIcon offer={o} className="size-6" />
            {o === "collection" ? t("onlyCollectionShort") : tOffer(o)}
          </button>
        ),
      )}
    </div>
  );
}

/**
 * Schnell markieren (im Binder-Fenster und auf der Kartenseite): ein Tipp markiert zum Tauschen
 * oder Verschenken bzw. legt zurück in die Sammlung; bei Verkauf kurz das Preisfeld.
 * Fehlt etwas (Rückseite, Titel), führt "Jetzt ergänzen" zum Bearbeiten.
 */
export function QuickMarkPanel({
  listingId,
  mark,
  offer,
  priceCents,
  negotiable: initialNegotiable,
  returnTo,
  onMarked,
}: {
  listingId: string;
  /** Aktuelle Markierung, null = nur Sammlung */
  mark: string | null;
  offer: string;
  priceCents: number | null;
  negotiable: boolean;
  /** Rücksprung nach dem Ergänzen (z. B. Binder oder Kartenseite) */
  returnTo: string;
  onMarked?: (mark: string | null, offer: string, priceCents: number | null) => void;
}) {
  const t = useTranslations("QuickMark");
  const tErr = useTranslations("Errors");
  const tL = useTranslations("Listing");
  const router = useRouter();
  const current = (mark ?? "collection") as MarkOption;
  const [choice, setChoice] = useState<MarkOption>(current);
  const [price, setPrice] = useState(centsToInput(priceCents));
  const [negotiable, setNegotiable] = useState(initialNegotiable);
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const needsPrice = choice === "sell" || choice === "sell_or_trade";

  function apply(opt: MarkOption) {
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      const r = await quickMark(listingId, opt, price, negotiable);
      if (r.error) {
        setError(r.error);
        return;
      }
      const cents = opt === "sell" || opt === "sell_or_trade" ? Math.round(Number(price.replace(/\./g, "").replace(",", ".")) * 100) : null;
      setSaved(true);
      onMarked?.(opt === "collection" ? null : opt, opt === "collection" ? offer : opt, cents);
      router.refresh();
    });
  }

  function pick(opt: MarkOption) {
    setChoice(opt);
    setError(undefined);
    setSaved(false);
    if (opt !== "sell" && opt !== "sell_or_trade") apply(opt);
  }

  const editHref = `/marktplatz/${listingId}/bearbeiten?zurueck=${encodeURIComponent(returnTo)}${choice !== current ? `&angebot=${choice}` : ""}`;
  const missing = error === "front_back_required" || error === "title_required" || error === "tcg_required";

  return (
    <div className="space-y-3">
      <MarkButtons value={choice} onPick={pick} disabled={pending} />
      {needsPrice && (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-night-2 px-4 py-2">
          <span className="text-2xl font-black text-brand-ink" aria-hidden>€</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
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
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
          <p>{tErr.has(error) ? tErr(error) : tErr("generic")}</p>
          {missing && (
            <PendingLink href={editHref} className="btn-primary mt-2 w-full" pendingLabel={t("opening")}>
              {t("complete")}
            </PendingLink>
          )}
        </div>
      )}
      {needsPrice && (
        <button type="button" className="btn-primary w-full" disabled={pending || price.trim() === ""} onClick={() => apply(choice)}>
          {pending ? t("saving") : t("apply")}
        </button>
      )}
      {!needsPrice && pending && <p className="text-center text-sm text-cream/70">{t("saving")}</p>}
      {saved && !pending && <p role="status" className="text-center text-sm text-ok">✓ {t("saved")}</p>}
    </div>
  );
}
