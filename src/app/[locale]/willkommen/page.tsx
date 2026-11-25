import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getMyProfile, requireUser } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";
import { BrandText } from "@/components/brand-text";

export async function generateMetadata({ params }: PageProps<"/[locale]/willkommen">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Onboarding" });
  return { title: t("title") };
}

export default async function OnboardingPage({ params }: PageProps<"/[locale]/willkommen">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser();
  const profile = await getMyProfile();
  if (profile?.nickname) redirect({ href: "/profil", locale });

  const t = await getTranslations("Onboarding");
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold"><BrandText text={t("title")} /></h1>
      <p className="text-cream/80">{t("intro")}</p>
      <OnboardingForm />
    </div>
  );
}
