// Eventseite wie auf tracacon.de: Zusatzangaben beim Abgleich (Migration 20261126200000).
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, uid } from "./helpers";

let t: Awaited<ReturnType<typeof createDb>>;
const ana = uid(141);
const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

async function sync(events: unknown[]) {
  await t.db.exec("set role service_role");
  try {
    await t.db.query("select public.sync_events($1::jsonb)", [JSON.stringify({ since: hours(-24 * 400), events })]);
  } finally {
    await t.db.exec("reset role");
  }
}

const details = {
  cover_url: "https://www.tracacon.de/web/image/5270/hero-halle.jpg",
  description: [{ type: "p", parts: [{ text: "Hallo" }] }],
  dealers: [{ name: "PlugFromJapan", logo_url: null, tcgs: ["pokemon"], other: null, products: ["sealed"], link_url: null, link_label: null }],
  tables: { total: 73, free: 0, on_sale: false },
};
const event = (extra: Record<string, unknown> = {}) => ({ odoo_id: 900, name: "Cardshow", starts_at: hours(48), ends_at: hours(56), ...extra });

beforeAll(async () => {
  t = await createDb();
  await t.member(ana, "Ana");
});

describe("Zusatzangaben zum Termin", () => {
  it("werden gespeichert und auf Termin- und Listenseite geliefert", async () => {
    await sync([event({ details })]);
    const id = (await t.db.query<{ id: string }>("select id from public.events where odoo_id = 900")).rows[0].id;
    const e = (await t.as<{ v: { details: typeof details } }>(null, "select public.get_event($1) as v", [id])).rows[0].v;
    expect(e.details).toEqual(details);
    const list = (await t.as<{ cover_url: string; dealer_count: number; tables: unknown }>(ana, "select * from public.list_events(false, 10)")).rows;
    expect(list[0]).toMatchObject({ cover_url: details.cover_url, dealer_count: 1, tables: details.tables });
  });

  it("bleiben erhalten, wenn Odoo sie einmal nicht liefert", async () => {
    await sync([event({ name: "Cardshow neu" })]);
    const r = (await t.db.query<{ name: string; details: typeof details }>("select name, details from public.events where odoo_id = 900")).rows[0];
    expect(r.name).toBe("Cardshow neu");
    expect(r.details.dealers).toHaveLength(1);
  });

  it("ungültige Angaben werden ignoriert, leere Listen überschreiben", async () => {
    await sync([event({ details: "kaputt" })]);
    expect((await t.db.query<{ n: number }>("select jsonb_array_length(details -> 'dealers') as n from public.events where odoo_id = 900")).rows[0].n).toBe(1);
    await sync([event({ details: { dealers: [], tables: null } })]);
    const list = (await t.as<{ dealer_count: number; cover_url: string | null }>(null, "select * from public.list_events(false, 10)")).rows;
    expect(list[0]).toMatchObject({ dealer_count: 0, cover_url: null });
  });
});
