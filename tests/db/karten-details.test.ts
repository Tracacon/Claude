// Prüft die Kartendetails für Inserate (Migration 20261125190000_karten_details.sql).
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, uid } from "./helpers";

let t: Awaited<ReturnType<typeof createDb>>;
const seller = uid(1);
const other = uid(2);
const photo = (n: number) => `20000000-0000-0000-0000-${n.toString(16).padStart(12, "0")}`;
let id: string;

const card = {
  card_ref: "tcgdex:sv03.5-199",
  card_name: "Glurak-ex",
  card_name_en: "Charizard ex",
  card_set: "151",
  card_number: "199/165",
  card_rarity: "Special Illustration Rare",
  card_image: "https://assets.tcgdex.net/de/sv/sv03.5/199/low.webp",
};

async function setDetails(user: string, p: Record<string, unknown>) {
  return t.as(user, "select public.set_listing_details($1::uuid, $2::jsonb)", [id, JSON.stringify(p)]);
}

beforeAll(async () => {
  t = await createDb();
  await t.member(seller, "Sammlerin");
  await t.member(other, "Fremder");
  const r = await t.as<{ create_listing: string }>(seller, "select public.create_listing($1::jsonb)", [
    JSON.stringify({
      title: "Meine beste Karte",
      tcg: "pokemon",
      kind: "slab",
      offer: "sell",
      price_cents: 50000,
      handover_event: true,
      photos: [photo(1), photo(2)],
    }),
  ]);
  id = r.rows[0].create_listing;
});

describe("Kartendetails", () => {
  it("speichert Karte, Variante und Grading", async () => {
    await setDetails(seller, { ...card, variant: "full_art", grading_company: "psa", grading_grade: 10, sealed_type: null });
    const r = await t.db.query<Record<string, unknown>>(
      "select card_name, card_name_en, card_number, variant, grading_company, grading_grade::text as grade from public.listings where id = $1",
      [id],
    );
    expect(r.rows[0]).toMatchObject({ card_name: "Glurak-ex", card_name_en: "Charizard ex", card_number: "199/165", variant: "full_art", grading_company: "psa", grade: "10.0" });
  });

  it("findet das Inserat auch über den englischen Kartennamen", async () => {
    const r = await t.as<{ id: string }>(null, "select id from public.search_listings(p_query => 'Charizard')");
    expect(r.rows.map((x) => x.id)).toContain(id);
  });

  it("lässt nur den Eigentümer ändern", async () => {
    await expect(setDetails(other, { card_name: "Fälschung" })).rejects.toThrow(/not_found/);
  });

  it("lehnt fremde Bildadressen und ungültige Noten ab", async () => {
    await expect(setDetails(seller, { ...card, card_image: "https://example.com/x.webp" })).rejects.toThrow();
    await expect(setDetails(seller, { ...card, grading_company: "psa", grading_grade: 9.3 })).rejects.toThrow();
    await expect(setDetails(seller, { ...card, variant: "glitzer" })).rejects.toThrow();
  });

  it("leert die Details, wenn keine Karte gewählt ist", async () => {
    await setDetails(seller, {});
    const r = await t.db.query<{ card_ref: string | null; variant: string | null }>("select card_ref, variant from public.listings where id = $1", [id]);
    expect(r.rows[0]).toEqual({ card_ref: null, variant: null });
  });
});
