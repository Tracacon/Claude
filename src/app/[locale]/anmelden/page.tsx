import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getMyProfile } from "@/lib/auth";
import { LoginForm } from "./login-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/anmelden">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Login" });
  return { title: t("title") };
}

export default async function LoginPage({ params }: PageProps<"/[locale]/anmelden">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const profile = await getMyProfile();
  if (profile) redirect({ href: profile.nickname ? "/profil" : "/willkommen", locale });

  const t = await getTranslations("Login");
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-cream/80">{t("intro")}</p>
      <LoginForm />
      <p className="text-xs text-cream/60">{t("hint")}</p>
    </div>
  );
}
