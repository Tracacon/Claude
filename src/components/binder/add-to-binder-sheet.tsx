"use client";
/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */

import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { FormError } from "@/components/form-error";
import { Link, useRouter } from "@/i18n/navigation";
import { addToBinder } from "@/lib/actions/binders";

/** Eigene Karte, die man in diesen Binder legen kann */
export type PickCard = {
  id: string;
  title: string;
  front: string | null;
  /** Name des Binders, in dem sie gerade liegt (null = ohne Binder) */
  binderName: string | null;
};

/**
 * Auswahlfenster: neue Karte einpflegen oder vorhandene Karten (ohne Binder oder aus
 * anderen Bindern) in diesen Binder legen. Mit Fach: genau eine Karte genau dorthin.
 */
export function AddToBinderSheet({
  binderId,
  pocket,
  cards,
  onClose,
}: {
  binderId: string;
  /** Gewähltes leeres Fach (ab 0) oder null = nächste freie Fächer */
  pocket: number | null;
  cards: PickCard[];
  onClose: () => void;
}) {
  const t = useTranslations("Binder");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const single = pocket !== null;

  // Gruppen: zuerst ohne Binder, dann je Binder
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = q ? cards.filter((c) => c.title.toLowerCase().includes(q)) : cards;
    const map = new Map<string, PickCard[]>();
    for (const c of shown) {
      const key = c.binderName ?? "";
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return [...map.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  }, [cards, query]);

  function place(ids: string[]) {
    setError(undefined);
    startTransition(async () => {
      const r = await addToBinder(binderId, ids, pocket);
      if (r.error) setError(r.error);
      else {
        onClose();
        router.refresh();
      }
    });
  }

  const newHref = `/marktplatz/neu?sammlung=1&binder=${binderId}${single ? `&fach=${pocket}` : ""}`;

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={t("addTitle")}>
      <button type="button" aria-label={t("close")} className="absolute inset-0 bg-night/75" onClick={onClose} />
      <div className="relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl border border-line bg-night-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:rounded-3xl">
        <div className="space-y-3 p-4 pb-2">
          <div aria-hidden className="mx-auto h-1.5 w-10 rounded-full bg-tint/20 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <p className="font-display font-semibold">
              {single ? t("pocketTitle", { pocket: pocket + 1, page: Math.floor(pocket / 9) + 1 }) : t("addTitle")}
            </p>
            <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-cream/70 hover:bg-tint/5" aria-label={t("close")}>✕</button>
          </div>
          <Link href={newHref} className="flex items-center gap-4 rounded-xl border border-line px-3 py-3 hover:bg-tint/5">
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand/15 text-xl text-brand-ink" aria-hidden>📷</span>
            <span>
              <span className="block font-semibold">{t("addNew")}</span>
              <span className="block text-sm text-cream/60">{single ? t("addNewHintPocket") : t("addNewHint")}</span>
            </span>
          </Link>
          <p className="pt-1 font-semibold">{t("addExisting")}</p>
          {cards.length > 6 && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchCards")}
              className="input"
              aria-label={t("searchCards")}
            />
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2">
          {cards.length === 0 ? (
            <p className="text-sm text-cream/60">{t("addExistingEmpty")}</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-cream/60">{t("searchEmpty")}</p>
          ) : (
            groups.map(([name, list]) => (
              <section key={name || "ohne"} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-cream/60">
                  {name ? t("fromBinder", { name }) : t("fromLoose")}
                </h3>
                <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {list.map((c) => {
                    const on = chosen.includes(c.id);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => (single ? place([c.id]) : setChosen(on ? chosen.filter((x) => x !== c.id) : [...chosen, c.id]))}
                          aria-pressed={single ? undefined : on}
                          className={`relative block aspect-[63/88] w-full overflow-hidden rounded-md border ${on ? "border-brand ring-2 ring-brand" : "border-line hover:border-brand/60"}`}
                          title={c.title}
                        >
                          {c.front ? (
                            <img src={c.front} alt={c.title} loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full items-center justify-center bg-night-3 p-1 text-center text-[10px] text-cream/70">{c.title}</span>
                          )}
                          {on && <span className="absolute right-1 top-1 rounded-full bg-brand px-1.5 text-xs font-bold text-on-brand">✓</span>}
                        </button>
                        <span className="mt-0.5 block truncate text-[11px] text-cream/70">{c.title}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="space-y-2 px-4 pt-2">
          <FormError code={error} />
          {!single && cards.length > 0 && (
            <button type="button" className="btn-primary w-full" disabled={pending || chosen.length === 0} onClick={() => place(chosen)}>
              {pending ? t("saving") : t("addChosen", { count: chosen.length })}
            </button>
          )}
          {single && pending && <p className="text-sm text-cream/70">{t("saving")}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
