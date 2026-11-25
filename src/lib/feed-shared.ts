/** Gemeinsame Typen und Hilfen für den Feed (Server und Browser). */

export const POST_BUCKET = "post-photos";
export const CAPTION_MAX = 2200;
export const COMMENT_MAX = 500;
export const POST_PHOTOS_MAX = 10;

export type FeedAuthor = { id: string; nickname: string; avatar_id: string | null; role: string };

export type PostItem = {
  type: "post";
  id: string;
  created_at: string;
  sort_at: string;
  caption: string;
  highlighted: boolean;
  hidden: boolean;
  /** "instagram" bei automatisch übernommenen Beiträgen */
  source?: "app" | "instagram";
  external_url?: string | null;
  is_video?: boolean;
  author: FeedAuthor;
  photos: string[];
  like_count: number;
  comment_count: number;
  liked: boolean;
  is_mine: boolean;
};

export type ListingItem = {
  type: "listing";
  id: string;
  created_at: string;
  sort_at: string;
  title: string;
  tcg: string;
  kind: string;
  offer: string;
  price_cents: number | null;
  negotiable: boolean;
  city: string | null;
  author: FeedAuthor;
  photos: string[];
  is_mine: boolean;
};

export type FeedItem = PostItem | ListingItem;

export type GridPost = {
  id: string;
  author_id: string;
  cover_photo_id: string | null;
  photo_count: number;
  like_count: number;
  comment_count: number;
};

export type PostComment = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author_nickname: string;
  author_avatar_id: string | null;
  can_delete: boolean;
};

export function postPhotoUrl(authorId: string, photoId: string, size: "full" | "thumb" = "full") {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${POST_BUCKET}/${authorId}/${photoId}${size === "thumb" ? "_t" : ""}.jpg`;
}
