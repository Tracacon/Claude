"use client";
/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { QuickMarkPanel } from "@/components/quick-mark-panel";
import { PendingLink } from "@/components/pending-link";
import type { PocketCard } from "./binder-view";

/**
 * Schnell markieren direkt im Binder: Karte antippen → dieses Fenster (unten).
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={card.title}>
      <button type="button" aria-label={t("close")} className="absolute inset-0 bg-night/75" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-3xl border-t border-line bg-night-2 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl sm:rounded-3xl sm:border">
        <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-tint/20 sm:hidden" />
        <div className="flex items-center gap-3">
          <span className="block aspect-[63/88] w-16 shrink-0 overflow-hidden rounded-md border border-tint/15 bg-night-3">
            {card.front && <img src={card.front} alt="" className="h-full w-full object-cover" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{card.title}</p>
            <p className="text-sm text-cream/60">{card.mark ? tOffer(card.mark) : t("onlyCollection")}</p>
            <div className="mt-1.5 flex gap-3 text-sm">
              <PendingLink href={`/marktplatz/${card.id}`} className="text-brand-ink hover:underline" pendingLabel={t("opening")}>
                {t("view")}
              </PendingLink>
              <PendingLink href={`/marktplatz/${card.id}/bearbeiten?zurueck=${encodeURIComponent(returnTo)}`} className="text-brand-ink hover:underline" pendingLabel={t("opening")}>
                {t("edit")}
              </PendingLink>
            </div>
          </div>
        </div>
        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-cream/60">{t("markAs")}</p>
        <QuickMarkPanel
          listingId={card.id}
          mark={card.mark}
          offer={card.offer}
          priceCents={card.price_cents}
          negotiable={card.negotiable}
          returnTo={returnTo}
          onMarked={(mark, offer, cents) => {
            onMarked(mark as PocketCard["mark"], offer, cents);
            onClose();
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
