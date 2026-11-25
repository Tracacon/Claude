import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ListingForm } from "@/components/listing-form";
import { requireProfile } from "@/lib/auth";
import { ensureEventsFresh, getEvents } from "@/lib/events";

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
  const events = await getEvents(false, 8);
  const wanted = (await searchParams).termin;
  const preset = events.filter((e) => e.id === wanted).map((e) => e.id);
  const t = await getTranslations("Listing");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("newTitle")}</h1>
      <ListingForm
        userId={profile.id}
        initial={{
          title: "",
          description: "",
          tcg: "",
          kind: "single",
          offer: "sell",
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
        }}
        events={events}
      />
    </div>
  );
}
