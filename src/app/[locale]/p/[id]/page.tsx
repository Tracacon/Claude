import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { PostCard } from "@/components/feed/post-card";
import { PostStream } from "@/components/feed/post-stream";
import { getMyProfile } from "@/lib/auth";
import { getComments, getExplore, getPost, getProfilePosts } from "@/lib/feed";
import type { PostItem } from "@/lib/feed-shared";
import { Comments } from "./comments";

export async function generateMetadata({ params }: PageProps<"/[locale]/p/[id]">): Promise<Metadata> {
  const { id, locale } = await params;
  const p = await getPost(id);
  const t = await getTranslations({ locale, namespace: "Feed" });
  return { title: p ? t("postBy", { nickname: p.author.nickname }) : "Tracacon" };
}

const FIRST = 3;

/**
 * Einzelner Beitrag. Kommt man aus einem Raster (Profil oder Entdecken),
 * folgen darunter die weiteren Beiträge dieser Liste zum Weiterscrollen;
 * die Kommentare öffnet dann das Sprechblasen-Symbol.
 */
export default async function PostPage({ params, searchParams }: PageProps<"/[locale]/p/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await connection();
  const post = await getPost(id);
  if (!post) notFound();
  const liste = (await searchParams).liste;
  const profile = await getMyProfile();
  const loggedIn = Boolean(profile?.nickname);
  const isTeam = profile?.role === "team" || profile?.role === "admin";

  if (liste === "profil" || liste === "entdecken") {
    const t = await getTranslations("Feed");
    const list = liste === "profil" ? await getProfilePosts(post.author.nickname) : await getExplore();
    const ids = list.map((g) => g.id);
    const at = ids.indexOf(post.id);
    const after = at >= 0 ? ids.slice(at + 1) : [];
    const next = (await Promise.all(after.slice(0, FIRST).map((x) => getPost(x)))).filter((p): p is PostItem => p !== null);
    return (
      <div className="mx-auto max-w-[470px] space-y-3">
        <h1 className="sr-only">{liste === "profil" ? t("postsOf", { nickname: post.author.nickname }) : t("explorePosts")}</h1>
        <div className="-mx-4 sm:mx-0">
          <PostStream initial={[post, ...next]} rest={after.slice(FIRST)} loggedIn={loggedIn} isTeam={isTeam} />
        </div>
      </div>
    );
  }

  const comments = await getComments(id);
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
