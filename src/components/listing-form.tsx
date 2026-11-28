"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState, type ReactNode } from "react";
import { CardCodeFields } from "@/components/card-code-fields";
import { FormError } from "@/components/form-error";
import { PhotoUploader } from "@/components/photo-uploader";
import { Link } from "@/i18n/navigation";
import { createListing, updateListing, type ListingFormState } from "@/lib/actions/listings";
import { isMarketOffer } from "@/lib/validation";
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

/** Symbole der Angebote */
const OFFER_ICON: Record<string, string> = { collection: "📁", sell: "€", trade: "🔁", sell_or_trade: "🔁€", gift: "🎁" };

/** Zeile in einer Gruppe: Symbol, Bezeichnung, Inhalt rechts (wie Instagram-Einstellungen) */
function Row({ icon, label, htmlFor, children, error }: { icon: string; label: ReactNode; htmlFor?: string; children: ReactNode; error?: ReactNode }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="w-7 shrink-0 text-center text-lg" aria-hidden>{icon}</span>
        <label htmlFor={htmlFor} className="shrink-0 font-medium">{label}</label>
        <div className="flex min-w-0 flex-1 justify-end">{children}</div>
      </div>
      {error}
    </div>
  );
}

/** Aufklappbarer Bereich mit Zusammenfassung rechts */
function Fold({ icon, title, summary, open, children }: { icon: string; title: string; summary?: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
        <span className="w-7 shrink-0 text-center text-lg" aria-hidden>{icon}</span>
        <span className="flex-1 font-medium">{title}</span>
        {summary && <span className="max-w-[45%] truncate text-sm text-cream/60">{summary}</span>}
        <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-cream/50 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="space-y-4 px-4 pb-4 pt-1">{children}</div>
    </details>
  );
}

const group = "divide-y divide-line overflow-hidden rounded-2xl border border-line bg-night-2";
const inlineSelect = "min-w-0 max-w-full cursor-pointer appearance-none truncate bg-transparent py-1 pr-1 text-right text-cream/80 outline-none focus-visible:text-brand";

/**
 * Karte einpflegen bzw. Inserat anlegen, aufgebaut wie bei Instagram:
 * Fotos oben, Beschreibung wie eine Bildunterschrift, Angebot als Auswahlknöpfe,
 * darunter Gruppen mit Symbolzeilen und aufklappbaren Bereichen. Unten fester Speichern-Knopf.
 * Alle Feldnamen sind unverändert (Server-Aktionen createListing/updateListing).
 */
export function ListingForm({
  userId,
  listingId,
  initial,
  events = [],
  binders = [],
  returnTo,
}: {
  userId: string;
  listingId?: string;
  initial: ListingFormValues;
  /** Kommende Termine zum Ankreuzen */
  events?: EventOption[];
  /** Eigene Binder zur Auswahl */
  binders?: BinderOption[];
  /** Nach dem Speichern bzw. Abbrechen hierhin (z. B. zurück zum Binder) */
  returnTo?: string;
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
  const [quantity, setQuantity] = useState(Number(val("quantity") || "1") || 1);
  const inCollection = offer === COLLECTION_CHOICE;
  // Tausch und Verkauf: Titel, Spiel, Vorder- und Rückseite Pflicht. Sammlung und Verschenken: Vorderseite reicht.
  const forMarket = isMarketOffer(offer);
  const needsPhoto = KINDS_NEEDING_BOTH_SIDES.includes(kind);
  const bothSides = forMarket && needsPhoto;
  const photos = v?.photos ? (JSON.parse(v.photos || "[]") as string[]) : initial.photos;
  const e = state.errors ?? {};
  // React setzt Formulare nach jeder Aktion zurück. Ein neuer Schlüssel baut das Formular
  // mit den zuletzt eingegebenen Werten neu auf, sodass auch Auswahllisten erhalten bleiben.
  const formKey = v ? JSON.stringify(v) : "initial";

  const optional = <span className="ml-1 text-xs font-normal text-cream/50">({t("optional")})</span>;
  const detailsSummary = [
    val("condition") && tCond(val("condition") as never),
    val("card_language") && tLang(val("card_language") as never),
    val("grading"),
  ]
    .filter(Boolean)
    .join(" · ");
  const handoverSummary = [
    val("city"),
    checked("handover_event") && t("handoverEvent"),
    checked("handover_pickup") && t("handoverPickup"),
    checked("handover_shipping") && t("handoverShipping"),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <form key={formKey} action={action} className="space-y-4 pb-28" noValidate>
      {listingId && <input type="hidden" name="id" value={listingId} />}
      {returnTo && <input type="hidden" name="return_to" value={returnTo} />}

      {/* Fotos */}
      <section className="space-y-2">
        <PhotoUploader key={photos.join(",")} userId={userId} initial={photos} requireBothSides={bothSides} onPendingChange={setUploading} />
        <p className={`text-xs ${bothSides ? "text-brand" : "text-cream/60"}`}>
          {bothSides ? t("photosHintRequired") : needsPhoto ? t("photosHintFront") : t("photosHint")}
        </p>
        <FormError code={e.photos} />
      </section>

      {/* Titel und Beschreibung wie Bildunterschrift */}
      <section className={group}>
        <div className="px-4 py-3">
          <label htmlFor="title" className="sr-only">{t("title")}</label>
          <input
            id="title"
            name="title"
            required={forMarket}
            maxLength={100}
            defaultValue={val("title")}
            placeholder={forMarket ? t("titlePlaceholder") : t("titlePlaceholderOptional")}
            className="w-full bg-transparent py-1 text-base font-semibold outline-none placeholder:font-normal placeholder:text-cream/40"
            aria-describedby="title-hint"
          />
          <p id="title-hint" className="text-xs text-cream/50">{forMarket ? t("titleHint") : t("titleHintOptional")}</p>
          <FormError code={e.title} />
        </div>
        <div className="px-4 py-3">
          <label htmlFor="description" className="sr-only">{t("description")}</label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={2000}
            defaultValue={val("description")}
            placeholder={t("descriptionPlaceholder")}
            className="w-full resize-y bg-transparent text-[15px] outline-none placeholder:text-cream/40"
          />
          <FormError code={e.description} />
        </div>
      </section>

      {/* Angebot */}
      <fieldset className="space-y-2">
        <legend className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-cream/60">{t("offer")}</legend>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[COLLECTION_CHOICE, ...OFFERS].map((x) => (
            <label
              key={x}
              className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                offer === x ? "border-brand bg-brand text-on-brand" : "border-line bg-night-2 text-cream/80 hover:border-brand/50"
              }`}
            >
              <input type="radio" name="offer" value={x} checked={offer === x} onChange={() => setOffer(x)} className="sr-only" />
              <span aria-hidden>{OFFER_ICON[x]}</span>
              {x === COLLECTION_CHOICE ? t("offerCollection") : tOffer(x)}
            </label>
          ))}
        </div>
        <p className="px-1 text-xs text-cream/60">{inCollection ? t("offerCollectionHint") : t("offerMarketHint")}</p>

        {offerHasPrice(offer) ? (
          <div className={`${group} flex items-center gap-3 px-4 py-2`}>
            <label htmlFor="price" className="sr-only">{t("price")}</label>
            <span className="text-2xl font-black text-brand" aria-hidden>€</span>
            <input
              id="price"
              name="price"
              inputMode="decimal"
              placeholder={t("priceHint")}
              defaultValue={val("price")}
              className="min-w-0 flex-1 bg-transparent py-2 text-2xl font-black outline-none placeholder:text-base placeholder:font-normal placeholder:text-cream/40"
            />
            <label className="flex shrink-0 items-center gap-2 text-sm">
              <input type="checkbox" name="negotiable" defaultChecked={checked("negotiable")} className="size-5 accent-brand" />
              {t("negotiable")}
            </label>
          </div>
        ) : (
          <input type="hidden" name="price" value="" />
        )}
        <FormError code={e.price} />
      </fieldset>

      {/* Karte */}
      <section className={group}>
        <Row icon="🎮" label={<>{t("game")}{!forMarket && optional}</>} htmlFor="tcg" error={<FormError code={e.tcg} />}>
          <select id="tcg" name="tcg" required={forMarket} value={tcg} onChange={(ev) => setTcg(ev.target.value)} className={inlineSelect}>
            <option value="">{t("choose")}</option>
            {TCGS.map((x) => <option key={x} value={x}>{tTcg(x)}</option>)}
          </select>
        </Row>
        <Row icon="🃏" label={t("kind")} htmlFor="kind">
          <select id="kind" name="kind" value={kind} onChange={(ev) => setKind(ev.target.value)} className={inlineSelect}>
            {KINDS.map((x) => <option key={x} value={x}>{tKind(x)}</option>)}
          </select>
        </Row>
        {KINDS_WITH_CARD.includes(kind) && (
          <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
            <CardCodeFields initialCode={val("card_code")} initialNumber={val("card_no")} lookup={TCGS_WITH_CARD_LOOKUP.includes(tcg)} />
          </div>
        )}
        <Row icon="🔢" label={t("quantity")} htmlFor="quantity" error={<FormError code={e.quantity} />}>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="grid size-8 place-items-center rounded-full border border-line text-lg hover:border-brand" aria-label="−">−</button>
            <input
              id="quantity"
              name="quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_QUANTITY}
              value={quantity}
              onChange={(ev) => setQuantity(Math.min(MAX_QUANTITY, Math.max(1, Number(ev.target.value) || 1)))}
              className="w-12 bg-transparent text-center font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button type="button" onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))} className="grid size-8 place-items-center rounded-full border border-line text-lg hover:border-brand" aria-label="+">+</button>
          </div>
        </Row>
        <Row icon="📁" label={t("binder")} htmlFor="binder">
          <input type="hidden" name="binder_field" value="1" />
          <input type="hidden" name="pocket" value={initial.pocket ?? ""} />
          <select id="binder" name="binder" defaultValue={val("binder")} className={inlineSelect}>
            <option value="">{t("binderNone")}</option>
            {binders.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Row>
        {binders.length === 0 && <p className="px-4 pb-3 text-xs text-cream/50">{t("binderHintNone")}</p>}
      </section>

      {/* Weitere Angaben zum Aufklappen */}
      <section className={group}>
        <Fold icon="✨" title={t("detailsTitle")} summary={detailsSummary || t("optional")}>
          <div className="grid gap-4 sm:grid-cols-3">
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
          </div>
        </Fold>

        {/* Ort und Übergabe: nur im Marktplatz nötig (Felder bleiben für die Sammlung erhalten) */}
        <div className={inCollection ? "hidden" : ""}>
          <Fold icon="🤝" title={t("handoverTitle")} summary={handoverSummary} open={Boolean(e.handover)}>
            <div>
              <label htmlFor="city" className="label">{t("city")}</label>
              <input id="city" name="city" maxLength={80} autoComplete="address-level2" defaultValue={val("city")} className="input" />
            </div>
            <fieldset>
              <legend className="label">{t("handover")}</legend>
              <div className="flex flex-wrap gap-2">
                {(["handover_event", "handover_pickup", "handover_shipping"] as const).map((k) => (
                  <label key={k} className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/10 has-[:checked]:text-brand">
                    <input type="checkbox" name={k} defaultChecked={checked(k)} className="size-4 accent-brand" />
                    {t(k === "handover_event" ? "handoverEvent" : k === "handover_pickup" ? "handoverPickup" : "handoverShipping")}
                  </label>
                ))}
              </div>
              <FormError code={e.handover} />
            </fieldset>
          </Fold>
        </div>

        {events.length > 0 && !inCollection && (
          <Fold
            icon="📅"
            title={t("bringTo")}
            summary={chosenEvents.length > 0 ? t("bringToCount", { count: chosenEvents.length }) : t("optional")}
            open={chosenEvents.length > 0}
          >
            <input type="hidden" name="events_field" value="1" />
            <p className="text-xs text-cream/60">{t("bringToHint")}</p>
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
          </Fold>
        )}
      </section>

      {/* Fester Knopf unten (über der unteren Leiste) */}
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+3.5rem)] z-20 border-t border-line bg-night/95 px-4 py-3 backdrop-blur sm:bottom-0">
        <div className="mx-auto max-w-3xl space-y-1">
          <FormError code={e._form} />
          {uploading && <p className="text-sm text-cream/70">{tErr("photos_pending")}</p>}
          <div className="flex gap-3">
            <Link href={returnTo ?? (listingId ? `/marktplatz/${listingId}` : inCollection ? "/profil" : "/marktplatz")} className="btn-ghost">
              {t("cancel")}
            </Link>
            <button type="submit" className="btn-primary flex-1" disabled={pending || uploading}>
              {pending ? t("saving") : listingId ? t("saveEdit") : inCollection ? t("saveCollection") : t("save")}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
