import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/regeln">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Legal" });
  return { title: t("rulesTitle") };
}

export default async function RulesPage({ params }: PageProps<"/[locale]/regeln">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Legal");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("rulesTitle")}</h1>
      <p className="card border-amber/40 text-amber">{t("rulesDraft")}</p>
      <ol className="list-decimal space-y-2 pl-5 text-cream/85">
        <li>{t("rules1")}</li>
        <li>{t("rules2")}</li>
        <li>{t("rules3")}</li>
        <li>{t("rules4")}</li>
      </ol>
    </div>
  );
}
