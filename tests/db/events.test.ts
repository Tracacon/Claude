// Prüft Phase 4: Abgleich aus Odoo, Mitbringen, Check-in mit Aushang-Code, Abzeichen.
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, uid } from "./helpers";

let t: Awaited<ReturnType<typeof createDb>>;
const ana = uid(41);
const ben = uid(42);
const tom = uid(43); // Team
const neu = uid(44); // ohne Nickname

const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

async function service<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  await t.db.exec("set role service_role");
  try {
    return await t.db.query<T>(sql, params);
  } finally {
    await t.db.exec("reset role");
  }
}

function odoo(id: number, name: string, startH: number, endH: number, extra: Record<string, unknown> = {}) {
  return { odoo_id: id, name, starts_at: hours(startH), ends_at: hours(endH), city: "Stuttgart", ...extra };
}

async function sync(events: unknown[], since = hours(-24 * 400)) {
  const r = await service<{ sync_events: number }>("select public.sync_events($1::jsonb)", [
    JSON.stringify({ since, events }),
  ]);
  return r.rows[0].sync_events;
}

async function eventId(odooId: number) {
  const r = await t.db.query<{ id: string }>("select id from public.events where odoo_id = $1", [odooId]);
  return r.rows[0].id;
}

async function listing(owner: string, title: string) {
  const r = await t.as<{ create_listing: string }>(owner, "select public.create_listing($1::jsonb)", [
    JSON.stringify({ title, tcg: "pokemon", kind: "sealed", offer: "trade", handover_event: true }),
  ]);
  return r.rows[0].create_listing;
}

beforeAll(async () => {
  t = await createDb();
  await t.member(ana, "Ana");
  await t.member(ben, "Ben");
  await t.member(tom, "Tom");
  await t.signUp(neu, "neu@example.com");
  await t.db.query("update public.profiles set role = 'team' where id = $1", [tom]);
});

describe("Abgleich aus Odoo", () => {
  it("nur mit dem Server-Schlüssel", async () => {
    await expect(t.as(ana, "select public.sync_events('{}'::jsonb)")).rejects.toThrow(/permission denied/);
    await expect(t.as(null, "select public.sync_events('{}'::jsonb)")).rejects.toThrow(/permission denied/);
    await expect(t.as(tom, "select public.sync_events_failed('x')")).rejects.toThrow(/permission denied/);
  });

  it("legt Termine an, aktualisiert und blendet entfernte aus", async () => {
    expect(
      await sync([
        odoo(1, "TNS Stuttgart Januar", 24 * 5, 24 * 5 + 6, {
          ticket_url: "https://www.eventim.de/event/tns-1",
          website_url: "javascript:alert(1)",
        }),
        odoo(2, "Messe Kornwestheim", 24 * 30, 24 * 30 + 8),
        odoo(3, "TNS November", -24 * 20, -24 * 20 + 6),
        odoo(4, "Laufendes Event", -1, 5),
      ]),
    ).toBe(4);
    const e = await t.db.query<{ ticket_url: string; website_url: string | null }>(
      "select ticket_url, website_url from public.events where odoo_id = 1",
    );
    expect(e.rows[0]).toEqual({ ticket_url: "https://www.eventim.de/event/tns-1", website_url: null });

    // Odoo liefert Termin 2 nicht mehr, Termin 1 umbenannt
    await sync(
      [odoo(1, "TNS Stuttgart 3. Januar", 24 * 5, 24 * 5 + 6), odoo(3, "TNS November", -24 * 20, -24 * 20 + 6), odoo(4, "Laufendes Event", -1, 5)],
      hours(-24 * 400),
    );
    const list = await t.as<{ name: string }>(null, "select name from public.list_events()");
    expect(list.rows.map((r) => r.name)).toEqual(["Laufendes Event", "TNS Stuttgart 3. Januar"]);
    const past = await t.as<{ name: string }>(null, "select name from public.list_events(true)");
    expect(past.rows.map((r) => r.name)).toEqual(["TNS November"]);
    // Ausgeblendeter Termin nur fürs Team sichtbar
    const id2 = await eventId(2);
    expect((await t.as(ana, "select public.get_event($1)", [id2])).rows[0]).toEqual({ get_event: null });
    expect((await t.as<{ get_event: { name: string } }>(tom, "select public.get_event($1)", [id2])).rows[0].get_event.name).toBe(
      "Messe Kornwestheim",
    );
  });

  it("Stand des Abgleichs: Fehlertext nur fürs Team", async () => {
    await service("select public.sync_events_failed('Odoo nicht erreichbar')");
    const pub = await t.as<{ event_sync_state: { synced_at: string; error: string | null } }>(null, "select public.event_sync_state()");
    expect(pub.rows[0].event_sync_state.synced_at).toBeTruthy();
    expect(pub.rows[0].event_sync_state.error).toBeNull();
    const team = await t.as<{ event_sync_state: { error: string } }>(tom, "select public.event_sync_state()");
    expect(team.rows[0].event_sync_state.error).toBe("Odoo nicht erreichbar");
  });

  it("Tabellen sind nicht direkt beschreibbar", async () => {
    await expect(t.as(tom, "insert into public.events (odoo_id, name, starts_at, ends_at) values (9, 'x', now(), now())")).rejects.toThrow(
      /permission denied/,
    );
    await expect(t.as(ana, "insert into public.checkins (event_id, user_id) select id, auth.uid() from public.events limit 1")).rejects.toThrow(
      /permission denied/,
    );
    await expect(t.as(tom, "select * from public.checkin_codes")).rejects.toThrow(/permission denied/);
  });
});

describe("Karten zum Termin mitbringen", () => {
  let l1: string;
  let l2: string;

  it("nur eigene Inserate und nur kommende Termine", async () => {
    l1 = await listing(ana, "Booster Display");
    l2 = await listing(ben, "Glurak Slab");
    const jan = await eventId(1);
    const nov = await eventId(3);
    await t.as(ana, "select public.set_listing_events($1, $2::uuid[])", [l1, [jan, nov]]);
    await expect(t.as(ben, "select public.set_listing_events($1, $2::uuid[])", [l1, [jan]])).rejects.toThrow(/not_found/);
    await t.as(ben, "select public.set_listing_events($1, $2::uuid[])", [l2, [jan]]);

    const ev = await t.as<{ title: string; owner_nickname: string; total_count: string }>(
      null,
      "select title, owner_nickname, total_count from public.event_listings($1)",
      [jan],
    );
    expect(ev.rows.map((r) => r.title).sort()).toEqual(["Booster Display", "Glurak Slab"]);
    expect(Number(ev.rows[0].total_count)).toBe(2);
    // Vergangener Termin wird nicht verknüpft
    expect((await t.as(null, "select * from public.event_listings($1)", [nov])).rows).toHaveLength(0);
    const mine = await t.as<{ name: string }>(null, "select name from public.listing_event_list($1)", [l1]);
    expect(mine.rows.map((r) => r.name)).toEqual(["TNS Stuttgart 3. Januar"]);
  });

  it("Auswahl ersetzen, erledigte Inserate verschwinden von der Terminseite", async () => {
    const jan = await eventId(1);
    const now = await eventId(4);
    await t.as(ana, "select public.set_listing_events($1, $2::uuid[])", [l1, [now]]);
    const r = await t.as<{ name: string }>(null, "select name from public.listing_event_list($1)", [l1]);
    expect(r.rows.map((x) => x.name)).toEqual(["Laufendes Event"]);
    await t.as(ben, "select public.set_listing_status($1, 'done')", [l2]);
    expect((await t.as(null, "select * from public.event_listings($1)", [jan])).rows).toHaveLength(0);
    const list = await t.as<{ name: string; listing_count: string }>(null, "select name, listing_count from public.list_events()");
    expect(list.rows.map((x) => [x.name, Number(x.listing_count)])).toEqual([
      ["Laufendes Event", 1],
      ["TNS Stuttgart 3. Januar", 0],
    ]);
  });

  it("höchstens 10 Termine je Inserat", async () => {
    const many = Array.from({ length: 11 }, (_, i) => uid(900 + i));
    await expect(t.as(ana, "select public.set_listing_events($1, $2::uuid[])", [l1, many])).rejects.toThrow(/too_many_events/);
  });
});

describe("Check-in mit Aushang-Code", () => {
  let code: string;

  it("nur das Team erzeugt Codes", async () => {
    const id = await eventId(4);
    await expect(t.as(ana, "select public.team_checkin_code($1)", [id])).rejects.toThrow(/forbidden/);
    const r = await t.as<{ team_checkin_code: string }>(tom, "select public.team_checkin_code($1)", [id]);
    code = r.rows[0].team_checkin_code;
    expect(code).toMatch(/^[a-z0-9]{40}$/);
    const again = await t.as<{ team_checkin_code: string }>(tom, "select public.team_checkin_code($1)", [id]);
    expect(again.rows[0].team_checkin_code).toBe(code);
  });

  it("einchecken, doppelt zählt nicht", async () => {
    const r = await t.as<{ check_in: { name: string; new: boolean; visits: number } }>(ana, "select public.check_in($1)", [
      ` ${code.toUpperCase()} `,
    ]);
    expect(r.rows[0].check_in).toMatchObject({ name: "Laufendes Event", new: true, visits: 1 });
    const twice = await t.as<{ check_in: { new: boolean } }>(ana, "select public.check_in($1)", [code]);
    expect(twice.rows[0].check_in.new).toBe(false);
    const ev = await t.as<{ get_event: { checkin_count: number; checked_in: boolean; checkin_open: boolean } }>(
      ana,
      "select public.get_event($1)",
      [await eventId(4)],
    );
    expect(ev.rows[0].get_event).toMatchObject({ checkin_count: 1, checked_in: true, checkin_open: true });
  });

  it("ohne Anmeldung, ohne Nickname oder mit falschem Code nicht möglich", async () => {
    await expect(t.as(null, "select public.check_in($1)", [code])).rejects.toThrow(/permission denied/);
    await expect(t.as(neu, "select public.check_in($1)", [code])).rejects.toThrow(/onboarding_required/);
    await expect(t.as(ben, "select public.check_in('falsch')")).rejects.toThrow(/checkin_invalid/);
  });

  it("nur rund um die Eventzeit", async () => {
    const future = await t.as<{ team_checkin_code: string }>(tom, "select public.team_checkin_code($1)", [await eventId(1)]);
    await expect(t.as(ben, "select public.check_in($1)", [future.rows[0].team_checkin_code])).rejects.toThrow(/checkin_not_open/);
    const past = await t.as<{ team_checkin_code: string }>(tom, "select public.team_checkin_code($1)", [await eventId(3)]);
    await expect(t.as(ben, "select public.check_in($1)", [past.rows[0].team_checkin_code])).rejects.toThrow(/checkin_closed/);
  });

  it("neuer Code macht den alten ungültig", async () => {
    const id = await eventId(4);
    const r = await t.as<{ team_checkin_code: string }>(tom, "select public.team_checkin_code($1, true)", [id]);
    expect(r.rows[0].team_checkin_code).not.toBe(code);
    await expect(t.as(ben, "select public.check_in($1)", [code])).rejects.toThrow(/checkin_invalid/);
    await t.as(ben, "select public.check_in($1)", [r.rows[0].team_checkin_code]);
  });

  it("Check-ins sieht man nur selbst und das Team", async () => {
    expect((await t.as(ana, "select * from public.checkins")).rows).toHaveLength(1);
    expect((await t.as(tom, "select * from public.checkins")).rows).toHaveLength(2);
    const o = await t.as<{ name: string; checkin_count: string; has_code: boolean }>(
      tom,
      "select name, checkin_count, has_code from public.team_event_overview() where name = 'Laufendes Event'",
    );
    expect(o.rows[0]).toMatchObject({ checkin_count: 2, has_code: true });
    await expect(t.as(ana, "select * from public.team_event_overview()")).rejects.toThrow(/forbidden/);
  });
});

describe("Abzeichen und besuchte Events", () => {
  it("Stammgast ab 3, 10 und 25 Besuchen", async () => {
    const badges = async () =>
      (await t.as<{ get_profile: { badges: string[] } }>(null, "select public.get_profile('Ana')")).rows[0].get_profile.badges;
    expect(await badges()).not.toContain("regular_3");
    for (let i = 0; i < 24; i++) {
      await sync([odoo(100 + i, `Event ${i}`, -24 * (30 + i), -24 * (30 + i) + 5)], hours(24 * 1000));
      await t.db.query("insert into public.checkins (event_id, user_id) values ($1, $2)", [await eventId(100 + i), ana]);
      const n = i + 2;
      const b = await badges();
      if (n >= 25) expect(b).toContain("regular_25");
      else if (n >= 10) expect(b).toContain("regular_10");
      else if (n >= 3) expect(b).toContain("regular_3");
      expect(b.filter((x) => x.startsWith("regular"))).toHaveLength(n >= 3 ? 1 : 0);
    }
  });

  it("besuchte Events nur bei sichtbarem Profil", async () => {
    const pub = await t.as(null, "select * from public.profile_events('Ben')");
    expect(pub.rows).toHaveLength(1);
    await t.as(ben, "select public.update_privacy('followers', true)");
    expect((await t.as(ana, "select * from public.profile_events('Ben')")).rows).toHaveLength(0);
    expect((await t.as(ben, "select * from public.profile_events('Ben')")).rows).toHaveLength(1);
    expect((await t.as(tom, "select * from public.profile_events('Ben')")).rows).toHaveLength(1);
  });

  it("Konto löschen entfernt die Check-ins", async () => {
    await t.as(ben, "select public.delete_own_account()");
    const r = await t.db.query("select * from public.checkins where user_id = $1", [ben]);
    expect(r.rows).toHaveLength(0);
  });
});
