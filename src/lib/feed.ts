import "server-only";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import type { FeedItem, GridPost, PostComment, PostItem } from "@/lib/feed-shared";
import { UUID_PATTERN } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";

export const FEED_PAGE = 8;

export async function getFeed(before: string | null = null): Promise<FeedItem[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("feed", { p_before: before, p_limit: FEED_PAGE });
  if (error) {
    console.error("feed", error.message);
    return [];
  }
  return (data ?? []) as FeedItem[];
}

export const getPost = cache(async (id: string): Promise<PostItem | null> => {
  if (!UUID_PATTERN.test(id) || !isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_post", { p_id: id });
  if (error) console.error("get_post", error.message);
  return (data as PostItem | null) ?? null;
});

export async function getComments(postId: string): Promise<PostComment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_comments", { p_post: postId, p_limit: 300 });
  if (error) console.error("post_comments", error.message);
  return (data ?? []) as PostComment[];
}

function grid(rows: unknown): GridPost[] {
  return ((rows ?? []) as GridPost[]).map((r) => ({
    ...r,
    photo_count: Number(r.photo_count),
    like_count: Number(r.like_count),
    comment_count: Number(r.comment_count),
  }));
}

export async function getProfilePosts(nickname: string): Promise<GridPost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("profile_posts", { p_nickname: nickname, p_limit: 120 });
  if (error) console.error("profile_posts", error.message);
  return grid(data);
}

export async function getExplore(): Promise<GridPost[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("explore_posts", { p_limit: 30 });
  if (error) console.error("explore_posts", error.message);
  return grid(data);
}

export type ProfileHit = { id: string; nickname: string; avatar_id: string | null; role: string; follower_count: number };

export async function searchProfiles(q: string): Promise<ProfileHit[]> {
  if (!q.trim() || !isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_profiles", { p_query: q.trim().slice(0, 40), p_limit: 20 });
  if (error) console.error("search_profiles", error.message);
  return ((data ?? []) as ProfileHit[]).map((h) => ({ ...h, follower_count: Number(h.follower_count) }));
}
