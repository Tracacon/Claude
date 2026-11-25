// Prüft den Feed: Beiträge, Sichtbarkeit, Gefällt mir, Kommentare, Melden, Hervorheben, Ausblenden.
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, uid } from "./helpers";

let t: Awaited<ReturnType<typeof createDb>>;
const ana = uid(61);
const ben = uid(62);
const cem = uid(63); // privates Profil
const tom = uid(64); // Team
const dan = uid(65); // folgt niemandem
let n = 500;

type Item = { type: string; id: string; caption?: string; title?: string; like_count?: number; liked?: boolean; highlighted?: boolean };

async function upload(user: string) {
  const id = uid(n++);
  await t.as(user, "insert into storage.objects (bucket_id, name, owner) values ('post-photos', $1, auth.uid())", [`${user}/${id}.jpg`]);
  return id;
}

async function post(user: string, caption: string, photos = 1) {
  const ids = [];
  for (let i = 0; i < photos; i++) ids.push(await upload(user));
  const r = await t.as<{ create_post: string }>(user, "select public.create_post($1, $2::uuid[])", [caption, ids]);
  return r.rows[0].create_post;
}

async function feed(user: string | null, before: string | null = null, limit = 30) {
  const r = await t.as<{ feed: (Item & { sort_at: string })[] }>(user, "select public.feed($1, $2)", [before, limit]);
  return r.rows[0].feed;
}

const captions = (items: Item[]) => items.filter((i) => i.type === "post").map((i) => i.caption);

beforeAll(async () => {
  t = await createDb();
  for (const [id, nick] of [[ana, "Ana"], [ben, "Ben"], [cem, "Cem"], [tom, "Tom"], [dan, "Dan"]] as const) await t.member(id, nick);
  await t.db.query("update public.profiles set role = 'team' where id = $1", [tom]);
  await t.as(cem, "select public.update_privacy('followers', true)");
});

describe("Beiträge anlegen", () => {
  it("braucht Fotos, die wirklich im eigenen Ordner liegen", async () => {
    await expect(t.as(ana, "select public.create_post('ohne', '{}'::uuid[])")).rejects.toThrow(/photo_required/);
    await expect(t.as(ana, "select public.create_post('fremd', $1::uuid[])", [[uid(999)]])).rejects.toThrow(/photo_missing/);
    const bens = await upload(ben);
    await expect(t.as(ana, "select public.create_post('geklaut', $1::uuid[])", [[bens]])).rejects.toThrow(/photo_missing/);
    const many = Array.from({ length: 11 }, (_, i) => uid(800 + i));
    await expect(t.as(ana, "select public.create_post('zu viele', $1::uuid[])", [many])).rejects.toThrow(/too_many_photos/);
    await expect(t.as(null, "select public.create_post('x', '{}'::uuid[])")).rejects.toThrow(/permission denied/);
  });

  it("legt Beitrag mit mehreren Fotos an; Fotos lassen sich nicht doppelt verwenden", async () => {
    const id = await post(ana, "Mein Glurak-Binder 🔥", 3);
    const r = await t.as<{ get_post: { photos: string[]; author: { nickname: string } } }>(null, "select public.get_post($1)", [id]);
    expect(r.rows[0].get_post.photos).toHaveLength(3);
    expect(r.rows[0].get_post.author.nickname).toBe("Ana");
    await expect(
      t.as(ana, "select public.create_post('nochmal', $1::uuid[])", [r.rows[0].get_post.photos.slice(0, 1)]),
    ).rejects.toThrow(/photo_missing/);
  });

  it("Text bearbeiten und löschen nur selbst", async () => {
    const id = await post(ana, "Tippfeler");
    await expect(t.as(ben, "select public.update_post($1, 'Hack')", [id])).rejects.toThrow(/not_found/);
    await t.as(ana, "select public.update_post($1, 'Tippfehler')", [id]);
    await expect(t.as(ben, "select public.delete_post($1)", [id])).rejects.toThrow(/not_found/);
    const del = await t.as<{ delete_post: string[] }>(ana, "select public.delete_post($1)", [id]);
    expect(del.rows[0].delete_post).toHaveLength(1);
  });
});

describe("Feed", () => {
  it("ohne Folgen: öffentliche Beiträge und neue Inserate; private Profile nicht", async () => {
    await post(ben, "Bens Booster");
    await post(cem, "Cems geheime Sammlung");
    await t.as(ben, "select public.create_listing($1::jsonb)", [
      JSON.stringify({ title: "Bens Display", tcg: "pokemon", kind: "sealed", offer: "sell", price_cents: 12000, handover_event: true }),
    ]);
    const anon = await feed(null);
    expect(captions(anon)).toEqual(expect.arrayContaining(["Mein Glurak-Binder 🔥", "Bens Booster"]));
    expect(captions(anon)).not.toContain("Cems geheime Sammlung");
    expect(anon.some((i) => i.type === "listing" && i.title === "Bens Display")).toBe(true);
    const d = await feed(dan);
    expect(captions(d)).not.toContain("Cems geheime Sammlung");
  });

  it("mit Folgen: nur Gefolgte, Eigene und Hervorgehobene; Inserate nur von Gefolgten", async () => {
    // Ana folgt Cem (Anfrage), Cem nimmt an
    await t.as(ana, "select public.follow_user($1)", [cem]);
    await t.as(cem, "select public.respond_follow_request($1, true)", [ana]);
    const f = await feed(ana);
    expect(captions(f).sort()).toEqual(["Cems geheime Sammlung", "Mein Glurak-Binder 🔥"]);
    expect(f.some((i) => i.type === "listing")).toBe(false);

    await t.as(ana, "select public.follow_user($1)", [ben]);
    const f2 = await feed(ana);
    expect(captions(f2)).toContain("Bens Booster");
    expect(f2.some((i) => i.type === "listing" && i.title === "Bens Display")).toBe(true);
  });

  it("Hervorgehobenes erscheint bei allen und steht oben", async () => {
    const dans = await post(dan, "Dans Lieblingskarte");
    expect(captions(await feed(ana))).not.toContain("Dans Lieblingskarte");
    await expect(t.as(ana, "select public.set_post_highlight($1, true)", [dans])).rejects.toThrow(/forbidden/);
    await t.as(tom, "select public.set_post_highlight($1, true)", [dans]);
    const f = await feed(ana);
    expect(f[0]).toMatchObject({ caption: "Dans Lieblingskarte", highlighted: true });
  });

  it("weiterblättern ohne Doppelte", async () => {
    for (let i = 0; i < 5; i++) await post(ben, `Ben Nr. ${i}`);
    const first = await feed(ana, null, 4);
    const second = await feed(ana, first[first.length - 1].sort_at, 4);
    const ids = [...first, ...second].map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(second.length).toBeGreaterThan(0);
  });

  it("Blockierte sieht man nicht", async () => {
    await t.as(ana, "select public.block_user($1)", [dan]);
    expect(captions(await feed(ana))).not.toContain("Dans Lieblingskarte");
    await t.as(ana, "select public.unblock_user($1)", [dan]);
  });
});

describe("Gefällt mir und Kommentare", () => {
  let p: string;
  let cemPost: string;

  beforeAll(async () => {
    p = (await feed(null)).find((i) => i.caption === "Bens Booster")!.id;
    cemPost = (await feed(ana)).find((i) => i.caption === "Cems geheime Sammlung")!.id;
  });

  it("Gefällt mir an und aus", async () => {
    const on = await t.as<{ toggle_like: { liked: boolean; like_count: number } }>(ana, "select public.toggle_like($1)", [p]);
    expect(on.rows[0].toggle_like).toEqual({ liked: true, like_count: 1 });
    await t.as(dan, "select public.toggle_like($1)", [p]);
    const item = (await t.as<{ get_post: Item }>(ana, "select public.get_post($1)", [p])).rows[0].get_post;
    expect(item).toMatchObject({ like_count: 2, liked: true });
    const off = await t.as<{ toggle_like: { liked: boolean; like_count: number } }>(ana, "select public.toggle_like($1)", [p]);
    expect(off.rows[0].toggle_like).toEqual({ liked: false, like_count: 1 });
    await expect(t.as(null, "select public.toggle_like($1)", [p])).rejects.toThrow(/permission denied/);
  });

  it("private Beiträge nur für Follower", async () => {
    await expect(t.as(dan, "select public.toggle_like($1)", [cemPost])).rejects.toThrow(/not_found/);
    await expect(t.as(dan, "select public.add_comment($1, 'hallo')", [cemPost])).rejects.toThrow(/not_found/);
    expect((await t.as<{ get_post: null }>(dan, "select public.get_post($1)", [cemPost])).rows[0].get_post).toBeNull();
    await t.as(ana, "select public.toggle_like($1)", [cemPost]);
  });

  it("kommentieren, löschen durch Verfasser, Beitragsinhaber oder Team", async () => {
    const c1 = (await t.as<{ add_comment: string }>(dan, "select public.add_comment($1, '  Toller Booster!  ')", [p])).rows[0].add_comment;
    const c2 = (await t.as<{ add_comment: string }>(ana, "select public.add_comment($1, 'Tauschst du?')", [p])).rows[0].add_comment;
    const c3 = (await t.as<{ add_comment: string }>(ana, "select public.add_comment($1, 'Noch was')", [p])).rows[0].add_comment;
    await expect(t.as(dan, "select public.add_comment($1, '   ')", [p])).rejects.toThrow(/comment_invalid/);

    const list = await t.as<{ body: string; author_nickname: string; can_delete: boolean }>(dan, "select * from public.post_comments($1)", [p]);
    expect(list.rows.map((r) => [r.author_nickname, r.body, r.can_delete])).toEqual([
      ["Dan", "Toller Booster!", true],
      ["Ana", "Tauschst du?", false],
      ["Ana", "Noch was", false],
    ]);
    await expect(t.as(dan, "select public.delete_comment($1)", [c2])).rejects.toThrow(/not_found/);
    await t.as(ben, "select public.delete_comment($1)", [c2]); // Beitragsinhaber
    await t.as(dan, "select public.delete_comment($1)", [c1]); // Verfasser
    await t.as(tom, "select public.delete_comment($1)", [c3]); // Team
    expect((await t.as(null, "select * from public.post_comments($1)", [p])).rows).toHaveLength(0);
  });

  it("Blockiert: kein Kommentar", async () => {
    await t.as(ben, "select public.block_user($1)", [dan]);
    await expect(t.as(dan, "select public.add_comment($1, 'hi')", [p])).rejects.toThrow(/not_found|blocked/);
    await t.as(ben, "select public.unblock_user($1)", [dan]);
  });
});

describe("Melden und Moderation", () => {
  it("Beitrag melden, Team blendet aus, Meldung erledigt", async () => {
    const p = (await feed(null)).find((i) => i.caption === "Bens Booster")!.id;
    await t.as(dan, "select public.report_post($1, 'scam', 'Fake')", [p]);
    await expect(t.as(dan, "select public.report_post($1, 'scam', 'nochmal')", [p])).rejects.toThrow(/already_reported/);
    const open = await t.as<{ post_id: string; post_author_nickname: string }>(tom, "select * from public.list_open_reports() where post_id is not null");
    expect(open.rows[0]).toMatchObject({ post_id: p, post_author_nickname: "Ben" });

    await expect(t.as(tom, "select public.moderate_post($1, true, '')", [p])).rejects.toThrow(/reason_required/);
    await t.as(tom, "select public.moderate_post($1, true, 'Betrugsverdacht')", [p]);
    expect(captions(await feed(null))).not.toContain("Bens Booster");
    expect((await t.as<{ get_post: Item | null }>(dan, "select public.get_post($1)", [p])).rows[0].get_post).toBeNull();
    // Verfasser sieht ihn noch (ausgeblendet), kann aber keine Likes mehr bekommen
    expect((await t.as<{ get_post: { hidden: boolean } }>(ben, "select public.get_post($1)", [p])).rows[0].get_post.hidden).toBe(true);
    await expect(t.as(ben, "select public.toggle_like($1)", [p])).rejects.toThrow(/not_found/);
    expect((await t.as(tom, "select * from public.list_open_reports() where post_id = $1", [p])).rows).toHaveLength(0);
    await t.as(tom, "select public.moderate_post($1, false, null)", [p]);
    expect(captions(await feed(null))).toContain("Bens Booster");
  });

  it("Kommentar melden und durch Team entfernen; Nachweis bleibt", async () => {
    const p = (await feed(null)).find((i) => i.caption === "Bens Booster")!.id;
    const c = (await t.as<{ add_comment: string }>(dan, "select public.add_comment($1, 'Beleidigung')", [p])).rows[0].add_comment;
    await t.as(ana, "select public.report_comment($1, 'offensive', null)", [c]);
    const open = await t.as<{ comment_body: string; comment_author_nickname: string }>(
      tom,
      "select * from public.list_open_reports() where comment_id = $1",
      [c],
    );
    expect(open.rows[0]).toMatchObject({ comment_body: "Beleidigung", comment_author_nickname: "Dan" });
    await t.as(tom, "select public.moderate_comment($1, 'Beleidigung entfernt')", [c]);
    expect((await t.as(null, "select * from public.post_comments($1)", [p])).rows).toHaveLength(0);
    const kept = await t.db.query<{ status: string; details: string }>("select status, details from public.reports where post_id = $1 and reason = 'offensive'", [p]);
    expect(kept.rows[0].status).toBe("resolved");
    expect(kept.rows[0].details).toContain("Beleidigung");
  });
});

describe("Profil, Entdecken, Suche", () => {
  it("Profilraster und Zahl der Beiträge", async () => {
    const grid = await t.as<{ photo_count: string }>(null, "select * from public.profile_posts('Ana')");
    expect(grid.rows.length).toBe(1);
    expect(Number(grid.rows[0].photo_count)).toBe(3);
    const prof = await t.as<{ get_profile: { post_count: number } }>(null, "select public.get_profile('Ben')");
    expect(prof.rows[0].get_profile.post_count).toBe(6);
    expect((await t.as(dan, "select * from public.profile_posts('Cem')")).rows).toHaveLength(0);
    expect((await t.as(ana, "select * from public.profile_posts('Cem')")).rows).toHaveLength(1);
  });

  it("Entdecken: Hervorgehobene zuerst, private nicht", async () => {
    const r = await t.as<{ id: string }>(null, "select * from public.explore_posts()");
    const first = (await t.as<{ get_post: { caption: string } }>(null, "select public.get_post($1)", [r.rows[0].id])).rows[0].get_post;
    expect(first.caption).toBe("Dans Lieblingskarte");
    const all = await Promise.all(
      r.rows.map(async (x) => (await t.as<{ get_post: { caption: string } | null }>(null, "select public.get_post($1)", [x.id])).rows[0].get_post?.caption),
    );
    expect(all).not.toContain("Cems geheime Sammlung");
  });

  it("Personen suchen", async () => {
    const r = await t.as<{ nickname: string; avatar_id: string | null }>(null, "select * from public.search_profiles('e')");
    expect(r.rows.map((x) => x.nickname)).toEqual(["Ben", "Cem"]);
    expect((await t.as(null, "select * from public.search_profiles('%')")).rows).toHaveLength(0);
    expect((await t.as<{ nickname: string }>(null, "select * from public.search_profiles('to')")).rows[0].nickname).toBe("Tom");
  });

  it("Konto löschen entfernt Beiträge, Likes und Kommentare", async () => {
    await t.as(ana, "select public.delete_own_account()");
    expect((await t.db.query("select * from public.posts where author_id = $1", [ana])).rows).toHaveLength(0);
    expect((await t.db.query("select * from public.post_likes where user_id = $1", [ana])).rows).toHaveLength(0);
  });

  it("Tabellen sind nicht direkt lesbar", async () => {
    await expect(t.as(ben, "select * from public.posts")).rejects.toThrow(/permission denied/);
    await expect(t.as(ben, "select public.post_item($1)", [uid(1)])).rejects.toThrow(/permission denied/);
  });
});
