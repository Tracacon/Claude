// Social-Funktionen: Typen und Hilfen (Server und Browser)

export const AVATAR_BUCKET = "avatars";
export const CHAT_PHOTO_BUCKET = "chat-photos";

export function avatarUrl(userId: string, avatarId: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/${userId}/${avatarId}.jpg`;
}

export type FollowState = "none" | "pending" | "accepted";

export type PublicProfile = {
  id: string;
  nickname: string;
  role: "member" | "team" | "admin";
  member_since: string;
  is_me: boolean;
  can_view: boolean;
  visibility: "public" | "followers";
  avatar_id: string | null;
  bio: string | null;
  city: string | null;
  website: string | null;
  instagram?: string | null;
  listing_count: number;
  post_count?: number;
  follower_count: number;
  following_count: number;
  my_follow: FollowState;
  follows_me: boolean;
  blocked: boolean;
  badges: string[];
};

export type FollowListItem = { id: string; nickname: string; avatar_id: string | null; my_follow: FollowState; is_me: boolean };

/** Abzeichen mit Symbol; Texte in messages/*.json → Badges */
export const BADGE_ICONS: Record<string, string> = {
  team: "🛡️",
  founder: "⭐",
  first_listing: "🃏",
  seller_10: "🏆",
  popular: "🔥",
  regular_3: "🎟️",
  regular_10: "🎖️",
  regular_25: "👑",
};
