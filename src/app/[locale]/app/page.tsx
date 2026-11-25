/* eslint-disable @next/next/no-img-element -- App-Symbol als einfache Datei */
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { InstallGuide } from "./install-guide";

export async function generateMetadata({ params }: PageProps<"/[locale]/app">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Install" });
  return { title: t("pageTitle") };
}

/** Ziel für QR-Codes und Links: die App aufs Handy holen. */
export default async function InstallPage({ params }: PageProps<"/[locale]/app">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Install");
  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="flex items-center gap-4">
        <img src="/icons/icon-192.png" alt="" width={72} height={72} className="size-18 rounded-2xl" />
        <div>
          <h1 className="text-2xl font-bold normal-case">{t("pageTitle")}</h1>
          <p className="text-sm text-cream/70">{t("pageText")}</p>
        </div>
      </div>
      <InstallGuide />
      <Link href="/" className="btn-ghost w-full justify-center">{t("continue")}</Link>
    </div>
  );
}
