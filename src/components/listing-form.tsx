"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useRef, useState } from "react";
import { CardSearch } from "@/components/card-search";
import { FormError } from "@/components/form-error";
import { PhotoUploader } from "@/components/photo-uploader";
import { Link } from "@/i18n/navigation";
import { createListing, updateListing, type ListingFormState } from "@/lib/actions/listings";
import { eventDay } from "@/lib/event-format";
import {
  CARD_LANGUAGES,
  CONDITIONS,
  GRADES,
  GRADING_COMPANIES,
  KINDS,
  KINDS_NEEDING_BOTH_SIDES,
  KINDS_WITH_CARD,
  OFFERS,
  SEALED_TYPES,
  TCGS,
  TCGS_WITH_CARD_SEARCH,
  VARIANTS,
  type CardHit,
} from "@/lib/marketplace";

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
  events: string[];
  card: CardHit | null;
  variant: string;
  grading_company: string;
  grading_grade: string;
  sealed_type: string;
};

const STEPS = ["stepCard", "stepPhotos", "stepPrice", "stepHandover"] as const;
/** In welchem Schritt steht ein Feld (für Fehlermeldungen vom Server) */
const FIELD_STEP: Record<string, number> = {
  tcg: 0, title: 0, grading_company: 0, grading_grade: 0,
  photos: 1,
  price: 2, description: 2,
};

export type EventOption = { id: string; name: string; starts_at: string; ends_at: string; timezone: string | null; city: string | null };

export function ListingForm({
  userId,
  listingId,
  initial,
  events = [],
}: {
  userId: string;
  listingId?: string;
  initial: ListingFormValues;
  /** Kommende Termine zum Ankreuzen */
  events?: EventOption[];
}) {
  const locale = useLocale();
  const t = useTranslations("Listing");
  const tTcg = useTranslations("Tcg");
  const tKind = useTranslations("Kind");
  const tOffer = useTranslations("Offer");
  const tCond = useTranslations("Condition");
  const tLang = useTranslations("CardLanguage");
  const tErr = useTranslations("Errors");
  const tVariant = useTranslations("Variant");
  const tCompany = useTranslations("GradingCompany");
  const tSealed = useTranslations("SealedType");
  const [state, action, pending] = useActionState<ListingFormState, FormData>(listingId ? updateListing : createListing, {});
  const [uploading, setUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Nach einem Fehler die eingegebenen Werte behalten
  const v = state.values;
  const val = (k: Exclude<keyof ListingFormValues, "card">) => (v ? v[k] ?? "" : String(initial[k] ?? ""));
  const chosenEvents = v ? (v.events ?? "").split(",").filter(Boolean) : initial.events;
  const checked = (k: keyof ListingFormValues) => (v ? v[k] === "on" : Boolean(initial[k]));
  const initialCard: CardHit | null = v ? (v.card_json ? (JSON.parse(v.card_json) as CardHit) : null) : initial.card;
  const [offer, setOffer] = useState(val("offer") || "sell");
  const [kind, setKind] = useState(val("kind") || "single");
  const [tcg, setTcg] = useState(val("tcg"));
  const [company, setCompany] = useState(val("grading_company"));
  const [title, setTitle] = useState(val("title"));
  const [titleFromCard, setTitleFromCard] = useState(false);
  const bothSides = KINDS_NEEDING_BOTH_SIDES.includes(kind);
  const withCard = KINDS_WITH_CARD.includes(kind);
  const cardSearch = withCard && TCGS_WITH_CARD_SEARCH.includes(tcg);
  const photos = v?.photos ? (JSON.parse(v.photos || "[]") as string[]) : initial.photos;
  const serverErrors = state.errors ?? {};
  const firstErrorStep = Math.min(3, ...Object.keys(serverErrors).map((k) => FIELD_STEP[k] ?? 3));
  const [step, setStep] = useState(Object.keys(serverErrors).length ? firstErrorStep : 0);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  // Neue Antwort vom Server: zum ersten Schritt mit Fehler springen
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    setStepErrors({});
    if (Object.keys(serverErrors).length) setStep(firstErrorStep);
  }
  const e = { ...serverErrors, ...stepErrors };
  // React setzt Formulare nach jeder Aktion zurück. Ein neuer Schlüssel baut das Formular
  // mit den zuletzt eingegebenen Werten neu auf, sodass auch Auswahllisten erhalten bleiben.
  const formKey = v ? JSON.stringify(v) : "initial";

  function pickCard(c: CardHit | null) {
    if (c && (title.trim() === "" || titleFromCard)) {
      setTitle(`${c.name} ${c.number} ${c.set}`.slice(0, 100));
      setTitleFromCard(true);
    }
  }

  /** Pflichtangaben des aktuellen Schritts prüfen, bevor es weitergeht */
  function checkStep(i: number) {
    const errs: Record<string, string> = {};
    const form = formRef.current;
    if (i === 0) {
      if (!tcg) errs.tcg = "tcg_required";
      if (title.trim().length < 3) errs.title = "title_short";
      if (kind === "slab") {
        const grade = (form?.elements.namedItem("grading_grade") as HTMLSelectElement | null)?.value ?? "";
        if (company && company !== "other" && !grade) errs.grading_grade = "grade_required";
      }
    }
    if (i === 1 && bothSides) {
      const raw = (form?.elements.namedItem("photos") as HTMLInputElement | null)?.value ?? "[]";
      if ((JSON.parse(raw || "[]") as string[]).length < 2) errs.photos = "front_back_required";
    }
    if (i === 2 && offer !== "trade") {
      const price = (form?.elements.namedItem("price") as HTMLInputElement | null)?.value.trim() ?? "";
      if (!price) errs.price = "price_required";
    }
    setStepErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function goTo(i: number) {
    if (i > step && !checkStep(step)) return;
    setStepErrors({});
    setStep(i);
    formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  const hide = (i: number) => (step === i ? undefined : true);

  return (
    <form ref={formRef} key={formKey} action={action} className="space-y-5 scroll-mt-20" noValidate>
      {listingId && <input type="hidden" name="id" value={listingId} />}

      {/* Fortschritt: vier Schritte, bereits erledigte lassen sich antippen */}
      <nav aria-label={t("stepOf", { current: step + 1, total: STEPS.length })} className="space-y-2">
        <p className="text-sm text-cream/70">
          {t("stepOf", { current: step + 1, total: STEPS.length })} · <span className="font-semibold text-cream">{t(STEPS[step])}</span>
        </p>
        <ol className="grid grid-cols-4 gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-current={i === step ? "step" : undefined}
                className={`flex min-h-11 w-full flex-col justify-end gap-1 text-left text-xs ${i === step ? "text-brand" : "text-cream/60"}`}
              >
                <span className="hidden sm:block">{t(s)}</span>
                <span className={`block h-1.5 rounded-full ${i <= step ? "bg-brand" : "bg-line"}`} />
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {/* Schritt 1: Karte */}
      <section className="card space-y-4" hidden={hide(0)}>
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
        </div>

        {cardSearch ? (
          <CardSearch initial={initialCard} onChange={pickCard} />
        ) : (
          withCard && tcg && <p className="hint mt-0">{t("cardNoSearch")}</p>
        )}

        <div>
          <label htmlFor="title" className="label">{t("title")}</label>
          <input
            id="title"
            name="title"
            required
            maxLength={100}
            value={title}
            onChange={(ev) => {
              setTitle(ev.target.value);
              setTitleFromCard(false);
            }}
            className="input"
            aria-describedby="title-hint"
          />
          <p id="title-hint" className="hint">{titleFromCard ? t("titleAuto") : t("titleHint")}</p>
          <FormError code={e.title} />
        </div>

        {withCard && (
          <div>
            <label htmlFor="variant" className="label">{t("variant")}</label>
            <select id="variant" name="variant" defaultValue={val("variant")} className="input">
              <option value="">{t("variantNone")}</option>
              {VARIANTS.map((x) => <option key={x} value={x}>{tVariant(x)}</option>)}
            </select>
          </div>
        )}

        {kind === "slab" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="grading_company" className="label">{t("gradingCompany")}</label>
              <select id="grading_company" name="grading_company" value={company} onChange={(ev) => setCompany(ev.target.value)} className="input">
                <option value="">{t("choose")}</option>
                {GRADING_COMPANIES.map((x) => <option key={x} value={x}>{tCompany(x)}</option>)}
              </select>
              <FormError code={e.grading_company} />
            </div>
            {company === "other" ? (
              <div>
                <label htmlFor="grading" className="label">{t("gradingOther")}</label>
                <input id="grading" name="grading" maxLength={40} placeholder={t("gradingHint")} defaultValue={val("grading")} className="input" />
              </div>
            ) : (
              <div>
                <label htmlFor="grading_grade" className="label">{t("gradingGrade")}</label>
                <select id="grading_grade" name="grading_grade" defaultValue={val("grading_grade")} className="input" disabled={!company}>
                  <option value="">{t("choose")}</option>
                  {GRADES.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
                <FormError code={e.grading_grade} />
              </div>
            )}
          </div>
        )}

        {kind === "sealed" && (
          <div>
            <label htmlFor="sealed_type" className="label">{t("sealedType")}</label>
            <select id="sealed_type" name="sealed_type" defaultValue={val("sealed_type")} className="input">
              <option value="">{t("sealedNone")}</option>
              {SEALED_TYPES.map((x) => <option key={x} value={x}>{tSealed(x)}</option>)}
            </select>
          </div>
        )}
      </section>

      {/* Schritt 2: Fotos */}
      <section className="card space-y-2" hidden={hide(1)}>
        <h2 className="font-semibold">{t("photos")}</h2>
        <p className={`hint mt-0 ${bothSides ? "text-brand" : ""}`}>{bothSides ? t("photosHintRequired") : t("photosHint")}</p>
        <PhotoUploader
          key={photos.join(",")}
          userId={userId}
          initial={photos}
          requireBothSides={bothSides}
          onPendingChange={setUploading}
        />
        <FormError code={e.photos} />
      </section>

      {/* Schritt 3: Zustand und Preis */}
      <section className="card space-y-4" hidden={hide(2)}>
        <fieldset>
          <legend className="label">{t("offer")}</legend>
          <div className="flex flex-wrap gap-2">
            {OFFERS.map((x) => (
              <label key={x} className={`btn cursor-pointer border ${offer === x ? "border-brand bg-brand/15 text-brand" : "border-line"}`}>
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
              <input type="checkbox" name="negotiable" defaultChecked={checked("negotiable")} className="size-5 accent-brand" />
              <span>{t("negotiable")}</span>
            </label>
          </div>
        ) : (
          <input type="hidden" name="price" value="" />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>

        <div>
          <label htmlFor="description" className="label">{t("description")}</label>
          <textarea id="description" name="description" rows={5} maxLength={2000} defaultValue={val("description")} className="input" aria-describedby="desc-hint" />
          <p id="desc-hint" className="hint">{t("descriptionHint")}</p>
          <FormError code={e.description} />
        </div>
      </section>

      {/* Schritt 4: Übergabe und Events */}
      <section className="card space-y-4" hidden={hide(3)}>
        <div>
          <label htmlFor="city" className="label">{t("city")}</label>
          <input id="city" name="city" maxLength={80} autoComplete="address-level2" defaultValue={val("city")} className="input" />
        </div>
        <fieldset>
          <legend className="label">{t("handover")}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {(["handover_event", "handover_pickup", "handover_shipping"] as const).map((k) => (
              <label key={k} className="flex min-h-11 items-center gap-2">
                <input type="checkbox" name={k} defaultChecked={checked(k)} className="size-5 accent-brand" />
                <span>{t(k === "handover_event" ? "handoverEvent" : k === "handover_pickup" ? "handoverPickup" : "handoverShipping")}</span>
              </label>
            ))}
          </div>
          <FormError code={e.handover} />
        </fieldset>

        {events.length > 0 && (
          <div className="space-y-2">
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
          </div>
        )}
      </section>

      {step === 3 && <FormError code={e._form} />}
      {uploading && <p className="text-sm text-cream/70">{tErr("photos_pending")}</p>}
      <div className="flex flex-wrap gap-3">
        {step > 0 && (
          <button type="button" className="btn-ghost" onClick={() => goTo(step - 1)}>
            {t("stepBack")}
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn-primary" onClick={() => goTo(step + 1)} disabled={step === 1 && uploading}>
            {t("next")}
          </button>
        ) : (
          <button type="submit" className="btn-primary" disabled={pending || uploading}>
            {pending ? t("saving") : listingId ? t("saveEdit") : t("save")}
          </button>
        )}
        <Link href={listingId ? `/marktplatz/${listingId}` : "/marktplatz"} className="btn-ghost">
          {t("cancel")}
        </Link>
      </div>
    </form>
  );
}
