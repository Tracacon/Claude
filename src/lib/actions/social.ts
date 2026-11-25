"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { UUID_PATTERN } from "@/lib/marketplace";
import { AVATAR_BUCKET } from "@/lib/social";
import { pushNotify } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

export type SocialState = { ok?: boolean; error?: string; status?: string };

function uuid(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "");
  return UUID_PATTERN.test(v) ? v : null;
}

/** Folgen, entfolgen oder Anfrage zurückziehen (je nach Feld "intent"). */
export async function toggleFollow(_prev: SocialState, formData: FormData): Promise<SocialState> {
  await requireProfile();
  const target = uuid(formData, "userId");
  const intent = String(formData.get("intent") ?? "");
  if (!target || !["follow", "unfollow"].includes(intent)) return { error: "generic" };

  const supabase = await createClient();
  if (intent === "follow") {
    const { data, error } = await supabase.rpc("follow_user", { p_target: target });
    if (error) return { error: mapDbError(error) };
    pushNotify(target);
    revalidatePath("/", "layout");
    return { ok: true, status: String(data ?? "") };
  }
  const { error } = await supabase.rpc("unfollow_user", { p_target: target });
  if (error) return { error: mapDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, status: "none" };
}

export async function respondFollowRequest(_prev: SocialState, formData: FormData): Promise<SocialState> {
  await requireProfile();
  const follower = uuid(formData, "userId");
  if (!follower) return { error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_follow_request", {
    p_follower: follower,
    p_accept: formData.get("accept") === "1",
  });
  if (error) return { error: mapDbError(error) };
  if (formData.get("accept") === "1") pushNotify(follower);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeFollower(_prev: SocialState, formData: FormData): Promise<SocialState> {
  await requireProfile();
  const follower = uuid(formData, "userId");
  if (!follower) return { error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_follower", { p_follower: follower });
  if (error) return { error: mapDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updatePrivacy(_prev: SocialState, formData: FormData): Promise<SocialState> {
  await requireProfile();
  const visibility = String(formData.get("visibility") ?? "");
  if (!["public", "followers"].includes(visibility)) return { error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_privacy", {
    p_visibility: visibility,
    p_follow_approval: formData.get("approval") === "on",
  });
  if (error) return { error: mapDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Neues Profilbild übernehmen (Datei hat der Browser schon hochgeladen) oder entfernen. */
export async function setAvatar(_prev: SocialState, formData: FormData): Promise<SocialState> {
  const profile = await requireProfile();
  const remove = formData.get("remove") === "1";
  const avatarId = remove ? null : uuid(formData, "avatarId");
  if (!remove && !avatarId) return { error: "generic" };

  const supabase = await createClient();
  const { data: old, error } = await supabase.rpc("set_avatar", { p_avatar_id: avatarId });
  if (error) return { error: mapDbError(error) };
  if (old && old !== avatarId) {
    await supabase.storage.from(AVATAR_BUCKET).remove([`${profile.id}/${old as string}.jpg`]);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
