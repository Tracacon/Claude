// Prüft die Zahlen-Übersicht: nur fürs Team, nur Summen.
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, uid } from "./helpers";

let t: Awaited<ReturnType<typeof createDb>>;
const ana = uid(81);
const ben = uid(82);
const tom = uid(83); // Team

type Stats = {
  members: { total: number; week: number; prev: number };
  listings: { active: number; week: number };
  posts: { week: number };
  members_weekly: { week: string; count: number }[];
  games: { tcg: string; count: number }[];
  reports_open: number;
};

beforeAll(async () => {
  t = await createDb();
  await t.member(ana, "ana");
  await t.member(ben, "ben");
  await t.member(tom, "tom");
  await t.db.query("update public.profiles set role = 'team' where id = $1", [tom]);
  // Ben ist schon länger dabei
  await t.db.query("update public.profiles set created_at = now() - interval '10 days' where id = $1", [ben]);
  await t.db.query(
    `insert into public.listings (owner_id, title, tcg, kind, offer, price_cents) values
       ($1, 'Glurak', 'pokemon', 'sealed', 'sell', 1000), ($1, 'Pikachu', 'pokemon', 'sealed', 'trade', null), ($2, 'Ruffy', 'one_piece', 'sealed', 'sell', 500)`,
    [ana, ben],
  );
  await t.db.query("insert into public.posts (author_id, caption) values ($1, 'Hallo')", [ana]);
});

describe("team_stats", () => {
  it("ist für normale Mitglieder und Gäste gesperrt", async () => {
    await expect(t.as(ana, "select public.team_stats()")).rejects.toThrow(/forbidden/);
    await expect(t.as(null, "select public.team_stats()")).rejects.toThrow();
  });

  it("liefert dem Team die Summen", async () => {
    const r = await t.as<{ team_stats: Stats }>(tom, "select public.team_stats()");
    const s = r.rows[0].team_stats;
    expect(s.members).toEqual({ total: 3, week: 2, prev: 1 });
    expect(s.listings.active).toBe(3);
    expect(s.listings.week).toBe(3);
    expect(s.posts.week).toBe(1);
    expect(s.reports_open).toBe(0);
    expect(s.members_weekly).toHaveLength(12);
    expect(s.games[0]).toEqual({ tcg: "pokemon", count: 2 });
    // Keine Namen oder Inhalte in der Antwort
    expect(JSON.stringify(s)).not.toMatch(/ana|ben|Glurak|Hallo/);
  });
});
