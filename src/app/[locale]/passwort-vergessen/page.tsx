import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ResetForm } from "./reset-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/passwort-vergessen">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Reset" });
  return { title: t("title") };
}

// Bewusst keine Weiterleitung für Angemeldete: nach dem Code ist man angemeldet
// und legt auf dieser Seite noch das neue Passwort fest.
export default async function ResetPage({ params }: PageProps<"/[locale]/passwort-vergessen">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ResetForm />;
}
