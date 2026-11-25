import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SiteFooter } from "@/components/site-footer";
import { InstallBanner } from "@/components/install-banner";
import { SiteHeader } from "@/components/site-header";
import "@fontsource-variable/inter";
import "@fontsource/chakra-petch/latin-500.css";
import "@fontsource/chakra-petch/latin-600.css";
import "@fontsource/chakra-petch/latin-700.css";
import "../globals.css";


export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  return {
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
    robots: { index: false, follow: false }, // bis zum offiziellen Start
    applicationName: "Tracacon App",
    appleWebApp: { capable: true, title: "Tracacon", statusBarStyle: "black" },
    icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = {
  themeColor: "#0a0d11",
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider timeZone="Europe/Berlin">
          <SiteHeader />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6 sm:pb-10 sm:pt-10">{children}</main>
          <SiteFooter />
          <InstallBanner />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
