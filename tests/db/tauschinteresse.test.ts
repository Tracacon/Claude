// Tauschinteresse an Inseraten (Migration 20261126120000).
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, uid } from "./helpers";

let t: Awaited<ReturnType<typeof createDb>>;
const ana = uid(91); // Besitzerin des Inserats
const ben = uid(92); // hat Interesse und eigene Tauschkarten
const cem = uid(93); // hat Interesse, wird später blockiert
const dan = uid(94); // Zuschauer
let glurak = "";

type Person = { nickname: string; trade_count: number; cards: { title: string }[] };

async function listing(owner: string, title: string, offer: string) {
  const r = await t.db.query<{ id: string }>(
    "insert into public.listings (owner_id, title, tcg, kind, offer, price_cents) values ($1, $2, 'pokemon', 'sealed', $3, $4) returning id",
    [owner, title, offer, offer === "trade" || offer === "gift" ? null : 1000],
  );
  return r.rows[0].id;
}
const toggle = async (user: string, id: string) =>
  (await t.as<{ v: boolean }>(user, "select public.toggle_listing_interest($1) as v", [id])).rows[0].v;
const state = async (user: string | null, id: string) =>
  (await t.as<{ v: { mine: boolean; count: number } }>(user, "select public.listing_interest_state($1) as v", [id])).rows[0].v;
const people = async (user: string, id: string) =>
  (await t.as<{ v: Person[] }>(user, "select public.listing_interested_people($1) as v", [id])).rows[0].v;
const notes = async (user: string) =>
  (await t.as<{ v: { kind: string; listing_title: string | null }[] }>(user, "select public.my_notifications() as v")).rows[0].v;

beforeAll(async () => {
  t = await createDb();
  await t.member(ana, "Ana");
  await t.member(ben, "Ben");
  await t.member(cem, "Cem");
  await t.member(dan, "Dan");
  glurak = await listing(ana, "Glurak Box", "sell_or_trade");
  await listing(ben, "Pikachu Tin", "trade");
  await listing(ben, "Mewtu Box", "sell_or_trade");
  await listing(ben, "Nur Verkauf", "sell");
});

describe("Tauschinteresse", () => {
  it("an- und wieder abschalten", async () => {
    expect(await toggle(ben, glurak)).toBe(true);
    expect(await state(ben, glurak)).toEqual({ mine: true, count: 1 });
    expect(await toggle(ben, glurak)).toBe(false);
    expect(await state(ben, glurak)).toEqual({ mine: false, count: 0 });
  });

  it("nicht am eigenen Inserat und nicht ohne Anmeldung", async () => {
    await expect(toggle(ana, glurak)).rejects.toThrow(/invalid_action/);
    await expect(t.as(null, "select public.toggle_listing_interest($1)", [glurak])).rejects.toThrow();
  });

  it("die Besitzerin sieht Interessenten mit ihren Tauschkarten und bekommt eine Benachrichtigung", async () => {
    await toggle(ben, glurak);
    await toggle(cem, glurak);
    const list = await people(ana, glurak);
    expect(list.map((p) => p.nickname).sort()).toEqual(["Ben", "Cem"]);
    const benRow = list.find((p) => p.nickname === "Ben")!;
    expect(benRow.trade_count).toBe(2);
    expect(benRow.cards.map((c) => c.title).sort()).toEqual(["Mewtu Box", "Pikachu Tin"]);
    expect((await notes(ana)).filter((n) => n.kind === "trade_interest")).toHaveLength(2);
    expect((await notes(ana))[0].listing_title).toBe("Glurak Box");
  });

  it("andere sehen nur die Anzahl, nicht die Namen", async () => {
    expect(await state(dan, glurak)).toEqual({ mine: false, count: 2 });
    await expect(people(dan, glurak)).rejects.toThrow(/forbidden/);
  });

  it("zurückgezogenes Interesse nimmt die ungelesene Benachrichtigung mit", async () => {
    await toggle(cem, glurak);
    expect((await notes(ana)).filter((n) => n.kind === "trade_interest")).toHaveLength(1);
  });

  it("blockierte Personen tauchen nicht auf und können kein Interesse zeigen", async () => {
    await toggle(cem, glurak);
    await t.as(ana, "select public.block_user($1)", [cem]);
    expect((await people(ana, glurak)).map((p) => p.nickname)).toEqual(["Ben"]);
    await expect(toggle(cem, glurak)).rejects.toThrow(/blocked/);
  });
});
