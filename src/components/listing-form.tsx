"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError } from "@/components/form-error";
import { PhotoUploader } from "@/components/photo-uploader";
import { Link } from "@/i18n/navigation";
import { createListing, updateListing, type ListingFormState } from "@/lib/actions/listings";
import { CARD_LANGUAGES, CONDITIONS, KINDS, OFFERS, TCGS } from "@/lib/marketplace";

export type ListingFormValues = {
  title: string;
  description: string;
  tcg: string;
  kind: string;
  offer: string;
  price: string;
  negotiable: boolean;
  condition: string;
  card_language: string;
  grading: string;
  city: string;
  handover_event: boolean;
  handover_pickup: boolean;
  handover_shipping: boolean;
  photos: string[];
};

export function ListingForm({
  userId,
  listingId,
  initial,
}: {
  userId: string;
  listingId?: string;
  initial: ListingFormValues;
}) {
  const t = useTranslations("Listing");
  const tTcg = useTranslations("Tcg");
  const tKind = useTranslations("Kind");
  const tOffer = useTranslations("Offer");
  const tCond = useTranslations("Condition");
  const tLang = useTranslations("CardLanguage");
  const tErr = useTranslations("Errors");
  const [state, action, pending] = useActionState<ListingFormState, FormData>(listingId ? updateListing : createListing, {});
  const [uploading, setUploading] = useState(false);

  // Nach einem Fehler die eingegebenen Werte behalten
  const v = state.values;
  const val = (k: keyof ListingFormValues) => (v ? v[k] ?? "" : String(initial[k] ?? ""));
  const checked = (k: keyof ListingFormValues) => (v ? v[k] === "on" : Boolean(initial[k]));
  const [offer, setOffer] = useState(val("offer") || "sell");
  const photos = v?.photos ? (JSON.parse(v.photos || "[]") as string[]) : initial.photos;
  const e = state.errors ?? {};
  // React setzt Formulare nach jeder Aktion zurück. Ein neuer Schlüssel baut das Formular
  // mit den zuletzt eingegebenen Werten neu auf, sodass auch Auswahllisten erhalten bleiben.
  const formKey = v ? JSON.stringify(v) : "initial";

  return (
    <form key={formKey} action={action} className="space-y-5" noValidate>
      {listingId && <input type="hidden" name="id" value={listingId} />}

      <section className="card space-y-2">
        <h2 className="font-semibold">{t("photos")}</h2>
        <p className="hint mt-0">{t("photosHint")}</p>
        <PhotoUploader key={photos.join(",")} userId={userId} initial={photos} onPendingChange={setUploading} />
      </section>

      <section className="card space-y-4">
        <div>
          <label htmlFor="title" className="label">{t("title")}</label>
          <input id="title" name="title" required maxLength={100} defaultValue={val("title")} className="input" aria-describedby="title-hint" />
          <p id="title-hint" className="hint">{t("titleHint")}</p>
          <FormError code={e.title} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tcg" className="label">{t("game")}</label>
            <select id="tcg" name="tcg" required defaultValue={val("tcg")} className="input">
              <option value="">{t("choose")}</option>
              {TCGS.map((x) => <option key={x} value={x}>{tTcg(x)}</option>)}
            </select>
            <FormError code={e.tcg} />
          </div>
          <div>
            <label htmlFor="kind" className="label">{t("kind")}</label>
            <select id="kind" name="kind" defaultValue={val("kind") || "single"} className="input">
              {KINDS.map((x) => <option key={x} value={x}>{tKind(x)}</option>)}
            </select>
          </div>
        </div>

        <fieldset>
          <legend className="label">{t("offer")}</legend>
          <div className="flex flex-wrap gap-2">
            {OFFERS.map((x) => (
              <label key={x} className={`btn cursor-pointer border ${offer === x ? "border-amber bg-amber/15 text-amber" : "border-white/15"}`}>
                <input type="radio" name="offer" value={x} checked={offer === x} onChange={() => setOffer(x)} className="sr-only" />
                {tOffer(x)}
              </label>
            ))}
          </div>
        </fieldset>

        {offer !== "trade" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="price" className="label">{t("price")}</label>
              <input id="price" name="price" inputMode="decimal" placeholder={t("priceHint")} defaultValue={val("price")} className="input" />
              <FormError code={e.price} />
            </div>
            <label className="flex items-center gap-3 sm:pt-7">
              <input type="checkbox" name="negotiable" defaultChecked={checked("negotiable")} className="size-5 accent-amber" />
              <span>{t("negotiable")}</span>
            </label>
          </div>
        ) : (
          <input type="hidden" name="price" value="" />
        )}

        <div>
          <label htmlFor="description" className="label">{t("description")}</label>
          <textarea id="description" name="description" rows={5} maxLength={2000} defaultValue={val("description")} className="input" aria-describedby="desc-hint" />
          <p id="desc-hint" className="hint">{t("descriptionHint")}</p>
          <FormError code={e.description} />
        </div>
      </section>

      <section className="card grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="condition" className="label">{t("condition")}</label>
          <select id="condition" name="condition" defaultValue={val("condition")} className="input">
            <option value="">{t("conditionNone")}</option>
            {CONDITIONS.map((x) => <option key={x} value={x}>{tCond(x)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="card_language" className="label">{t("cardLanguage")}</label>
          <select id="card_language" name="card_language" defaultValue={val("card_language")} className="input">
            <option value="">{t("languageNone")}</option>
            {CARD_LANGUAGES.map((x) => <option key={x} value={x}>{tLang(x)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="grading" className="label">{t("grading")}</label>
          <input id="grading" name="grading" maxLength={40} placeholder={t("gradingHint")} defaultValue={val("grading")} className="input" />
        </div>
        <div>
          <label htmlFor="city" className="label">{t("city")}</label>
          <input id="city" name="city" maxLength={80} autoComplete="address-level2" defaultValue={val("city")} className="input" />
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="label">{t("handover")}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {(["handover_event", "handover_pickup", "handover_shipping"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" name={k} defaultChecked={checked(k)} className="size-5 accent-amber" />
                <span>{t(k === "handover_event" ? "handoverEvent" : k === "handover_pickup" ? "handoverPickup" : "handoverShipping")}</span>
              </label>
            ))}
          </div>
          <FormError code={e.handover} />
        </fieldset>
      </section>

      <FormError code={e._form ?? e.photos} />
      {uploading && <p className="text-sm text-cream/70">{tErr("photos_pending")}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary" disabled={pending || uploading}>
          {pending ? t("saving") : listingId ? t("saveEdit") : t("save")}
        </button>
        <Link href={listingId ? `/marktplatz/${listingId}` : "/marktplatz"} className="btn-ghost">
          {t("cancel")}
        </Link>
      </div>
    </form>
  );
}
