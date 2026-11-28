import "server-only";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type NotificationKind = "follow" | "follow_request" | "follow_accepted" | "like" | "comment" | "trade_interest";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  created_at: string;
  read: boolean;
  actor: { id: string; nickname: string; avatar_id: string | null };
  post_id: string | null;
  post_author_id: string | null;
  post_cover_id: string | null;
  comment: string | null;
  listing_id: string | null;
  listing_title: string | null;
  listing_owner_id: string | null;
  listing_cover_id: string | null;
  my_follow: "pending" | "accepted" | null;
  request_open: boolean;
};

export type MiniProfile = { id: string; nickname: string; avatar_id: string | null; created_at?: string };

export async function getNotifications(limit = 50): Promise<AppNotification[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_notifications", { p_limit: limit });
  if (error) console.error("my_notifications", error.message);
  return (data ?? []) as AppNotification[];
}

export async function unreadNotificationCount() {
  if (!isSupabaseConfigured()) return 0;
  const supabase = await createClient();
  const { data } = await supabase.rpc("unread_notification_count");
  return Number(data ?? 0);
}

export async function markNotificationsRead() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read");
  if (error) console.error("mark_notifications_read", error.message);
}

/** "Ich bin gerade da" – die Datenbank speichert das höchstens einmal pro Minute. */
export async function touchPresence() {
  if (!isSupabaseConfigured()) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("touch_presence");
  if (error) console.error("touch_presence", error.message);
}

/** Follower und Gefolgte, die gerade online sind (berücksichtigt die Einstellungen in der Datenbank). */
export async function getOnlineContacts(): Promise<MiniProfile[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("online_contacts");
  if (error) console.error("online_contacts", error.message);
  return (data ?? []) as MiniProfile[];
}

/** Neue Mitglieder der letzten 14 Tage, die das zeigen möchten. */
export async function getNewMembers(limit = 20): Promise<MiniProfile[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("new_members", { p_limit: limit });
  if (error) console.error("new_members", error.message);
  return (data ?? []) as MiniProfile[];
}
