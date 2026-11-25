import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { PostCard } from "@/components/feed/post-card";
import { getMyProfile } from "@/lib/auth";
import { getComments, getPost } from "@/lib/feed";
import { Comments } from "./comments";

export async function generateMetadata({ params }: PageProps<"/[locale]/p/[id]">): Promise<Metadata> {
  const { id, locale } = await params;
  const p = await getPost(id);
  const t = await getTranslations({ locale, namespace: "Feed" });
  return { title: p ? t("postBy", { nickname: p.author.nickname }) : "TRACACON" };
}

export default async function PostPage({ params }: PageProps<"/[locale]/p/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await connection();
  const post = await getPost(id);
  if (!post) notFound();
  const [profile, comments] = await Promise.all([getMyProfile(), getComments(id)]);
  const loggedIn = Boolean(profile?.nickname);
  const isTeam = profile?.role === "team" || profile?.role === "admin";

  return (
    <div className="mx-auto max-w-[470px] space-y-5">
      <div className="-mx-4 sm:mx-0">
        <PostCard post={post} loggedIn={loggedIn} isTeam={isTeam} priority full />
      </div>
      <div className="-mx-4 sm:mx-0">
        <Comments postId={post.id} comments={comments} loggedIn={loggedIn} />
      </div>
    </div>
  );
}
