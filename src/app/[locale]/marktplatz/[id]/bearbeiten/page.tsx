import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ListingForm } from "@/components/listing-form";
import { redirect } from "@/i18n/navigation";
import { requireProfile } from "@/lib/auth";
import { getListing } from "@/lib/listings";
import { centsToInput } from "@/lib/marketplace";

export async function generateMetadata({ params }: PageProps<"/[locale]/marktplatz/[id]/bearbeiten">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Listing" });
  return { title: t("editTitle") };
}

export default async function EditListingPage({ params }: PageProps<"/[locale]/marktplatz/[id]/bearbeiten">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const profile = await requireProfile();
  const data = await getListing(id);
  if (!data || !data.is_owner) notFound();
  if (data.listing.status === "removed") redirect({ href: `/marktplatz/${id}`, locale });

  const l = data.listing;
  const t = await getTranslations("Listing");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("editTitle")}</h1>
      <ListingForm
        userId={profile.id}
        listingId={l.id}
        initial={{
          title: l.title,
          description: l.description ?? "",
          tcg: l.tcg,
          kind: l.kind,
          offer: l.offer,
          price: centsToInput(l.price_cents),
          negotiable: l.negotiable,
          condition: l.condition ?? "",
          card_language: l.card_language ?? "",
          grading: l.grading ?? "",
          city: l.city ?? "",
          handover_event: l.handover_event,
          handover_pickup: l.handover_pickup,
          handover_shipping: l.handover_shipping,
          photos: data.photos,
        }}
      />
    </div>
  );
}
