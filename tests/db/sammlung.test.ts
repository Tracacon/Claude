// Sammlung als Grundlage (Migration 20261127200000_sammlung.sql).
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, uid } from "./helpers";

let t: Awaited<ReturnType<typeof createDb>>;
const ana = uid(81); // öffentliches Profil
const ben = uid(82); // Besucher
const cem = uid(83); // privates Profil (nur Follower)
const photo = (n: number) => `40000000-0000-0000-0000-${n.toString(16).padStart(12, "0")}`;

const glurak = {
  title: "Glurak ex 199/165",
  tcg: "pokemon",
  kind: "single",
  offer: "trade",
  handover_event: true,
  status: "collection",
  quantity: 2,
  photos: [] as string[],
};

async function create(user: string, p: Record<string, unknown>) {
  const r = await t.as<{ create_listing: string }>(user, "select public.create_listing($1::jsonb)", [JSON.stringify(p)]);
  return r.rows[0].create_listing;
}
async function status(id: string) {
  const r = await t.db.query<{ status: string; quantity: number }>("select status::text, quantity from public.listings where id = $1", [id]);
  return r.rows[0];
}
async function collection(viewer: string | null, nickname: string) {
  const r = await t.as<{ id: string; status: string }>(viewer, "select id, status::text from public.profile_collection($1)", [nickname]);
  return r.rows;
}
async function search() {
  const r = await t.as<{ id: string }>(null, "select id from public.search_listings()");
  return r.rows.map((x) => x.id);
}

beforeAll(async () => {
  t = await createDb();
  await t.member(ana, "Ana");
  await t.member(ben, "Ben");
  await t.member(cem, "Cem");
  await t.as(cem, "select public.update_privacy('followers', false)");
});

describe("Sammlung", () => {
  let id: string;

  it("legt eine Einzelkarte nur für die Sammlung an (mit Vorder- und Rückseite)", async () => {
    await expect(create(ana, glurak)).rejects.toThrow(/front_back_required/);
    id = await create(ana, { ...glurak, photos: [photo(1), photo(2)] });
    expect(await status(id)).toEqual({ status: "collection", quantity: 2 });
  });

  it("zeigt Sammlungsstücke nicht im Marktplatz, aber im Profil", async () => {
    expect(await search()).not.toContain(id);
    expect((await collection(ben, "Ana")).map((x) => x.id)).toContain(id);
    expect((await collection(null, "Ana")).map((x) => x.id)).toContain(id);
    const detail = await t.as<{ get_listing: unknown }>(ben, "select public.get_listing($1)", [id]);
    expect(detail.rows[0].get_listing).not.toBeNull();
  });

  it("markiert zum Tauschen und erscheint dann im Marktplatz", async () => {
    await t.as(ana, "select public.update_listing($1, $2::jsonb)", [
      id,
      JSON.stringify({ ...glurak, status: "active", photos: [photo(1), photo(2)] }),
    ]);
    expect((await status(id)).status).toBe("active");
    expect(await search()).toContain(id);
    expect((await collection(ben, "Ana")).find((x) => x.id === id)?.status).toBe("active");
  });

  it("legt ein Inserat zurück in die Sammlung, Fotos bleiben Pflicht", async () => {
    await t.as(ana, "select public.set_listing_status($1, 'collection')", [id]);
    expect(await search()).not.toContain(id);
    await expect(
      t.as(ana, "select public.update_listing($1, $2::jsonb)", [id, JSON.stringify({ ...glurak, photos: [] })]),
    ).rejects.toThrow(/front_back_required/);
  });

  it("respektiert private Profile", async () => {
    const hidden = await create(cem, { ...glurak, title: "Geheime Karte", photos: [photo(3), photo(4)] });
    expect(await collection(ben, "Cem")).toEqual([]);
    const direct = await t.as(ben, "select id from public.listings where id = $1", [hidden]);
    expect(direct.rows).toEqual([]);
    expect((await collection(cem, "Cem")).map((x) => x.id)).toContain(hidden);
  });

  it("erlaubt nur gültige Anzahlen", async () => {
    await expect(create(ana, { ...glurak, kind: "lot", quantity: 0 })).rejects.toThrow();
    await expect(create(ana, { ...glurak, kind: "lot", quantity: 1000 })).rejects.toThrow();
  });

  it("macht aus einem frechen Status beim Anlegen ein normales Inserat", async () => {
    const x = await create(ana, { ...glurak, kind: "lot", status: "removed" });
    expect((await status(x)).status).toBe("active");
  });

  it("entfernt Stücke mit Grund und merkt sich nur den Grund", async () => {
    const x = await create(ana, { ...glurak, kind: "lot", title: "Tauschkarte" });
    await expect(t.as(ben, "select public.remove_listing($1, 'traded')", [x])).rejects.toThrow(/not_found/);
    await expect(t.as(ana, "select public.remove_listing($1, 'kaputt')", [x])).rejects.toThrow(/invalid_action/);
    await t.as(ana, "select public.remove_listing($1, 'traded')", [x]);
    expect(await status(x)).toBeUndefined();
    const log = await t.db.query<{ reason: string }>("select reason from public.collection_removals where owner_id = $1", [ana]);
    expect(log.rows).toEqual([{ reason: "traded" }]);
    await expect(t.as(ana, "select * from public.collection_removals")).resolves.toMatchObject({ rows: [] });
  });
});
