"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireProfile, requireRole } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { getFeed } from "@/lib/feed";
import { CAPTION_MAX, COMMENT_MAX, POST_BUCKET, POST_PHOTOS_MAX, type FeedItem } from "@/lib/feed-shared";
import { UUID_PATTERN } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";
import { moderationReasonSchema, reportSchema } from "@/lib/validation";

export type PostState = { ok?: boolean; error?: string };

/** Weitere Feed-Einträge nachladen (unendliches Scrollen) */
export async function loadMoreFeed(before: string): Promise<FeedItem[]> {
  if (Number.isNaN(Date.parse(before))) return [];
  return getFeed(before);
}

/** Beitrag veröffentlichen. Die Fotos hat der Browser vorher in den eigenen Ordner geladen. */
export async function createPost(_prev: PostState, formData: FormData): Promise<PostState> {
  await requireProfile();
  const caption = String(formData.get("caption") ?? "").trim();
  const photos = String(formData.get("photos") ?? "")
    .split(",")
    .filter((x) => UUID_PATTERN.test(x));
  if (photos.length === 0) return { error: "photo_required" };
  if (photos.length > POST_PHOTOS_MAX) return { error: "too_many_photos" };
  if (caption.length > CAPTION_MAX) return { error: "caption_too_long" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_post", { p_caption: caption, p_photos: photos });
  if (error || !data) return { error: error ? mapDbError(error) : "generic" };
  revalidatePath("/", "layout");
  const locale = await getLocale();
  return redirect({ href: `/p/${data as string}`, locale });
}

export async function deletePost(_prev: PostState, formData: FormData): Promise<PostState> {
  const profile = await requireProfile();
  const id = String(formData.get("postId") ?? "");
  if (!UUID_PATTERN.test(id)) return { error: "generic" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_post", { p_id: id });
  if (error) return { error: mapDbError(error) };
  const ids = (data as string[] | null) ?? [];
  if (ids.length) {
    await supabase.storage.from(POST_BUCKET).remove(ids.flatMap((p) => [`${profile.id}/${p}.jpg`, `${profile.id}/${p}_t.jpg`]));
  }
  revalidatePath("/", "layout");
  const locale = await getLocale();
  return redirect({ href: "/profil", locale });
}

export async function toggleLike(postId: string): Promise<{ liked: boolean; like_count: number } | { error: string }> {
  await requireProfile();
  if (!UUID_PATTERN.test(postId)) return { error: "generic" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_like", { p_post: postId });
  if (error) return { error: mapDbError(error) };
  return data as { liked: boolean; like_count: number };
}

export async function addComment(_prev: PostState, formData: FormData): Promise<PostState> {
  await requireProfile();
  const postId = String(formData.get("postId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!UUID_PATTERN.test(postId)) return { error: "generic" };
  if (!body || body.length > COMMENT_MAX) return { error: "comment_invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_comment", { p_post: postId, p_body: body });
  if (error) return { error: mapDbError(error) };
  revalidatePath(`/p/${postId}`);
  return { ok: true };
}

export async function deleteComment(_prev: PostState, formData: FormData): Promise<PostState> {
  await requireProfile();
  const id = String(formData.get("commentId") ?? "");
  const postId = String(formData.get("postId") ?? "");
  if (!UUID_PATTERN.test(id)) return { error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_comment", { p_id: id });
  if (error) return { error: mapDbError(error) };
  if (UUID_PATTERN.test(postId)) revalidatePath(`/p/${postId}`);
  return { ok: true };
}

/** Beitrag oder Kommentar melden */
export async function reportPostOrComment(_prev: PostState, formData: FormData): Promise<PostState> {
  await requireProfile();
  const target = String(formData.get("target") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(id) || !["post", "comment"].includes(target)) return { error: "generic" };
  const parsed = reportSchema.safeParse({ reason: formData.get("reason"), details: formData.get("details") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "reason_required" };
  const supabase = await createClient();
  const { error } =
    target === "post"
      ? await supabase.rpc("report_post", { p_post: id, p_reason: parsed.data.reason, p_details: parsed.data.details ?? null })
      : await supabase.rpc("report_comment", { p_comment: id, p_reason: parsed.data.reason, p_details: parsed.data.details ?? null });
  if (error) return { error: mapDbError(error) };
  return { ok: true };
}

/** Team: Beitrag hervorheben oder zurücknehmen */
export async function highlightPost(_prev: PostState, formData: FormData): Promise<PostState> {
  await requireRole("team", "admin");
  const id = String(formData.get("postId") ?? "");
  const on = formData.get("on") === "1";
  if (!UUID_PATTERN.test(id)) return { error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_post_highlight", { p_id: id, p_on: on });
  if (error) return { error: mapDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Team: Beitrag ausblenden (mit Begründung) oder wieder einblenden */
export async function moderatePost(_prev: PostState, formData: FormData): Promise<PostState> {
  await requireRole("team", "admin");
  const id = String(formData.get("postId") ?? "");
  const hide = formData.get("action") !== "show";
  if (!UUID_PATTERN.test(id)) return { error: "generic" };
  let reason: string | null = null;
  if (hide) {
    const parsed = moderationReasonSchema.safeParse(String(formData.get("reason") ?? ""));
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "reason_required" };
    reason = parsed.data;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_post", { p_id: id, p_hide: hide, p_reason: reason });
  if (error) return { error: mapDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Team: gemeldeten Kommentar entfernen */
export async function moderateComment(_prev: PostState, formData: FormData): Promise<PostState> {
  await requireRole("team", "admin");
  const id = String(formData.get("commentId") ?? "");
  if (!UUID_PATTERN.test(id)) return { error: "generic" };
  const parsed = moderationReasonSchema.safeParse(String(formData.get("reason") ?? ""));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "reason_required" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_comment", { p_id: id, p_reason: parsed.data });
  if (error) return { error: mapDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}
