/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Avatar } from "@/components/avatar";
import { FollowButton } from "@/components/follow-button";
import { RequestButtons } from "@/components/social-buttons";
import { Link } from "@/i18n/navigation";
import { requireProfile } from "@/lib/auth";
import { postPhotoUrl } from "@/lib/feed-shared";
import { getNotifications, markNotificationsRead, type AppNotification } from "@/lib/notifications";

export async function generateMetadata({ params }: PageProps<"/[locale]/aktivitaet">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Activity" });
  return { title: t("title") };
}

/** Aktivität: neue Follower, Folgeanfragen, Likes und Kommentare. */
export default async function ActivityPage({ params }: PageProps<"/[locale]/aktivitaet">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireProfile();
  const items = await getNotifications();
  // Beim Öffnen gilt alles als gelesen; die Markierung "neu" sieht man trotzdem noch einmal
  if (items.some((n) => !n.read)) await markNotificationsRead();
  const t = await getTranslations("Activity");
  const format = await getFormatter();
  const now = new Date();

  const text = (n: AppNotification) => {
    const b = (c: React.ReactNode) => <b className="font-semibold">{c}</b>;
    const nickname = n.actor.nickname;
    switch (n.kind) {
      case "follow": return t.rich("follow", { nickname, b });
      case "follow_request": return t.rich("followRequest", { nickname, b });
      case "follow_accepted": return t.rich("followAccepted", { nickname, b });
      case "like": return t.rich("like", { nickname, b });
      case "comment": return t.rich("comment", { nickname, b, text: n.comment ?? "" });
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {items.length === 0 ? (
        <div className="card space-y-2 text-center">
          <p className="font-display text-lg font-semibold">{t("emptyTitle")}</p>
          <p className="text-sm text-cream/70">{t("emptyText")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-line bg-night-2">
          {items.map((n) => (
            <li key={n.id} className={`flex items-center gap-3 p-3 ${n.read ? "" : "bg-brand/[0.07]"}`}>
              <Link href={`/u/${n.actor.nickname}`} className="shrink-0" aria-label={`@${n.actor.nickname}`}>
                <Avatar userId={n.actor.id} avatarId={n.actor.avatar_id} nickname={n.actor.nickname} />
              </Link>
              <div className="min-w-0 flex-1 text-sm">
                <p className="break-words">
                  {text(n)}{" "}
                  <time dateTime={n.created_at} className="whitespace-nowrap text-cream/50">
                    {format.relativeTime(new Date(n.created_at), now)}
                  </time>
                </p>
                {!n.read && <span className="sr-only">{t("unread")}</span>}
              </div>
              {n.kind === "follow_request" && n.request_open ? (
                <RequestButtons userId={n.actor.id} />
              ) : (n.kind === "follow" || n.kind === "follow_accepted") && n.my_follow !== "accepted" ? (
                <FollowButton userId={n.actor.id} initial={n.my_follow ?? "none"} compact />
              ) : n.post_id && n.post_author_id && n.post_cover_id ? (
                <Link href={`/p/${n.post_id}${n.kind === "comment" ? "#kommentare" : ""}`} className="shrink-0" aria-label={t("openPost")}>
                  <img src={postPhotoUrl(n.post_author_id, n.post_cover_id, "thumb")} alt="" className="size-11 rounded-md object-cover" loading="lazy" />
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
