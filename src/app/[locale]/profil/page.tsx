import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSessionUser, requireProfile } from "@/lib/auth";
import { DeleteAccountForm } from "./delete-account-form";
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

      <ProfileForm
        initial={{
          city: profile.city ?? "",
          bio: profile.bio ?? "",
          website: profile.website ?? "",
          locale: profile.locale,
        }}
      />

      <DeleteAccountForm />
    </div>
  );
}
