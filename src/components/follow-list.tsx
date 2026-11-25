import { getTranslations } from "next-intl/server";
import { OnlineAvatar } from "@/components/online-avatar";
import { FollowButton } from "@/components/follow-button";
import { RemoveFollowerButton } from "@/components/social-buttons";
import { Link } from "@/i18n/navigation";
import { getOnlineContacts } from "@/lib/notifications";
import type { FollowListItem, PublicProfile } from "@/lib/social";

/** Liste der Follower bzw. gefolgten Personen mit Umschalter. */
export async function FollowList({
  profile,
  kind,
  items,
  loggedIn,
}: {
  profile: PublicProfile;
  kind: "followers" | "following";
  items: FollowListItem[];
  loggedIn: boolean;
}) {
  const t = await getTranslations("Social");
  const tA = await getTranslations("Activity");
  // Grüner Punkt nur für eigene Follower und Gefolgte, die den Status zeigen (prüft die Datenbank)
  const online = new Set(loggedIn ? (await getOnlineContacts()).map((p) => p.id) : []);
  const base = `/u/${profile.nickname}`;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href={profile.is_me ? "/profil" : base} className="rounded-lg px-2 py-1 text-cream/70 hover:bg-white/5" aria-label={t("back")}>←</Link>
        <h1 className="text-lg font-bold">@{profile.nickname}</h1>
      </div>
      <nav className="flex border-b border-line text-sm">
        <Link href={`${base}/follower`} aria-current={kind === "followers" ? "page" : undefined}
          className={`flex-1 border-b-2 py-2.5 text-center font-semibold ${kind === "followers" ? "border-brand text-brand" : "border-transparent text-cream/60"}`}>
          {profile.follower_count} {t("followers")}
        </Link>
        <Link href={`${base}/folgt`} aria-current={kind === "following" ? "page" : undefined}
          className={`flex-1 border-b-2 py-2.5 text-center font-semibold ${kind === "following" ? "border-brand text-brand" : "border-transparent text-cream/60"}`}>
          {profile.following_count} {t("followingCount")}
        </Link>
      </nav>
      {!profile.can_view ? (
        <p className="card text-center text-sm text-cream/70">{t("privateText", { nickname: profile.nickname })}</p>
      ) : items.length === 0 ? (
        <p className="card text-center text-sm text-cream/70">{kind === "followers" ? t("noFollowers") : t("noFollowing")}</p>
      ) : (
        <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-line bg-night-2">
          {items.map((u) => (
            <li key={u.id} className="flex items-center gap-3 p-3">
              <Link href={`/u/${u.nickname}`} className="flex min-w-0 flex-1 items-center gap-3">
                <OnlineAvatar userId={u.id} avatarId={u.avatar_id} nickname={u.nickname} online={online.has(u.id)} label={tA("online")} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">@{u.nickname}</span>
                  {online.has(u.id) && <span className="block text-xs text-ok">{tA("online")}</span>}
                </span>
              </Link>
              {profile.is_me && kind === "followers" && <RemoveFollowerButton userId={u.id} />}
              {loggedIn && !u.is_me && !(profile.is_me && kind === "followers") && (
                <FollowButton userId={u.id} initial={u.my_follow} compact />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
