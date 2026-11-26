"use client";
/* eslint-disable @next/next/no-img-element -- Logos kommen direkt von tracacon.de */

import { useState } from "react";
import { DEALER_PRODUCTS, DEALER_TCGS, type Dealer, type DealerTcg } from "@/lib/event-details";

const TCG_LABEL = new Map<string, string>(DEALER_TCGS.map((t) => [t.key, t.label]));

/** Händler des Events mit Logo, TCGs, Produkten und Link – mit Filter nach TCG wie auf tracacon.de */
export function EventDealers({
  dealers,
  labels,
}: {
  dealers: Dealer[];
  labels: { all: string; filter: string; products: Record<string, string> };
}) {
  const [tcg, setTcg] = useState<DealerTcg | null>(null);
  const used = DEALER_TCGS.filter((t) => dealers.some((d) => d.tcgs.includes(t.key)));
  const shown = tcg ? dealers.filter((d) => d.tcgs.includes(tcg)) : dealers;
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition ${active ? "border-brand bg-brand text-on-brand" : "border-line bg-night-2 text-cream/80 hover:border-brand/60"}`;

  return (
    <div className="space-y-3">
      {used.length > 1 && (
        <div role="group" aria-label={labels.filter} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          <button type="button" className={chip(tcg === null)} aria-pressed={tcg === null} onClick={() => setTcg(null)}>
            {labels.all}
          </button>
          {used.map((t) => (
            <button key={t.key} type="button" className={`${chip(tcg === t.key)} whitespace-nowrap`} aria-pressed={tcg === t.key} onClick={() => setTcg(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((d) => (
          <li key={d.name} className="card flex items-start gap-3 p-3">
            <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-white">
              {d.logo_url ? (
                <img src={d.logo_url} alt={`Logo ${d.name}`} className="size-full object-contain" loading="lazy" />
              ) : (
                <span className="font-display text-xl font-bold text-night" aria-hidden>
                  {d.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1 space-y-1">
              <span className="block font-semibold leading-snug">{d.name}</span>
              {(d.tcgs.length > 0 || d.other) && (
                <span className="flex flex-wrap gap-1">
                  {d.tcgs.map((t) => (
                    <span key={t} className="rounded-full bg-brand/15 px-2 py-0.5 text-xs text-brand">{TCG_LABEL.get(t)}</span>
                  ))}
                  {d.other && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{d.other}</span>}
                </span>
              )}
              {d.products.length > 0 && (
                <span className="block text-xs text-cream/70">
                  {DEALER_PRODUCTS.filter((p) => d.products.includes(p.key)).map((p) => labels.products[p.key] ?? p.label).join(" · ")}
                </span>
              )}
              {d.link_url && (
                <a href={d.link_url} target="_blank" rel="noopener noreferrer nofollow" className="link block truncate text-sm">
                  {d.link_label}
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
