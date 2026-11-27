import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { parseOfferFilter, parseProfileTab, ProfileView } from "@/components/profile-view";
import { getProfilePosts } from "@/lib/feed";
import { redirect } from "@/i18n/navigation";
import { getMyProfile } from "@/lib/auth";
import { getProfileBinders } from "@/lib/binders";
import { parseCollectionMark } from "@/lib/binder-shared";
import { getProfileCollection, getProfileEvents, getProfileListings, getPublicProfile } from "@/lib/profiles";
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
  if (profile.is_me) redirect({ href: typeof sp.tab === "string" ? `/profil?tab=${parseProfileTab(sp.tab)}` : "/profil", locale });

  const tab = parseProfileTab(sp.tab);
  const [collection, binders] = tab === "sammlung" && profile.can_view
    ? await Promise.all([getProfileCollection(profile.nickname), getProfileBinders(profile.nickname)])
    : [[], []];
  const listings = tab === "inserate" && profile.can_view ? await getProfileListings(profile.nickname) : [];
  const events = tab === "abzeichen" && profile.can_view ? await getProfileEvents(profile.nickname) : [];
  const posts = tab === "beitraege" && profile.can_view ? await getProfilePosts(profile.nickname) : [];
  const t = await getTranslations("Listing");
  return (
    <div className="space-y-6">
      <ProfileView profile={profile} listings={listings} collection={collection} binders={binders} events={events} posts={posts} tab={tab} offerFilter={parseOfferFilter(sp.angebot)} collectionMark={parseCollectionMark(sp.filter)} collectionBinder={typeof sp.binder === "string" ? sp.binder : null} loggedIn={Boolean(me?.nickname)} basePath={`/u/${profile.nickname}`} />
      {me?.nickname && <ReportForm profileId={profile.id} label={t("reportProfile")} />}
    </div>
  );
}
