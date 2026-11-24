import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProfileView } from "@/components/profile-view";
import { redirect } from "@/i18n/navigation";
import { getMyProfile } from "@/lib/auth";
import { getProfileListings, getPublicProfile } from "@/lib/profiles";
import { ReportForm } from "../../marktplatz/[id]/listing-actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/u/[nickname]">): Promise<Metadata> {
  const { nickname } = await params;
  return { title: `@${decodeURIComponent(nickname)}` };
}

export default async function PublicProfilePage({ params, searchParams }: PageProps<"/[locale]/u/[nickname]">) {
  const { locale, nickname: raw } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const nickname = decodeURIComponent(raw);
  const [profile, me] = await Promise.all([getPublicProfile(nickname), getMyProfile()]);
  if (!profile) notFound();
  if (profile.is_me) redirect({ href: sp.tab === "abzeichen" ? "/profil?tab=abzeichen" : "/profil", locale });

  const tab = sp.tab === "abzeichen" ? "abzeichen" : "inserate";
  const listings = tab === "inserate" && profile.can_view ? await getProfileListings(profile.nickname) : [];
  const t = await getTranslations("Listing");
  return (
    <div className="space-y-6">
      <ProfileView profile={profile} listings={listings} tab={tab} loggedIn={Boolean(me?.nickname)} basePath={`/u/${profile.nickname}`} />
      {me?.nickname && <ReportForm profileId={profile.id} label={t("reportProfile")} />}
    </div>
  );
}
