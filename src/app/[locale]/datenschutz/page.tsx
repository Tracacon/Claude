import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/datenschutz">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Legal" });
  return { title: t("privacyTitle") };
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/datenschutz">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Legal");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("privacyTitle")}</h1>
      <p className="card border-amber/40 text-amber">{t("privacyDraft")}</p>
      <p className="text-cream/85">{t("privacyBasics")}</p>
    </div>
  );
}
