import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { Link } from "@/i18n/navigation";
import { requireProfile } from "@/lib/auth";
import { getMyBinders } from "@/lib/binders";
import { getProfileHighlights } from "@/lib/highlights";
import { photoUrl } from "@/lib/marketplace";
import { HighlightRow } from "./highlight-row";

export async function generateMetadata({ params }: PageProps<"/[locale]/highlights">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Highlights" });
  return { title: t("manageTitle") };
}

/** Eigene Highlights verwalten: Binder als runden Kreis im Profil zeigen, Beschriftung ändern, entfernen */
export default async function HighlightsPage({ params }: PageProps<"/[locale]/highlights">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireProfile();
  const [binders, highlights] = await Promise.all([getMyBinders(), getProfileHighlights(me.nickname!)]);
  const t = await getTranslations("Highlights");
  const byBinder = new Map(highlights.map((h) => [h.binder_id, h]));

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <BackLink fallback="/profil" label={t("back")} />
      <h1 className="text-2xl font-bold">{t("manageTitle")}</h1>
      <p className="text-sm text-cream/70">{t("manageIntro")}</p>
      {binders.length === 0 ? (
        <div className="card space-y-2 text-center">
          <p>{t("noBinders")}</p>
          <Link href="/binder/neu" className="btn-primary">{t("createBinder")}</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {binders.map((b) => {
            const h = byBinder.get(b.id);
            const img = b.cover_image
              ? photoUrl(me.id, b.cover_image, "thumb")
              : h?.card_photo
                ? photoUrl(me.id, h.card_photo, "thumb")
                : null;
            return (
              <li key={b.id}>
                <HighlightRow binderId={b.id} binderName={b.name} color={b.color} image={img} active={Boolean(h)} title={h?.title ?? b.name.slice(0, 20)} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
