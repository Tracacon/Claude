// Sammelkartenbinder (Migration 20261127230000_binder.sql).
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, uid } from "./helpers";

let t: Awaited<ReturnType<typeof createDb>>;
const ana = uid(91);
const ben = uid(92); // folgt Ana
const cem = uid(93); // folgt niemandem
let n = 1;
const photo = () => `50000000-0000-0000-0000-${(n++).toString(16).padStart(12, "0")}`;

async function card(user: string, title: string) {
  const r = await t.as<{ create_listing: string }>(user, "select public.create_listing($1::jsonb)", [
    JSON.stringify({ title, tcg: "pokemon", kind: "single", offer: "trade", handover_event: true, status: "collection", photos: [photo(), photo()] }),
  ]);
  return r.rows[0].create_listing;
}
async function binder(user: string, name: string, visibility = "public") {
  const r = await t.as<{ save_binder: string }>(user, "select public.save_binder(null, $1, 'red', $2)", [name, visibility]);
  return r.rows[0].save_binder;
}
const put = (user: string, l: string, b: string | null, pocket: number | null = null) =>
  t.as<{ set_listing_binder: number | null }>(user, "select public.set_listing_binder($1, $2, $3)", [l, b, pocket]);
async function pockets(viewer: string | null, b: string) {
  const r = await t.as<{ title: string; pocket: number }>(viewer, "select title, pocket from public.profile_collection('Ana') where binder_id = $1 order by pocket", [b]);
  return r.rows.map((x) => [x.title, x.pocket]);
}
async function binders(viewer: string | null) {
  const r = await t.as<{ name: string; card_count: string }>(viewer, "select name, card_count from public.profile_binders('Ana')");
  return r.rows.map((x) => [x.name, Number(x.card_count)]);
}

beforeAll(async () => {
  t = await createDb();
  await t.member(ana, "Ana");
  await t.member(ben, "Ben");
  await t.member(cem, "Cem");
  await t.as(ben, "select public.follow_user($1)", [ana]);
});

describe("Binder", () => {
  let main: string;
  let a: string, b: string, c: string;

  it("legt Karten in das erste freie Fach", async () => {
    main = await binder(ana, "Pokémon 151");
    a = await card(ana, "Bisasam");
    b = await card(ana, "Glumanda");
    c = await card(ana, "Schiggy");
    expect((await put(ana, a, main)).rows[0].set_listing_binder).toBe(0);
    expect((await put(ana, b, main, 4)).rows[0].set_listing_binder).toBe(4);
    expect((await put(ana, c, main)).rows[0].set_listing_binder).toBe(1);
    expect(await pockets(null, main)).toEqual([["Bisasam", 0], ["Schiggy", 1], ["Glumanda", 4]]);
  });

  it("tauscht beim Umsortieren zwei Karten", async () => {
    await t.as(ana, "select public.move_listing_pocket($1, 4)", [a]);
    expect(await pockets(null, main)).toEqual([["Schiggy", 1], ["Bisasam", 4], ["Glumanda", 0]].sort((x, y) => (x[1] as number) - (y[1] as number)));
    await t.as(ana, "select public.move_listing_pocket($1, 20)", [c]); // leeres Fach auf Seite 3
    expect((await pockets(null, main)).find((x) => x[0] === "Schiggy")).toEqual(["Schiggy", 20]);
  });

  it("verbietet fremde Binder und belegte Fächer", async () => {
    const foreign = await binder(ben, "Bens Binder");
    await expect(put(ana, a, foreign)).rejects.toThrow(/not_found/);
    await expect(put(ben, a, foreign)).rejects.toThrow(/not_found/);
    await expect(put(ana, c, main, 4)).rejects.toThrow(/pocket_taken/);
    await expect(t.as(ben, "select public.move_listing_pocket($1, 7)", [a])).rejects.toThrow(/not_found/);
    await expect(t.as(ana, "update public.listings set binder_id = null where id = $1", [a])).rejects.toThrow(/permission denied/);
  });

  it("zeigt Binder je nach Sichtbarkeit", async () => {
    const fol = await binder(ana, "Für Follower", "followers");
    const priv = await binder(ana, "Geheim", "private");
    const d = await card(ana, "Mew");
    await put(ana, d, priv);
    expect(await binders(cem)).toEqual([["Pokémon 151", 3]]);
    expect(await binders(ben)).toEqual([["Pokémon 151", 3], ["Für Follower", 0]]);
    expect((await binders(ana)).map((x) => x[0])).toEqual(["Pokémon 151", "Für Follower", "Geheim"]);
    // Karte im privaten Binder ist für andere auch direkt nicht sichtbar
    const direct = await t.as<{ get_listing: unknown }>(ben, "select public.get_listing($1)", [d]);
    expect(direct.rows[0].get_listing).toBeNull();
    void fol;
  });

  it("ändert und löscht Binder; Karten landen dann in „Ohne Binder“", async () => {
    await t.as(ana, "select public.save_binder($1, 'Kanto', 'blue', 'public')", [main]);
    await expect(t.as(ben, "select public.save_binder($1, 'Gekapert', 'blue', 'public')", [main])).rejects.toThrow(/not_found/);
    await expect(binder(ana, "   ")).rejects.toThrow();
    await t.as(ana, "delete from public.binders where id = $1", [main]);
    const r = await t.db.query<{ binder_id: string | null; pocket: number | null }>("select binder_id, pocket from public.listings where id = $1", [a]);
    expect(r.rows[0]).toEqual({ binder_id: null, pocket: null });
  });
});
