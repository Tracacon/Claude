"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@/i18n/navigation";
import { MarketIcon, PlusIcon } from "./icons";

/** "+" oben rechts wie bei Instagram: Beitrag oder Inserat erstellen */
export function CreateMenu({ labels }: { labels: { create: string; post: string; postHint: string; listing: string; listingHint: string; close: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={labels.create}
        className="rounded-lg p-1.5 text-cream hover:text-brand"
      >
        <PlusIcon className="size-[26px]" />
      </button>
      {open &&
        createPortal(
        <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={labels.create}>
          <button type="button" aria-label={labels.close} className="absolute inset-0 bg-night/75" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-sm rounded-t-3xl border border-line bg-night-2 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:rounded-3xl">
            <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/20 sm:hidden" />
            <p className="px-3 pb-2 text-center font-display font-semibold">{labels.create}</p>
            <Link href="/beitrag/neu" onClick={() => setOpen(false)} className="flex items-center gap-4 rounded-xl px-3 py-3 hover:bg-white/5">
              <span className="flex size-11 items-center justify-center rounded-xl bg-brand/15 text-brand"><PlusIcon /></span>
              <span>
                <span className="block font-semibold">{labels.post}</span>
                <span className="block text-sm text-cream/60">{labels.postHint}</span>
              </span>
            </Link>
            <Link href="/marktplatz/neu" onClick={() => setOpen(false)} className="flex items-center gap-4 rounded-xl px-3 py-3 hover:bg-white/5">
              <span className="flex size-11 items-center justify-center rounded-xl bg-brand/15 text-brand"><MarketIcon /></span>
              <span>
                <span className="block font-semibold">{labels.listing}</span>
                <span className="block text-sm text-cream/60">{labels.listingHint}</span>
              </span>
            </Link>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
