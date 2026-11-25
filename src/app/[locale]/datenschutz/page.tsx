import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getOperator, isOperatorComplete } from "@/lib/operator";

type Section = { h: string; p: string[] };

export async function generateMetadata({ params }: PageProps<"/[locale]/datenschutz">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Privacy" });
  return { title: t("title") };
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/datenschutz">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Privacy");
  const tL = await getTranslations("Legal");
  const sections = t.raw("sections") as Section[];
  const o = getOperator();

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-cream/60">{t("updated")}</p>
        <p className="card border-brand/40 text-sm text-brand">{t("draft")}</p>
      </header>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold">{t("responsible")}</h2>
        {isOperatorComplete(o) ? (
          <p className="text-cream/85">
            {o.name}
            {o.legalForm ? ` ${o.legalForm}` : ""}
            <br />
            {o.street}
            <br />
            {o.city}
            <br />
            <a href={`mailto:${o.email}`} className="link">{o.email}</a>
          </p>
        ) : (
          <p className="text-cream/85">
            {t("responsibleMissing")} <Link href="/impressum" className="link">{tL("imprintTitle")}</Link>
          </p>
        )}
      </section>

      {sections.map((s) => (
        <section key={s.h} className="space-y-2">
          <h2 className="font-display text-lg font-semibold">{s.h}</h2>
          {s.p.map((para, i) => (
            <p key={i} className="text-cream/85">{para}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
