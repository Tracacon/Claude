// Typen für den App-Chat (Server und Browser)
import type { ListingStatus, Offer } from "@/lib/marketplace";

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  photo_id: string | null;
  created_at: string;
};

export type ConversationSummary = {
  id: string;
  listing_id: string | null;
  listing_title: string;
  listing_status: ListingStatus | null;
  listing_owner_id: string | null;
  cover_photo_id: string | null;
  other_id: string;
  other_nickname: string;
  other_avatar_id: string | null;
  i_am_seller: boolean;
  last_message_at: string;
  last_body: string | null;
  last_has_photo: boolean;
  last_from_me: boolean;
  unread: number;
  blocked: boolean;
};

export type ConversationHead = {
  id: string;
  listing_id: string | null;
  listing_title: string;
  listing_status: ListingStatus | null;
  listing_owner_id: string | null;
  cover_photo_id: string | null;
  listing_price_cents: number | null;
  listing_offer: Offer | null;
  other_id: string;
  other_nickname: string;
  other_avatar_id: string | null;
  i_am_seller: boolean;
  i_blocked: boolean;
  blocked_me: boolean;
};

export const MESSAGE_MAX = 1000;
