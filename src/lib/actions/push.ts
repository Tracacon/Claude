"use server";

import { requireProfile } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { isPushConfigured, pushTest } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

export type PushResult = { ok?: boolean; error?: string; devices?: number };

const B64URL = /^[A-Za-z0-9_-]+=*$/;

/** Dieses Gerät für Mitteilungen anmelden (Daten kommen vom Browser) */
export async function subscribePush(sub: { endpoint: string; p256dh: string; auth: string }): Promise<PushResult> {
  await requireProfile();
  if (!isPushConfigured()) return { error: "push_not_configured" };
  const endpoint = String(sub?.endpoint ?? "");
  if (!endpoint.startsWith("https://") || endpoint.length > 1000 || !B64URL.test(sub.p256dh) || !B64URL.test(sub.auth)) {
    return { error: "generic" };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_push_subscription", { p_endpoint: endpoint, p_p256dh: sub.p256dh, p_auth: sub.auth });
  if (error) return { error: mapDbError(error) };
  return { ok: true };
}

/** Dieses Gerät abmelden */
export async function unsubscribePush(endpoint: string): Promise<PushResult> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_push_subscription", { p_endpoint: String(endpoint ?? "") });
  if (error) return { error: mapDbError(error) };
  return { ok: true };
}

/** Test-Mitteilung an alle eigenen Geräte */
export async function sendTestPush(): Promise<PushResult> {
  const profile = await requireProfile();
  try {
    const devices = await pushTest(profile.id);
    if (devices < 0) return { error: "push_not_configured" };
    return { ok: true, devices };
  } catch (e) {
    console.error("Test-Mitteilung", e instanceof Error ? e.message : e);
    return { error: "generic" };
  }
}

/** Ist der Versand eingerichtet (geheimer Schlüssel bei Cloudflare hinterlegt)? */
export async function pushAvailable(): Promise<boolean> {
  return isPushConfigured();
}
