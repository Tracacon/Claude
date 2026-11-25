import "server-only";
import { after } from "next/server";
import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import { getTranslations } from "next-intl/server";
import { VAPID_PUBLIC_KEY } from "@/lib/push-shared";
import { hasServiceKey, serviceClient } from "@/lib/service";

/**
 * Mitteilungen aufs Handy (Web Push). Der geheime Schlüssel liegt als Cloudflare-Geheimnis VAPID_PRIVATE_KEY.
 * Fehlt er, passiert einfach nichts – die Benachrichtigungen in der App funktionieren trotzdem.
 */

type Sub = { endpoint: string; p256dh: string; auth: string };
type Item = { kind: "follow" | "follow_request" | "follow_accepted" | "like" | "comment"; actor: string; post_id: string | null; comment: string | null };
type Message = { title: string; body: string; url: string; tag: string };

export function isPushConfigured() {
  return hasServiceKey() && Boolean(process.env.VAPID_PRIVATE_KEY);
}

function vapid() {
  return {
    subject: process.env.VAPID_SUBJECT ?? "https://tracacon.de",
    publicKey: VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY as string,
  };
}

async function deliver(subs: Sub[], messages: Message[]) {
  const db = serviceClient();
  for (const s of subs) {
    const subscription: PushSubscription = { endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } };
    for (const m of messages) {
      try {
        const payload = await buildPushPayload({ data: JSON.stringify(m), options: { ttl: 60 * 60 * 24, urgency: "normal", topic: m.tag.slice(0, 32) } }, subscription, vapid());
        const res = await fetch(s.endpoint, { ...payload, signal: AbortSignal.timeout(10_000) });
        if (res.status === 404 || res.status === 410) {
          // Gerät gibt es nicht mehr (z. B. App gelöscht)
          await db.rpc("drop_push_subscription", { p_endpoint: s.endpoint });
          break;
        }
        if (!res.ok) console.warn("Push", res.status, new URL(s.endpoint).host);
      } catch (e) {
        console.warn("Push fehlgeschlagen", e instanceof Error ? e.message : e);
      }
    }
  }
}

async function messagesFor(items: Item[], locale: string): Promise<Message[]> {
  const t = await getTranslations({ locale: locale === "en" ? "en" : "de", namespace: "Push" });
  if (items.length > 3) {
    return [{ title: t("title"), body: t("many", { count: items.length }), url: "/aktivitaet", tag: "aktivitaet" }];
  }
  return items.map((i) => {
    const url = i.post_id ? `/p/${i.post_id}${i.kind === "comment" ? "#kommentare" : ""}` : i.kind === "follow_request" ? "/aktivitaet" : `/u/${i.actor}`;
    const body =
      i.kind === "follow" ? t("follow", { nickname: i.actor })
      : i.kind === "follow_request" ? t("followRequest", { nickname: i.actor })
      : i.kind === "follow_accepted" ? t("followAccepted", { nickname: i.actor })
      : i.kind === "like" ? t("like", { nickname: i.actor })
      : t("comment", { nickname: i.actor, text: i.comment ?? "" });
    return { title: t("title"), body, url, tag: `${i.kind}-${i.actor}` };
  });
}

async function sendTo(ids: string[]) {
  const db = serviceClient();
  for (const id of ids) {
    const { data, error } = await db.rpc("claim_push", { p_user: id });
    if (error) {
      console.error("claim_push", error.message);
      continue;
    }
    const r = data as { items: Item[]; subscriptions: Sub[]; locale: string | null };
    if (r.items.length === 0 || r.subscriptions.length === 0) continue;
    await deliver(r.subscriptions, await messagesFor(r.items, r.locale ?? "de"));
  }
}

/** Neue Benachrichtigungen dieser Personen aufs Handy schicken – im Hintergrund, nach der Antwort. */
export function pushNotify(...userIds: (string | null | undefined)[]) {
  if (!isPushConfigured()) return;
  const ids = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
  if (ids.length > 0) after(() => sendTo(ids));
}

/** Test-Mitteilung an die eigenen Geräte. Gibt die Zahl der Geräte zurück. */
export async function pushTest(userId: string): Promise<number> {
  if (!isPushConfigured()) return -1;
  const { data, error } = await serviceClient().rpc("push_targets", { p_user: userId });
  if (error) throw new Error(error.message);
  const r = data as { subscriptions: Sub[]; locale: string | null };
  const t = await getTranslations({ locale: r.locale === "en" ? "en" : "de", namespace: "Push" });
  await deliver(r.subscriptions, [{ title: t("title"), body: t("test"), url: "/aktivitaet", tag: "test" }]);
  return r.subscriptions.length;
}

/** Nach Like oder Kommentar: die Person benachrichtigen, der der Beitrag gehört. */
export function pushNotifyPostAuthor(postId: string) {
  if (!isPushConfigured()) return;
  after(async () => {
    const { data } = await serviceClient().from("posts").select("author_id").eq("id", postId).maybeSingle<{ author_id: string }>();
    if (data?.author_id) await sendTo([data.author_id]);
  });
}
