import "server-only";
import { after } from "next/server";
import { POST_BUCKET } from "@/lib/feed-shared";
import { hasServiceKey, serviceClient } from "@/lib/service";

/**
 * Übernimmt die Bildbeiträge des TRACACON-Instagram-Kontos als eigene Beiträge in den Feed
 * (Fotos und Text werden kopiert, ohne Verweis auf Instagram).
 * Offizielle Schnittstelle von Instagram (Instagram API mit Instagram-Anmeldung), nur lesend.
 * Zugangsschlüssel: Cloudflare-Geheimnis INSTAGRAM_TOKEN; verlängerte Schlüssel speichert die App selbst.
 */

const API = process.env.INSTAGRAM_API_URL ?? "https://graph.instagram.com";
/** Für Schlüssel aus der Facebook-Anmeldung (beginnen mit "EAA") */
const FB_API = process.env.INSTAGRAM_FB_API_URL ?? "https://graph.facebook.com";
const VERSION = "v23.0";
/** Höchstens so oft wird bei Instagram nachgesehen */
const FRESH_MINUTES = 30;
/** Neue Beiträge je Durchlauf (Cloudflare begrenzt die Zahl der Abrufe pro Anfrage) */
const MAX_NEW_PER_RUN = 3;
/** Schlüssel nach so vielen Tagen verlängern (gültig sind sie 60 Tage) */
const REFRESH_DAYS = 7;
const MAX_IMAGE_BYTES = 2_000_000;

type Media = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  children?: { data: { media_type: string; media_url?: string; thumbnail_url?: string }[] };
};

type State = { token: string | null; token_refreshed_at: string | null; synced_at: string | null; author_id: string | null; known: string[] };

export function isInstagramConfigured() {
  return hasServiceKey() && Boolean(process.env.INSTAGRAM_TOKEN);
}

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !data) {
    const err = (data?.error as { message?: string; code?: number } | undefined) ?? {};
    const msg = err.message ?? `Antwort ${res.status}`;
    throw new Error(err.code === 190 ? `Instagram-Schlüssel ungültig oder abgelaufen: ${msg}` : `Instagram: ${msg}`);
  }
  return data;
}

/** Nur Bildbeiträge: einzelne Fotos und die Fotos aus Karussells. Videos und Reels werden übersprungen. */
function imagesOf(m: Media): string[] {
  if (m.media_type === "IMAGE") return m.media_url ? [m.media_url] : [];
  if (m.media_type === "CAROUSEL_ALBUM") {
    return (m.children?.data ?? [])
      .filter((c) => c.media_type === "IMAGE" && c.media_url)
      .map((c) => c.media_url as string)
      .slice(0, 10);
  }
  return [];
}

export type InstagramResult = { ok: true; imported: number; pending: number } | { ok: false; error: string };

export async function syncInstagram(): Promise<InstagramResult> {
  if (!isInstagramConfigured()) return { ok: false, error: "instagram_not_configured" };
  const db = serviceClient();
  let newToken: string | null = null;
  try {
    const { data: stateData, error: stateErr } = await db.rpc("instagram_state", { p_author_nickname: process.env.INSTAGRAM_AUTHOR ?? null });
    if (stateErr) throw new Error(`Datenbank: ${stateErr.message}`);
    const state = stateData as State;
    if (!state.author_id) throw new Error("Kein Profil für die Instagram-Beiträge gefunden (INSTAGRAM_AUTHOR)");
    let token = state.token ?? (process.env.INSTAGRAM_TOKEN as string);

    // Meta gibt je nach Einrichtung zwei Arten von Schlüsseln aus:
    // Instagram-Schlüssel (graph.instagram.com, 60 Tage, verlängerbar) oder
    // Facebook-Schlüssel "EAA…" (graph.facebook.com, braucht die Instagram-Konto-ID, verlängert sich nicht hier).
    const facebook = token.startsWith("EAA");
    const igUserId = process.env.INSTAGRAM_USER_ID ?? "";
    if (facebook && !/^\d+$/.test(igUserId)) throw new Error("INSTAGRAM_USER_ID fehlt für den Facebook-Schlüssel");

    // Instagram-Schlüssel regelmäßig verlängern, damit er nicht nach 60 Tagen abläuft
    const age = state.token_refreshed_at ? Date.now() - new Date(state.token_refreshed_at).getTime() : Infinity;
    if (!facebook && age > REFRESH_DAYS * 86400_000) {
      try {
        const r = await getJson(`${API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
        if (typeof r.access_token === "string") {
          token = r.access_token;
          newToken = token;
        }
      } catch (e) {
        // Ein ganz neuer Schlüssel lässt sich erst nach 24 Stunden verlängern
        console.warn("Instagram-Schlüssel nicht verlängert", e instanceof Error ? e.message : e);
      }
    }

    const fields = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}";
    const base = facebook ? `${FB_API}/${VERSION}/${igUserId}` : `${API}/${VERSION}/me`;
    const list = await getJson(`${base}/media?fields=${encodeURIComponent(fields)}&limit=30&access_token=${encodeURIComponent(token)}`);
    const media = ((list.data as Media[]) ?? []).filter((m) => !state.known.includes(m.id) && imagesOf(m).length > 0);

    let imported = 0;
    for (const m of media.slice(0, MAX_NEW_PER_RUN)) {
      const urls = imagesOf(m);
      if (urls.length === 0) continue;
      const photoIds: string[] = [];
      for (const url of urls) {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        const type = res.headers.get("content-type") ?? "";
        if (!res.ok || !type.startsWith("image/")) continue;
        const buf = await res.arrayBuffer();
        if (buf.byteLength > MAX_IMAGE_BYTES) continue;
        const id = crypto.randomUUID();
        const opts = { contentType: "image/jpeg", cacheControl: "31536000", upsert: false };
        const store = db.storage.from(POST_BUCKET);
        const [a, b] = await Promise.all([
          store.upload(`${state.author_id}/${id}.jpg`, buf, opts),
          store.upload(`${state.author_id}/${id}_t.jpg`, buf, opts),
        ]);
        if (a.error || b.error) throw new Error(`Speicher: ${(a.error ?? b.error)!.message}`);
        photoIds.push(id);
      }
      if (photoIds.length === 0) continue;
      const { error } = await db.rpc("import_instagram_post", {
        p: {
          author_id: state.author_id,
          external_id: m.id,
          external_url: m.permalink ?? null,
          caption: m.caption ?? "",
          created_at: m.timestamp ? m.timestamp.replace(/\+0000$/, "Z") : null,
          is_video: false,
          photos: photoIds,
        },
      });
      if (error) throw new Error(`Datenbank: ${error.message}`);
      imported++;
    }

    await db.rpc("instagram_sync_done", { p_error: null, p_token: newToken });
    return { ok: true, imported, pending: Math.max(0, media.length - MAX_NEW_PER_RUN) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Instagram-Abgleich", message);
    await db.rpc("instagram_sync_done", { p_error: message, p_token: newToken });
    return { ok: false, error: /Schlüssel ungültig/.test(message) ? "instagram_token" : "instagram_failed" };
  }
}

/** Beim Aufruf des Feeds: höchstens alle 30 Minuten im Hintergrund bei Instagram nachsehen */
export async function ensureInstagramFresh() {
  if (!isInstagramConfigured()) return;
  const { data } = await serviceClient().rpc("instagram_state", { p_author_nickname: null });
  const syncedAt = (data as State | null)?.synced_at;
  if (syncedAt && Date.now() - new Date(syncedAt).getTime() < FRESH_MINUTES * 60_000) return;
  after(async () => {
    await syncInstagram();
  });
}
