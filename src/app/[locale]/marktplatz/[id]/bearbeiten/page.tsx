import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ListingForm } from "@/components/listing-form";
import { redirect } from "@/i18n/navigation";
import { requireProfile } from "@/lib/auth";
import { ensureEventsFresh, getEvents, getListingEvents } from "@/lib/events";
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
  await ensureEventsFresh();
  const [upcoming, chosen] = await Promise.all([getEvents(false, 8), getListingEvents(l.id)]);
  // Bereits gewählte Termine immer anzeigen, auch wenn sie nicht unter den nächsten acht sind
  const events = [...upcoming, ...chosen.filter((c) => !upcoming.some((u) => u.id === c.id)).map((c) => ({ ...c, timezone: null }))];
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
          events: chosen.map((e) => e.id),
          card:
            l.card_ref && l.card_name
              ? {
                  id: l.card_ref.replace(/^tcgdex:/, ""),
                  name: l.card_name,
                  name_en: l.card_name_en,
                  set: l.card_set ?? "",
                  number: l.card_number ?? "",
                  image: l.card_image,
                }
              : null,
          variant: l.variant ?? "",
          grading_company: l.grading_company ?? "",
          grading_grade: l.grading_grade === null ? "" : String(Number(l.grading_grade)),
          sealed_type: l.sealed_type ?? "",
        }}
        events={events}
      />
    </div>
  );
}
