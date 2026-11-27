import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ListingForm } from "@/components/listing-form";
import { redirect } from "@/i18n/navigation";
import { requireProfile } from "@/lib/auth";
import { ensureEventsFresh, getEvents, getListingEvents } from "@/lib/events";
import { getListing } from "@/lib/listings";
import { getMyBinders } from "@/lib/binders";
import { centsToInput } from "@/lib/marketplace";
import { SET_CODES } from "@/lib/set-codes";

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
  const [upcoming, chosen, binders] = await Promise.all([getEvents(false, 8), getListingEvents(l.id), getMyBinders()]);
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
          // Automatischer Titel wird nicht vorausgefüllt (zum Tauschen/Verkaufen braucht es einen echten)
          title: l.title_auto ? "" : l.title,
          description: l.description ?? "",
          tcg: l.tcg,
          kind: l.kind,
          offer: l.status === "collection" ? "collection" : l.offer,
          quantity: String(l.quantity ?? 1),
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
          card_code: cardCodeOf(l.card_ref, l.card_set),
          card_no: l.card_number ?? "",
          binder: l.binder_id ?? "",
        }}
        events={events}
        binders={binders}
      />
    </div>
  );
}

/** Set-Kürzel fürs Formular: aus der gespeicherten Karte (Pokémon) oder dem gespeicherten Text */
function cardCodeOf(ref: string | null, set: string | null) {
  const setId = ref?.replace(/^tcgdex:/, "").replace(/-[^-]+$/, "");
  const known = setId ? SET_CODES.find((s) => s.id === setId) : SET_CODES.find((s) => s.name === set);
  return known?.code ?? set ?? "";
}
