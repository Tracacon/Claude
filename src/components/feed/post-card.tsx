"use client";
/* eslint-disable @next/next/no-img-element -- Fotos kommen direkt aus Supabase Storage */

import { useFormatter, useNow, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { CommentIcon, HeartIcon, ShareIcon } from "@/components/icons";
import { Link, useRouter } from "@/i18n/navigation";
import { toggleLike } from "@/lib/actions/posts";
import { postPhotoUrl, type PostItem } from "@/lib/feed-shared";
import { PostMenu } from "./post-menu";

/** Beitrag wie bei Instagram: Kopf, Fotos zum Wischen, Herz/Kommentar/Teilen, Text */
export function PostCard({
  post,
  loggedIn,
  isTeam,
  priority = false,
  full = false,
}: {
  post: PostItem;
  loggedIn: boolean;
  isTeam: boolean;
  priority?: boolean;
  /** Einzelansicht: ganzer Text, kein Link "Alle Kommentare" */
  full?: boolean;
}) {
  const t = useTranslations("Feed");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const router = useRouter();
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.like_count);
  const [burst, setBurst] = useState(false);
  const [slide, setSlide] = useState(0);
  const [expanded, setExpanded] = useState(full);
  const [, startTransition] = useTransition();
  const track = useRef<HTMLDivElement>(null);
  const lastTap = useRef(0);

  function like(force?: boolean) {
    if (!loggedIn) {
      router.push("/anmelden");
      return;
    }
    if (force && liked) return;
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    startTransition(async () => {
      const r = await toggleLike(post.id);
      if ("error" in r) {
        setLiked(!next);
        setLikes((n) => n + (next ? -1 : 1));
      } else {
        setLiked(r.liked);
        setLikes(r.like_count);
      }
    });
  }

  function onTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setBurst(true);
      setTimeout(() => setBurst(false), 700);
      like(true);
    }
    lastTap.current = now;
  }

  async function share() {
    const url = `${window.location.origin}/${document.documentElement.lang}/p/${post.id}`;
    if (navigator.share) {
      await navigator.share({ title: `@${post.author.nickname}`, url }).catch(() => undefined);
    } else {
      await navigator.clipboard?.writeText(url);
    }
  }

  const long = post.caption.length > 120 || post.caption.split("\n").length > 2;

  return (
    <article className="border-b border-line pb-4 sm:rounded-2xl sm:border sm:bg-night-2" aria-label={t("postBy", { nickname: post.author.nickname })}>
      <header className="flex items-center gap-3 px-3 py-2.5">
        <Link href={`/u/${post.author.nickname}`} className="flex min-w-0 items-center gap-3">
          <span className="rounded-full bg-gradient-to-tr from-brand to-brand-light p-[2px]">
            <span className="block rounded-full bg-night p-[2px]">
              <Avatar userId={post.author.id} avatarId={post.author.avatar_id} nickname={post.author.nickname} size="xs" />
            </span>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{post.author.nickname}</span>
            {post.highlighted && <span className="block text-xs text-brand">✦ {t("highlighted")}</span>}
            {post.hidden && <span className="block text-xs text-danger">{t("hidden")}</span>}
          </span>
        </Link>
        <span className="ml-auto">
          <PostMenu postId={post.id} isMine={post.is_mine} isTeam={isTeam} highlighted={post.highlighted} loggedIn={loggedIn} />
        </span>
      </header>

      <div className="relative bg-black" onClick={onTap}>
        <div
          ref={track}
          className="flex aspect-[4/5] snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        >
          {post.photos.map((ph, i) => (
            <img
              key={ph}
              src={postPhotoUrl(post.author.id, ph)}
              alt={t("photoOf", { n: i + 1, total: post.photos.length })}
              loading={priority && i === 0 ? "eager" : "lazy"}
              className="h-full w-full shrink-0 snap-center object-cover"
            />
          ))}
        </div>
        {post.photos.length > 1 && (
          <span className="absolute right-3 top-3 rounded-full bg-night/75 px-2 py-0.5 text-xs font-semibold">
            {slide + 1}/{post.photos.length}
          </span>
        )}
        {burst && (
          <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center text-white drop-shadow-lg">
            <HeartIcon className="size-24 animate-ping" filled />
          </span>
        )}
      </div>

      <div className="space-y-1.5 px-3 pt-2.5">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => like()} aria-pressed={liked} aria-label={liked ? t("unlike") : t("like")} className={liked ? "text-danger" : "text-cream"}>
            <HeartIcon filled={liked} className="size-[26px]" />
          </button>
          <Link href={`/p/${post.id}#kommentare`} aria-label={t("comments")} className="text-cream">
            <CommentIcon className="size-[26px]" />
          </Link>
          <button type="button" onClick={() => void share()} aria-label={t("share")} className="text-cream">
            <ShareIcon className="size-6" />
          </button>
          {post.photos.length > 1 && (
            <span className="mx-auto flex gap-1 pr-16" aria-hidden>
              {post.photos.map((ph, i) => (
                <span key={ph} className={`size-1.5 rounded-full ${i === slide ? "bg-brand" : "bg-white/30"}`} />
              ))}
            </span>
          )}
        </div>
        <p className="text-sm font-semibold">{t("likes", { count: likes })}</p>
        {post.caption && (
          <p className={`whitespace-pre-line text-sm ${expanded ? "" : "line-clamp-2"}`}>
            <Link href={`/u/${post.author.nickname}`} className="mr-1.5 font-semibold">{post.author.nickname}</Link>
            {post.caption}
          </p>
        )}
        {post.caption && long && !expanded && (
          <button type="button" className="text-sm text-cream/60" onClick={() => setExpanded(true)}>{t("more_text")}</button>
        )}
        {!full && post.comment_count > 0 && (
          <Link href={`/p/${post.id}#kommentare`} className="block text-sm text-cream/60">
            {t("allComments", { count: post.comment_count })}
          </Link>
        )}
        <p className="text-xs uppercase tracking-wide text-cream/45">
          <time dateTime={post.created_at}>{format.relativeTime(new Date(post.created_at), now)}</time>
        </p>
      </div>
    </article>
  );
}
