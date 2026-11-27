"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { CardCodeFields } from "@/components/card-code-fields";
import { FormError } from "@/components/form-error";
import { PhotoUploader } from "@/components/photo-uploader";
import { Link } from "@/i18n/navigation";
import { createListing, updateListing, type ListingFormState } from "@/lib/actions/listings";
import { eventDay } from "@/lib/event-format";
import {
  CARD_LANGUAGES,
  COLLECTION_CHOICE,
  CONDITIONS,
  KINDS,
  KINDS_NEEDING_BOTH_SIDES,
  KINDS_WITH_CARD,
  MAX_QUANTITY,
  OFFERS,
  TCGS,
  TCGS_WITH_CARD_LOOKUP,
  offerHasPrice,
} from "@/lib/marketplace";

export type ListingFormValues = {
  title: string;
  description: string;
  tcg: string;
  kind: string;
  /** Angebot oder "collection" (nur Sammlung) */
  offer: string;
  quantity: string;
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
  events: string[];
  card_code: string;
  card_no: string;
  /** Binder-ID oder "" (ohne Binder) */
  binder: string;
  /** Gewünschtes Fach im Binder ("" = nächstes freies) */
  pocket?: string;
};

export type BinderOption = { id: string; name: string };

export type EventOption = { id: string; name: string; starts_at: string; ends_at: string; timezone: string | null; city: string | null };

export function ListingForm({
  userId,
  listingId,
  initial,
  events = [],
  binders = [],
}: {
  userId: string;
  listingId?: string;
  initial: ListingFormValues;
  /** Kommende Termine zum Ankreuzen */
  events?: EventOption[];
  /** Eigene Binder zur Auswahl */
  binders?: BinderOption[];
}) {
  const locale = useLocale();
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
  const chosenEvents = v ? (v.events ?? "").split(",").filter(Boolean) : initial.events;
  const checked = (k: keyof ListingFormValues) => (v ? v[k] === "on" : Boolean(initial[k]));
  const [offer, setOffer] = useState(val("offer") || "sell");
  const [kind, setKind] = useState(val("kind") || "single");
  const [tcg, setTcg] = useState(val("tcg"));
  const inCollection = offer === COLLECTION_CHOICE;
  // Vorder- und Rückseite bei Einzelkarten und Slabs immer Pflicht
  const bothSides = KINDS_NEEDING_BOTH_SIDES.includes(kind);
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
        <p className={`hint mt-0 ${bothSides ? "text-brand" : ""}`}>
          {bothSides ? t("photosHintRequired") : t("photosHint")}
        </p>
        <PhotoUploader
          key={photos.join(",")}
          userId={userId}
          initial={photos}
          requireBothSides={bothSides}
          onPendingChange={setUploading}
        />
        <FormError code={e.photos} />
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
            <select id="tcg" name="tcg" required value={tcg} onChange={(ev) => setTcg(ev.target.value)} className="input">
              <option value="">{t("choose")}</option>
              {TCGS.map((x) => <option key={x} value={x}>{tTcg(x)}</option>)}
            </select>
            <FormError code={e.tcg} />
          </div>
          <div>
            <label htmlFor="kind" className="label">{t("kind")}</label>
            <select id="kind" name="kind" value={kind} onChange={(ev) => setKind(ev.target.value)} className="input">
              {KINDS.map((x) => <option key={x} value={x}>{tKind(x)}</option>)}
            </select>
          </div>
          {KINDS_WITH_CARD.includes(kind) && (
            <CardCodeFields initialCode={val("card_code")} initialNumber={val("card_no")} lookup={TCGS_WITH_CARD_LOOKUP.includes(tcg)} />
          )}
        </div>

        <fieldset>
          <legend className="label">{t("offer")}</legend>
          <div className="flex flex-wrap gap-2">
            {[COLLECTION_CHOICE, ...OFFERS].map((x) => (
              <label key={x} className={`btn cursor-pointer border ${offer === x ? "border-brand bg-brand/15 text-brand" : "border-line"}`}>
                <input type="radio" name="offer" value={x} checked={offer === x} onChange={() => setOffer(x)} className="sr-only" />
                {x === COLLECTION_CHOICE ? t("offerCollection") : tOffer(x)}
              </label>
            ))}
          </div>
          <p className="hint">{inCollection ? t("offerCollectionHint") : t("offerMarketHint")}</p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <div>
            <label htmlFor="quantity" className="label">{t("quantity")}</label>
            <input id="quantity" name="quantity" type="number" inputMode="numeric" min={1} max={MAX_QUANTITY} defaultValue={val("quantity") || "1"} className="input" />
            <FormError code={e.quantity} />
          </div>
          <div>
            <input type="hidden" name="binder_field" value="1" />
            <input type="hidden" name="pocket" value={initial.pocket ?? ""} />
            <label htmlFor="binder" className="label">{t("binder")}</label>
            <select id="binder" name="binder" defaultValue={val("binder")} className="input">
              <option value="">{t("binderNone")}</option>
              {binders.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {binders.length === 0 && <p className="hint">{t("binderHintNone")}</p>}
          </div>
        </div>

        {offerHasPrice(offer) ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="price" className="label">{t("price")}</label>
              <input id="price" name="price" inputMode="decimal" placeholder={t("priceHint")} defaultValue={val("price")} className="input" />
              <FormError code={e.price} />
            </div>
            <label className="flex items-center gap-3 sm:pt-7">
              <input type="checkbox" name="negotiable" defaultChecked={checked("negotiable")} className="size-5 accent-brand" />
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
        <fieldset className={`sm:col-span-2 ${inCollection ? "hidden" : ""}`}>
          <legend className="label">{t("handover")}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {(["handover_event", "handover_pickup", "handover_shipping"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" name={k} defaultChecked={checked(k)} className="size-5 accent-brand" />
                <span>{t(k === "handover_event" ? "handoverEvent" : k === "handover_pickup" ? "handoverPickup" : "handoverShipping")}</span>
              </label>
            ))}
          </div>
          <FormError code={e.handover} />
        </fieldset>
      </section>

      {events.length > 0 && !inCollection && (
        <section className="card space-y-2">
          <input type="hidden" name="events_field" value="1" />
          <fieldset>
            <legend className="font-semibold">{t("bringTo")}</legend>
            <p className="hint mt-0 mb-3">{t("bringToHint")}</p>
            <div className="space-y-2">
              {events.map((ev) => (
                <label key={ev.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 has-[:checked]:border-brand has-[:checked]:bg-brand/10">
                  <input type="checkbox" name="events" value={ev.id} defaultChecked={chosenEvents.includes(ev.id)} className="size-5 shrink-0 accent-brand" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{ev.name}</span>
                    <span className="block text-xs text-cream/60">
                      {eventDay(ev, locale)}{ev.city ? ` · ${ev.city}` : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>
      )}

      <FormError code={e._form} />
      {uploading && <p className="text-sm text-cream/70">{tErr("photos_pending")}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary" disabled={pending || uploading}>
          {pending ? t("saving") : listingId ? t("saveEdit") : inCollection ? t("saveCollection") : t("save")}
        </button>
        <Link href={listingId ? `/marktplatz/${listingId}` : inCollection ? "/profil" : "/marktplatz"} className="btn-ghost">
          {t("cancel")}
        </Link>
      </div>
    </form>
  );
}
