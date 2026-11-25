import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PushSettings } from "@/components/push-settings";
import { getSessionUser, requireProfile } from "@/lib/auth";
import { isPushConfigured } from "@/lib/push";
import { AvatarForm } from "./avatar-form";
import { DeleteAccountForm } from "./delete-account-form";
import { PasswordForm } from "./password-form";
import { PresenceForm } from "./presence-form";
import { PrivacyForm } from "./privacy-form";
import { ProfileForm } from "./profile-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/einstellungen">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Settings" });
  return { title: t("title") };
}

/** Einstellungen: Profilbild, Angaben, Privatsphäre, Passwort, Konto. */
export default async function SettingsPage({ params }: PageProps<"/[locale]/einstellungen">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const profile = await requireProfile();
  const user = await getSessionUser();
  const t = await getTranslations("Settings");
  const tP = await getTranslations("Push");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/profil" className="rounded-lg px-2 py-1 text-cream/70 hover:bg-white/5" aria-label={t("back")}>←</Link>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>
      <p className="text-sm text-cream/60">
        @{profile.nickname} · {user?.email}
      </p>
      <AvatarForm userId={profile.id} nickname={profile.nickname!} avatarId={profile.avatar_id} />
      <ProfileForm
        initial={{ city: profile.city ?? "", bio: profile.bio ?? "", website: profile.website ?? "", instagram: profile.instagram ?? "", locale: profile.locale }}
      />
      <PrivacyForm visibility={profile.profile_visibility} approval={profile.follow_approval} />
      <section className="card space-y-3">
        <div>
          <h2 className="font-semibold">{tP("settingsTitle")}</h2>
          <p className="text-sm text-cream/70">{tP("settingsText")}</p>
        </div>
        <PushSettings available={isPushConfigured()} />
      </section>
      <PresenceForm showOnline={profile.show_online !== false} showSignup={profile.show_signup !== false} />
      <PasswordForm />
      <DeleteAccountForm />
    </div>
  );
}
