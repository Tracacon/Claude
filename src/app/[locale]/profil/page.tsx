import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSessionUser, requireProfile } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { DeleteAccountForm } from "./delete-account-form";
import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/profil">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Profile" });
  return { title: t("title") };
}

export default async function ProfilePage({ params }: PageProps<"/[locale]/profil">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const profile = await requireProfile();
  const user = await getSessionUser();
  const t = await getTranslations("Profile");
  const tr = await getTranslations("Roles");
  const tNav = await getTranslations("Nav");
  const isTeam = profile.role === "team" || profile.role === "admin";
  const format = await getFormatter();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-cream/60">
            {t("memberSince", { date: format.dateTime(new Date(profile.created_at), { dateStyle: "long" }) })}
          </p>
        </div>
        <Link href={`/u/${profile.nickname}`} className="link text-sm">
          @{profile.nickname}
        </Link>
      </div>

      <dl className="card grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-cream/60">{t("nickname")}</dt>
          <dd className="font-semibold">{profile.nickname}</dd>
        </div>
        <div>
          <dt className="text-cream/60">{t("email")}</dt>
          <dd className="break-all">{user?.email}</dd>
        </div>
        <div>
          <dt className="text-cream/60">{t("role")}</dt>
          <dd>{tr(profile.role)}</dd>
        </div>
      </dl>

      <nav aria-label={t("areas")} className="card flex flex-wrap gap-2">
        <Link href="/meine-inserate" className="btn-ghost">{tNav("myListings")}</Link>
        <Link href="/marktplatz/neu" className="btn-ghost">+ {tNav("sell")}</Link>
        {isTeam && <Link href="/moderation" className="btn-ghost">{tNav("moderation")}</Link>}
        {profile.role === "admin" && <Link href="/admin" className="btn-ghost">{tNav("admin")}</Link>}
        <form action={signOut} className="ml-auto">
          <button type="submit" className="btn-ghost text-cream/70">{t("logout")}</button>
        </form>
      </nav>

      <ProfileForm
        initial={{
          city: profile.city ?? "",
          bio: profile.bio ?? "",
          website: profile.website ?? "",
          locale: profile.locale,
        }}
      />

      <PasswordForm />

      <DeleteAccountForm />
    </div>
  );
}
