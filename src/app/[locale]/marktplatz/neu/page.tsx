import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ListingForm } from "@/components/listing-form";
import { BackTarget } from "@/components/back-target";
import { requireProfile } from "@/lib/auth";
import { ensureEventsFresh, getEvents } from "@/lib/events";
import { getMyBinders } from "@/lib/binders";

export async function generateMetadata({ params }: PageProps<"/[locale]/marktplatz/neu">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Listing" });
  return { title: t("newTitle") };
}

export default async function NewListingPage({ params, searchParams }: PageProps<"/[locale]/marktplatz/neu">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const profile = await requireProfile();
  await ensureEventsFresh();
  const [events, binders] = await Promise.all([getEvents(false, 8), getMyBinders()]);
  const sp = await searchParams;
  const wanted = sp.termin;
  // Aus dem Profil ("Zur Sammlung hinzufügen") kommt ?sammlung=1
  const toCollection = sp.sammlung === "1";
  // Aus einem Binder heraus ("Karte hinzufügen") kommt ?binder=<id>
  const presetBinder = binders.find((b) => b.id === sp.binder)?.id ?? "";
  // Aus einem leeren Fach ("+") kommt ?fach=<nummer>
  // Zurück (Pfeil, Abbrechen) und nach dem Speichern: Binder bzw. Sammlung
  const returnTo = presetBinder
    ? `/u/${profile.nickname}/binder/${presetBinder}`
    : sp.zurueck === "ohne"
      ? `/u/${profile.nickname}/binder/ohne`
      : toCollection
        ? "/profil"
        : undefined;
  const fach = typeof sp.fach === "string" && /^\d{1,4}$/.test(sp.fach) && presetBinder ? sp.fach : "";
  const preset = events.filter((e) => e.id === wanted).map((e) => e.id);
  const t = await getTranslations("Listing");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{toCollection ? t("newCollectionTitle") : t("newTitle")}</h1>
      {returnTo && <BackTarget href={returnTo} />}
      <ListingForm
        userId={profile.id}
        returnTo={returnTo}
        initial={{
          title: "",
          description: "",
          tcg: "",
          kind: "single",
          offer: toCollection ? "collection" : "sell",
          quantity: "1",
          price: "",
          negotiable: false,
          condition: "",
          card_language: locale === "de" ? "de" : "en",
          grading: "",
          city: profile.city ?? "",
          handover_event: true,
          handover_pickup: false,
          handover_shipping: false,
          photos: [],
          events: preset,
          card_code: "",
          card_no: "",
          binder: presetBinder,
          pocket: fach,
        }}
        events={events}
        binders={binders}
      />
    </div>
  );
}
