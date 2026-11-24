import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ListingForm } from "@/components/listing-form";
import { requireProfile } from "@/lib/auth";

export async function generateMetadata({ params }: PageProps<"/[locale]/marktplatz/neu">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Listing" });
  return { title: t("newTitle") };
}

export default async function NewListingPage({ params }: PageProps<"/[locale]/marktplatz/neu">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const profile = await requireProfile();
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
        }}
      />
    </div>
  );
}
