import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getMyProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const configured = isSupabaseConfigured();
  const profile = await getMyProfile();

  return (
    <div className="space-y-6">
      <section className="space-y-3 pt-4">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber">TRACACON</p>
        <h1 className="text-4xl font-black leading-tight sm:text-5xl">{t("claim")}</h1>
        {profile?.nickname && <p className="text-lg">{t("hello", { nickname: profile.nickname })}</p>}
        <p className="text-cream/80">{t("intro")}</p>
      </section>

      <div className="flex flex-wrap gap-3">
        {profile ? (
          <Link href={profile.nickname ? "/profil" : "/willkommen"} className="btn-primary">
            {t("ctaProfile")}
          </Link>
        ) : (
          <Link href="/anmelden" className="btn-primary">
            {t("ctaLogin")}
          </Link>
        )}
      </div>

      <p className="card text-sm text-cream/70">{t("status")}</p>
      {!configured && <p className="card border-amber/40 text-sm text-amber">{t("notConfigured")}</p>}
    </div>
  );
}
