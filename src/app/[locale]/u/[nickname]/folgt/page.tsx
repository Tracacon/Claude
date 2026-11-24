import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FollowList } from "@/components/follow-list";
import { getMyProfile } from "@/lib/auth";
import { getFollowList, getPublicProfile } from "@/lib/profiles";

export async function generateMetadata({ params }: PageProps<"/[locale]/u/[nickname]/folgt">): Promise<Metadata> {
  const { locale, nickname } = await params;
  const t = await getTranslations({ locale, namespace: "Social" });
  return { title: `@${decodeURIComponent(nickname)} · ${t("followingCount")}` };
}

export default async function Page({ params }: PageProps<"/[locale]/u/[nickname]/folgt">) {
  const { locale, nickname } = await params;
  setRequestLocale(locale);
  const [profile, me] = await Promise.all([getPublicProfile(decodeURIComponent(nickname)), getMyProfile()]);
  if (!profile) notFound();
  const items = profile.can_view ? await getFollowList(profile.nickname, "following") : [];
  return <FollowList profile={profile} kind="following" items={items} loggedIn={Boolean(me?.nickname)} />;
}
