"use client";
/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { removeHighlight, saveHighlight, type HighlightState } from "@/lib/actions/highlights";
import { BINDER_COLOR_STYLES, type BinderColor } from "@/lib/binder-shared";

export function HighlightRow({
  binderId,
  binderName,
  color,
  image,
  active,
  title,
}: {
  binderId: string;
  binderName: string;
  color: BinderColor;
  image: string | null;
  active: boolean;
  title: string;
}) {
  const t = useTranslations("Highlights");
  const [saved, save, saving] = useActionState<HighlightState, FormData>(saveHighlight, {});
  const [removed, remove, removing] = useActionState<HighlightState, FormData>(removeHighlight, {});
  const c = BINDER_COLOR_STYLES[color] ?? BINDER_COLOR_STYLES.night;

  return (
    <div className={`card flex items-center gap-3 p-3 sm:p-3 ${active ? "border-brand/50" : ""}`}>
      <span className={`block size-14 shrink-0 rounded-full p-[2px] ${active ? "bg-[conic-gradient(from_180deg,var(--color-brand),#a77bff,#ff4fa3,var(--color-brand))]" : "bg-line"}`}>
        <span className="block size-full rounded-full bg-night p-[2px]">
          {image ? (
            <img src={image} alt="" className="size-full rounded-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center rounded-full" style={{ background: `radial-gradient(circle at 30% 30%, ${c.base}, ${c.edge})` }} aria-hidden>
              📁
            </span>
          )}
        </span>
      </span>
      <form action={save} className="min-w-0 flex-1 space-y-1.5">
        <input type="hidden" name="binderId" value={binderId} />
        <p className="truncate text-xs text-cream/60">📁 {binderName}</p>
        <div className="flex gap-2">
          <input name="title" defaultValue={title} maxLength={20} aria-label={t("label")} className="input min-w-0 flex-1 py-1.5" />
          <button type="submit" className={active ? "btn-ghost px-3 py-1.5" : "btn-primary px-3 py-1.5"} disabled={saving}>
            {active ? t("save") : t("add")}
          </button>
        </div>
        {saved.ok && !saving && <p className="text-xs text-ok">{t("saved")}</p>}
        <FormError code={saved.error ?? removed.error} />
      </form>
      {active && (
        <form action={remove}>
          <input type="hidden" name="binderId" value={binderId} />
          <button type="submit" className="rounded-lg px-2 py-1 text-cream/60 hover:bg-white/5 hover:text-danger" aria-label={t("remove")} title={t("remove")} disabled={removing}>
            ✕
          </button>
        </form>
      )}
    </div>
  );
}
