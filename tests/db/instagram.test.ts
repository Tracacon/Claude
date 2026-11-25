// Prüft die Übernahme von Instagram-Beiträgen in den Feed.
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, uid } from "./helpers";

let t: Awaited<ReturnType<typeof createDb>>;
const chef = uid(71);
const ana = uid(72);

async function service<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  await t.db.exec("set role service_role");
  try {
    return await t.db.query<T>(sql, params);
  } finally {
    await t.db.exec("reset role");
  }
}

type State = { author_id: string; known: string[]; token: string | null };
const state = async (nick: string | null = null) =>
  (await service<{ instagram_state: State }>("select public.instagram_state($1)", [nick])).rows[0].instagram_state;

beforeAll(async () => {
  t = await createDb();
  await t.member(chef, "Tracacon");
  await t.member(ana, "Ana");
  await t.db.query("update public.profiles set role = 'admin' where id = $1", [chef]);
});

describe("Instagram", () => {
  it("nur mit dem Server-Schlüssel", async () => {
    await expect(t.as(chef, "select public.instagram_state(null)")).rejects.toThrow(/permission denied/);
    await expect(t.as(chef, "select public.import_instagram_post('{}'::jsonb)")).rejects.toThrow(/permission denied/);
    await expect(t.as(null, "select public.instagram_sync_done('x')")).rejects.toThrow(/permission denied/);
  });

  it("Autor: angegebener Nickname, sonst erste Verwaltung", async () => {
    expect((await state()).author_id).toBe(chef);
    expect((await state("ana")).author_id).toBe(ana);
    expect((await state("gibtsnicht")).author_id).toBe(chef);
  });

  it("übernimmt Beitrag einmalig, für alle sichtbar, mit Link und Video-Kennzeichen", async () => {
    const post = {
      author_id: chef,
      external_id: "1789",
      external_url: "https://www.instagram.com/p/ABC/",
      caption: "Trade Night heute! #pokemon",
      created_at: "2026-11-20T18:00:00Z",
      is_video: true,
      photos: [uid(901), uid(902)],
    };
    const a = await service<{ import_instagram_post: string }>("select public.import_instagram_post($1::jsonb)", [JSON.stringify(post)]);
    const b = await service<{ import_instagram_post: string }>("select public.import_instagram_post($1::jsonb)", [
      JSON.stringify({ ...post, photos: [uid(903)] }),
    ]);
    expect(b.rows[0].import_instagram_post).toBe(a.rows[0].import_instagram_post);
    expect((await state()).known).toEqual(["1789"]);

    // Ana folgt Ana selbst nicht, sieht den Beitrag trotzdem (für alle)
    await t.as(ana, "select public.follow_user($1)", [chef]);
    await t.as(ana, "select public.unfollow_user($1)", [chef]);
    const feed = (await t.as<{ feed: { source: string; external_url: string; is_video: boolean; highlighted: boolean; photos: string[]; created_at: string }[] }>(
      ana,
      "select public.feed(null, 10)",
    )).rows[0].feed;
    expect(feed[0]).toMatchObject({
      source: "instagram",
      external_url: "https://www.instagram.com/p/ABC/",
      is_video: true,
      highlighted: false,
      photos: [uid(901), uid(902)],
    });
    expect(new Date(feed[0].created_at).toISOString()).toBe("2026-11-20T18:00:00.000Z");
  });

  it("ohne Fotos nicht", async () => {
    await expect(
      service("select public.import_instagram_post($1::jsonb)", [JSON.stringify({ author_id: chef, external_id: "x", photos: [] })]),
    ).rejects.toThrow(/photo_required/);
  });

  it("Stand speichern; Schlüssel nur für den Server, Status fürs Team", async () => {
    await service("select public.instagram_sync_done(null, 'neuer-schluessel')");
    expect((await state()).token).toBe("neuer-schluessel");
    await service("select public.instagram_sync_done('Fehler X')");
    expect((await state()).token).toBe("neuer-schluessel");
    const s = await t.as<{ instagram_sync_status: Record<string, unknown> }>(chef, "select public.instagram_sync_status()");
    expect(s.rows[0].instagram_sync_status).toMatchObject({ error: "Fehler X", imported_count: 1 });
    expect(s.rows[0].instagram_sync_status).not.toHaveProperty("token");
    await expect(t.as(ana, "select public.instagram_sync_status()")).rejects.toThrow(/forbidden/);
    await expect(t.as(chef, "select * from public.instagram_sync")).rejects.toThrow(/permission denied/);
  });
});
