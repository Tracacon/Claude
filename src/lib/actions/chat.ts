"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireProfile } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { UUID_PATTERN } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";
import { reportSchema } from "@/lib/validation";

export type ChatActionState = { ok?: boolean; error?: string };

/** Aus dem Inserat heraus: Unterhaltung beginnen oder bestehende öffnen. */
export async function startConversation(_prev: ChatActionState, formData: FormData): Promise<ChatActionState> {
  await requireProfile();
  const listingId = String(formData.get("listingId") ?? "");
  if (!UUID_PATTERN.test(listingId)) return { error: "generic" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_conversation", { p_listing_id: listingId });
  if (error || !data) return { error: error ? mapDbError(error) : "generic" };

  const locale = await getLocale();
  return redirect({ href: `/nachrichten/${data as string}`, locale });
}

export async function blockUser(_prev: ChatActionState, formData: FormData): Promise<ChatActionState> {
  await requireProfile();
  const userId = String(formData.get("userId") ?? "");
  const unblock = formData.get("unblock") === "1";
  if (!UUID_PATTERN.test(userId)) return { error: "generic" };

  const supabase = await createClient();
  const { error } = await supabase.rpc(unblock ? "unblock_user" : "block_user", { p_user_id: userId });
  if (error) return { error: mapDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function hideConversation(_prev: ChatActionState, formData: FormData): Promise<ChatActionState> {
  await requireProfile();
  const id = String(formData.get("conversationId") ?? "");
  if (!UUID_PATTERN.test(id)) return { error: "generic" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("hide_conversation", { p_conversation_id: id });
  if (error) return { error: mapDbError(error) };
  revalidatePath("/", "layout");
  const locale = await getLocale();
  return redirect({ href: "/nachrichten", locale });
}

export async function reportConversation(_prev: ChatActionState, formData: FormData): Promise<ChatActionState> {
  await requireProfile();
  const id = String(formData.get("conversationId") ?? "");
  if (!UUID_PATTERN.test(id)) return { error: "generic" };
  const parsed = reportSchema.safeParse({ reason: formData.get("reason") ?? "", details: String(formData.get("details") ?? "") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "generic" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("report_conversation", {
    p_conversation_id: id,
    p_reason: parsed.data.reason,
    p_details: parsed.data.details,
  });
  if (error) return { error: mapDbError(error) };
  return { ok: true };
}
