// Angebot "Verschenken" (Migration 20261125200000_verschenken.sql).
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, uid } from "./helpers";

let t: Awaited<ReturnType<typeof createDb>>;
const seller = uid(1);
const photo = (n: number) => `30000000-0000-0000-0000-${n.toString(16).padStart(12, "0")}`;

async function create(p: Record<string, unknown>) {
  const r = await t.as<{ create_listing: string }>(seller, "select public.create_listing($1::jsonb)", [JSON.stringify(p)]);
  return r.rows[0].create_listing;
}

const base = { title: "Bulk-Karten für Kinder", tcg: "pokemon", kind: "lot", handover_event: true, photos: [] as string[] };

beforeAll(async () => {
  t = await createDb();
  await t.member(seller, "Schenkerin");
});

describe("Verschenken", () => {
  it("legt ein Inserat ohne Preis an", async () => {
    const id = await create({ ...base, offer: "gift", price_cents: null });
    const r = await t.db.query<{ offer: string; price_cents: number | null }>("select offer, price_cents from public.listings where id = $1", [id]);
    expect(r.rows[0]).toEqual({ offer: "gift", price_cents: null });
  });

  it("findet es über den Filter „Verschenken“", async () => {
    const r = await t.as<{ title: string }>(null, "select title from public.search_listings(p_offer => 'gift'::public.listing_offer)");
    expect(r.rows.map((x) => x.title)).toContain("Bulk-Karten für Kinder");
  });

  it("Verkauf braucht weiterhin einen Preis", async () => {
    await expect(create({ ...base, offer: "sell", price_cents: null, photos: [photo(1)] })).rejects.toThrow();
  });
});
