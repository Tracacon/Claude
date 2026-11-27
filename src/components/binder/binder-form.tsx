"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError } from "@/components/form-error";
import { deleteBinder, saveBinder, type BinderFormState } from "@/lib/actions/binders";
import {
  BINDER_COLORS,
  BINDER_COLOR_STYLES,
  BINDER_EFFECTS,
  BINDER_VISIBILITIES,
  type BinderColor,
  type BinderEffect,
} from "@/lib/binder-shared";
import { BinderCover } from "./binder-cover";

/** Binder anlegen oder bearbeiten: Name, Farbe, wer ihn sieht */
export function BinderForm({
  binder,
}: {
  binder?: { id: string; name: string; color: BinderColor; visibility: string; effect: BinderEffect };
}) {
  const t = useTranslations("Binder");
  const [state, action, pending] = useActionState<BinderFormState, FormData>(saveBinder, {});
  const [del, delAction, deleting] = useActionState<BinderFormState, FormData>(deleteBinder, {});
  const [name, setName] = useState(state.values?.name ?? binder?.name ?? "");
  const [color, setColor] = useState<BinderColor>((state.values?.color as BinderColor) ?? binder?.color ?? "night");
  const [effect, setEffect] = useState<BinderEffect>((state.values?.effect as BinderEffect) ?? binder?.effect ?? "none");
  const [confirm, setConfirm] = useState(false);
  const visibility = state.values?.visibility ?? binder?.visibility ?? "public";

  return (
    <div className="space-y-5">
      <div className="mx-auto w-40">
        <BinderCover name={name || t("namePlaceholder")} color={color} effect={effect} coverUrl={null} subtitle={t("preview")} />
      </div>
      <form action={action} className="card space-y-4" noValidate>
        {binder && <input type="hidden" name="id" value={binder.id} />}
        <div>
          <label htmlFor="name" className="label">{t("name")}</label>
          <input
            id="name"
            name="name"
            required
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            className="input"
          />
        </div>
        <fieldset>
          <legend className="label">{t("color")}</legend>
          <div className="flex flex-wrap gap-3">
            {BINDER_COLORS.map((x) => (
              <label key={x} className="cursor-pointer">
                <input type="radio" name="color" value={x} checked={color === x} onChange={() => setColor(x)} className="peer sr-only" />
                <span
                  className="block size-10 rounded-full border-2 border-transparent ring-offset-2 ring-offset-night-2 peer-checked:ring-2 peer-checked:ring-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand"
                  style={{ background: `radial-gradient(circle at 30% 30%, ${BINDER_COLOR_STYLES[x].base}, ${BINDER_COLOR_STYLES[x].edge})` }}
                  title={t(`color_${x}`)}
                />
                <span className="sr-only">{t(`color_${x}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">{t("effect")}</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {BINDER_EFFECTS.map((x) => (
              <label key={x} className="cursor-pointer text-center">
                <input type="radio" name="effect" value={x} checked={effect === x} onChange={() => setEffect(x)} className="peer sr-only" />
                <span
                  className="relative block aspect-square overflow-hidden rounded-xl border-2 border-transparent peer-checked:border-brand peer-focus-visible:border-brand"
                  style={{ background: `radial-gradient(120% 90% at 30% 10%, ${BINDER_COLOR_STYLES[color].base}, ${BINDER_COLOR_STYLES[color].edge})` }}
                >
                  {x !== "none" && <span aria-hidden className={`binder-fx binder-fx-${x}`} />}
                </span>
                <span className="mt-1 block text-xs text-cream/80">{t(`effect_${x}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">{t("visibility")}</legend>
          <div className="space-y-2">
            {BINDER_VISIBILITIES.map((v) => (
              <label key={v} className="flex items-start gap-3 rounded-xl border border-line px-3 py-2.5 has-[:checked]:border-brand has-[:checked]:bg-brand/10">
                <input type="radio" name="visibility" value={v} defaultChecked={visibility === v} className="mt-1 size-4 accent-brand" />
                <span>
                  <span className="block font-medium">{t(`visibility_${v}`)}</span>
                  <span className="block text-xs text-cream/60">{t(`visibility_${v}_hint`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <FormError code={state.error} />
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? t("saving") : binder ? t("save") : t("create")}
        </button>
      </form>

      {binder && (
        <section className="card space-y-2">
          {!confirm ? (
            <button type="button" className="text-sm text-danger hover:underline" onClick={() => setConfirm(true)}>
              {t("delete")}
            </button>
          ) : (
            <form action={delAction} className="space-y-2">
              <input type="hidden" name="id" value={binder.id} />
              <p className="text-sm">{t("deleteConfirm")}</p>
              <div className="flex gap-2">
                <button type="submit" className="btn-danger" disabled={deleting}>{t("deleteYes")}</button>
                <button type="button" className="btn-ghost" onClick={() => setConfirm(false)}>{t("cancel")}</button>
              </div>
              <FormError code={del.error} />
            </form>
          )}
        </section>
      )}
    </div>
  );
}
