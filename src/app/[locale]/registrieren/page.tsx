import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getMyProfile } from "@/lib/auth";
import { RegisterForm } from "./register-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/registrieren">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Register" });
  return { title: t("title") };
}

export default async function RegisterPage({ params }: PageProps<"/[locale]/registrieren">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const profile = await getMyProfile();
  if (profile) redirect({ href: profile.nickname ? "/profil" : "/willkommen", locale });

  return <RegisterForm />;
}
