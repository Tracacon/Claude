import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getOperator, isOperatorComplete } from "@/lib/operator";

export async function generateMetadata({ params }: PageProps<"/[locale]/impressum">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Legal" });
  return { title: t("imprintTitle") };
}

export default async function ImprintPage({ params }: PageProps<"/[locale]/impressum">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Legal");
  const o = getOperator();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("imprintTitle")}</h1>
      {!isOperatorComplete(o) ? (
        <p className="card text-amber">{t("imprintMissing")}</p>
      ) : (
        <div className="card space-y-4">
          <section>
            <h2 className="font-semibold">{t("operator")}</h2>
            <p>
              {o.name}
              {o.legalForm ? ` ${o.legalForm}` : ""}
              <br />
              {o.street}
              <br />
              {o.city}
            </p>
          </section>
          {o.representative && (
            <section>
              <h2 className="font-semibold">{t("representative")}</h2>
              <p>{o.representative}</p>
            </section>
          )}
          <section>
            <h2 className="font-semibold">{t("contact")}</h2>
            <p>
              <a href={`mailto:${o.email}`} className="link">{o.email}</a>
              {o.phone && (
                <>
                  <br />
                  {o.phone}
                </>
              )}
            </p>
          </section>
          {o.register && (
            <section>
              <h2 className="font-semibold">{t("register")}</h2>
              <p>{o.register}</p>
            </section>
          )}
          {o.vatId && (
            <section>
              <h2 className="font-semibold">{t("vatId")}</h2>
              <p>{o.vatId}</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
