import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { parseProfileTab, ProfileView } from "@/components/profile-view";
import { getProfilePosts } from "@/lib/feed";
import { requireProfile } from "@/lib/auth";
import { getProfileEvents, getProfileListings, getPublicProfile } from "@/lib/profiles";

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
  const tab = parseProfileTab(sp.tab);
  const listings = tab === "inserate" ? await getProfileListings(me.nickname!) : [];
  const events = tab === "abzeichen" ? await getProfileEvents(me.nickname!) : [];
  const posts = tab === "beitraege" ? await getProfilePosts(me.nickname!) : [];
  return <ProfileView profile={profile} listings={listings} events={events} posts={posts} tab={tab} loggedIn basePath="/profil" />;
}
