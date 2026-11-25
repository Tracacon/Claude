import "server-only";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import type { UserMenuData } from "@/components/user-menu";
import { getMyProfile } from "@/lib/auth";
import { unreadNotificationCount } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

async function rpcCount(name: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc(name);
  return Number(data ?? 0);
}

/** Daten fürs Profilmenü (Zahlen, Beschriftungen) – einmal pro Seitenaufruf, für Kopfzeile und Profilseite. */
export const getUserMenu = cache(async () => {
  const t = await getTranslations("Nav");
  const profile = await getMyProfile();
  const isTeam = profile?.role === "team" || profile?.role === "admin";
  const onboarded = Boolean(profile?.nickname);
  const [reports, unread, requests, notes] = await Promise.all([
    isTeam ? rpcCount("open_report_count") : 0,
    onboarded ? rpcCount("unread_message_count") : 0,
    onboarded ? rpcCount("pending_follow_request_count") : 0,
    onboarded ? unreadNotificationCount() : 0,
  ]);
  // Offene Anfragen stehen auch als Benachrichtigung in der Liste; die größere Zahl zählt
  const activity = Math.max(notes, requests);
  const menu: UserMenuData | null =
    profile && profile.nickname
      ? {
          id: profile.id,
          nickname: profile.nickname,
          avatarId: profile.avatar_id,
          role: profile.role,
          unread,
          requests: activity,
          reports,
          labels: {
            menu: t("menu"),
            myProfile: t("myProfile"),
            myListings: t("myListings"),
            messages: t("messages"),
            followers: t("followers"),
            following: t("following"),
            requests: t("requests"),
            badges: t("badges"),
            settings: t("settings"),
            moderation: t("moderation"),
            teamEvents: t("teamEvents"),
            admin: t("admin"),
            logout: t("logout"),
            profile: t("profile"),
            close: t("close"),
          },
        }
      : null;
  return { profile, onboarded, isTeam, reports, unread, activity, menu };
});
