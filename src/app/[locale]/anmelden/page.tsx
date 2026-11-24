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

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/anmelden">) {
  const { locale } = await params;
  const checkin = (await searchParams).checkin === "1";
  setRequestLocale(locale);
  const profile = await getMyProfile();
  if (profile) redirect({ href: profile.nickname ? "/profil" : "/willkommen", locale });

  if (!checkin) return <LoginForm />;
  const t = await getTranslations("Events");
  return (
    <div className="space-y-4">
      <p role="status" className="card border-brand/50 bg-brand/10 text-sm">📍 {t("checkinLoginHint")}</p>
      <LoginForm />
    </div>
  );
}
