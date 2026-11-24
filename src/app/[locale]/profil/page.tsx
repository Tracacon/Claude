import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProfileView } from "@/components/profile-view";
import { requireProfile } from "@/lib/auth";
import { getProfileListings, getPublicProfile } from "@/lib/profiles";

export async function generateMetadata({ params }: PageProps<"/[locale]/profil">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Profile" });
  return { title: t("title") };
}

/** Eigenes Profil, so wie andere es sehen (Bearbeiten über /einstellungen). */
export default async function MyProfilePage({ params, searchParams }: PageProps<"/[locale]/profil">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireProfile();
  const sp = await searchParams;
  const profile = await getPublicProfile(me.nickname!);
  if (!profile) notFound();
  const tab = sp.tab === "abzeichen" ? "abzeichen" : "inserate";
  const listings = tab === "inserate" ? await getProfileListings(me.nickname!) : [];
  return <ProfileView profile={profile} listings={listings} tab={tab} loggedIn basePath="/profil" />;
}
