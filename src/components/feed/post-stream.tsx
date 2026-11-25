"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { loadPosts } from "@/lib/actions/posts";
import type { PostItem } from "@/lib/feed-shared";
import { PostCard } from "./post-card";

const CHUNK = 4;

/**
 * Angetippter Beitrag und darunter die nächsten aus derselben Liste
 * (Profil oder Entdecken) – einfach weiterscrollen wie bei Instagram.
 */
export function PostStream({
  initial,
  rest,
  loggedIn,
  isTeam,
}: {
  initial: PostItem[];
  /** IDs der noch nicht geladenen Beiträge, in Reihenfolge */
  rest: string[];
  loggedIn: boolean;
  isTeam: boolean;
}) {
  const t = useTranslations("Feed");
  const [items, setItems] = useState(initial);
  const [queue, setQueue] = useState(rest);
  const [pending, startTransition] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || queue.length === 0) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting || pending) return;
      const next = queue.slice(0, CHUNK);
      startTransition(async () => {
        const more = await loadPosts(next);
        setItems((cur) => {
          const seen = new Set(cur.map((x) => x.id));
          return [...cur, ...more.filter((x) => !seen.has(x.id))];
        });
        setQueue((q) => q.slice(next.length));
      });
    }, { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [queue, pending]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {items.map((post, i) => (
        <PostCard key={post.id} post={post} loggedIn={loggedIn} isTeam={isTeam} priority={i === 0} />
      ))}
      <div ref={sentinel} aria-hidden className="h-1" />
      {pending && <p role="status" className="py-4 text-center text-sm text-cream/60">{t("loading")}</p>}
      {queue.length === 0 && !pending && <p className="py-6 text-center text-sm text-cream/50">✓ {t("streamEnd")}</p>}
    </div>
  );
}
