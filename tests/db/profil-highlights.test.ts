// Profil wie Instagram: zweiter Link, "Gefolgt von", Direktnachrichten, Highlights
// (Migration 20261128030000_profil_highlights.sql).
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, uid } from "./helpers";

let t: Awaited<ReturnType<typeof createDb>>;
const ana = uid(101);
const ben = uid(102);
const cem = uid(103);
const dan = uid(104);

type Profile = { website2: string | null; followed_by: { nickname: string }[]; followed_by_count: number };
async function profile(viewer: string | null, nick: string) {
  const r = await t.as<{ get_profile: Profile }>(viewer, "select public.get_profile($1)", [nick]);
  return r.rows[0].get_profile;
}

beforeAll(async () => {
  t = await createDb();
  await t.member(ana, "Ana");
  await t.member(ben, "Ben");
  await t.member(cem, "Cem");
  await t.member(dan, "Dan");
});

describe("Profil wie Instagram", () => {
  it("speichert einen zweiten Link", async () => {
    await t.as(ana, "update public.profiles set website2 = 'https://tracacon.de/shop' where id = $1", [ana]);
    expect((await profile(null, "Ana")).website2).toBe("https://tracacon.de/shop");
    await expect(t.as(ana, "update public.profiles set website2 = 'javascript:alert(1)' where id = $1", [ana])).rejects.toThrow();
  });

  it("zeigt, wer von meinen Kontakten der Person folgt", async () => {
    await t.as(ben, "select public.follow_user($1)", [cem]); // Ben folgt Cem
    await t.as(dan, "select public.follow_user($1)", [cem]); // Dan folgt Cem
    await t.as(ana, "select public.follow_user($1)", [ben]); // Ana folgt Ben
    await t.as(ana, "select public.follow_user($1)", [dan]); // Ana folgt Dan
    const p = await profile(ana, "Cem");
    expect(p.followed_by.map((x) => x.nickname).sort()).toEqual(["Ben", "Dan"]);
    expect(p.followed_by_count).toBe(2);
    expect((await profile(null, "Cem")).followed_by).toEqual([]);
  });

  it("startet Direktnachrichten ohne Inserat, nur einmal je Paar", async () => {
    const a = (await t.as<{ id: string }>(ana, "select public.start_direct_conversation($1) as id", [ben])).rows[0].id;
    const b = (await t.as<{ id: string }>(ben, "select public.start_direct_conversation($1) as id", [ana])).rows[0].id;
    expect(b).toBe(a);
    await t.as(ana, "select public.send_message($1, 'Hallo Ben', null)", [a]);
    const list = await t.as<{ listing_title: string; other_nickname: string }>(ben, "select listing_title, other_nickname from public.list_conversations()");
    expect(list.rows).toContainEqual({ listing_title: "", other_nickname: "Ana" });
    await expect(t.as(ana, "select public.start_direct_conversation($1)", [ana])).rejects.toThrow(/cannot_message_self/);
    await t.as(cem, "select public.block_user($1)", [ana]);
    await expect(t.as(ana, "select public.start_direct_conversation($1)", [cem])).rejects.toThrow(/blocked/);
  });

  it("Highlights: nur eigene Binder, Sichtbarkeit wie der Binder", async () => {
    const pub = (await t.as<{ id: string }>(ana, "select public.save_binder(null, 'Pokémon 151', 'red', 'public') as id")).rows[0].id;
    const priv = (await t.as<{ id: string }>(ana, "select public.save_binder(null, 'Geheim', 'black', 'private') as id")).rows[0].id;
    await t.as(ana, "select public.save_highlight($1, '151')", [pub]);
    await t.as(ana, "select public.save_highlight($1, '')", [priv]);
    await expect(t.as(ben, "select public.save_highlight($1, 'Fremd')", [pub])).rejects.toThrow(/not_found/);
    const seen = async (v: string | null) =>
      (await t.as<{ title: string }>(v, "select title from public.profile_highlights('Ana')")).rows.map((x) => x.title);
    expect(await seen(null)).toEqual(["151"]);
    expect(await seen(ana)).toEqual(["151", "Geheim"]);
    await t.as(ana, "select public.save_highlight($1, 'Kanto')", [pub]);
    expect(await seen(null)).toEqual(["Kanto"]);
    await t.as(ana, "delete from public.profile_highlights where binder_id = $1", [pub]);
    expect(await seen(null)).toEqual([]);
  });
});
