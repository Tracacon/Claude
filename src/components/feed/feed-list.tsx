"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { loadMoreFeed } from "@/lib/actions/posts";
import type { FeedItem } from "@/lib/feed-shared";
import { ListingPost } from "./listing-post";
import { PostCard } from "./post-card";

/** Feed mit unendlichem Scrollen */
export function FeedList({ initial, loggedIn, isTeam, pageSize }: { initial: FeedItem[]; loggedIn: boolean; isTeam: boolean; pageSize: number }) {
  const t = useTranslations("Feed");
  const [items, setItems] = useState(initial);
  const [done, setDone] = useState(initial.length < pageSize);
  const [pending, startTransition] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting || pending) return;
      const last = items[items.length - 1];
      if (!last) return;
      startTransition(async () => {
        const more = await loadMoreFeed(last.sort_at);
        setItems((cur) => {
          const seen = new Set(cur.map((x) => `${x.type}:${x.id}`));
          return [...cur, ...more.filter((x) => !seen.has(`${x.type}:${x.id}`))];
        });
        if (more.length < pageSize) setDone(true);
      });
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [items, done, pending, pageSize]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {items.map((item, i) =>
        item.type === "post" ? (
          <PostCard key={`p-${item.id}`} post={item} loggedIn={loggedIn} isTeam={isTeam} priority={i === 0} />
        ) : (
          <ListingPost key={`l-${item.id}`} item={item} />
        ),
      )}
      <div ref={sentinel} aria-hidden className="h-1" />
      {pending && <p role="status" className="py-4 text-center text-sm text-cream/60">{t("loading")}</p>}
      {done && items.length > 0 && <p className="py-6 text-center text-sm text-cream/50">✓ {t("allSeen")}</p>}
    </div>
  );
}
