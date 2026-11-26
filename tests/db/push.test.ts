// Mitteilungen aufs Handy (Migration 20261125220000_push.sql).
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, uid } from "./helpers";

let t: Awaited<ReturnType<typeof createDb>>;
const ana = uid(81);
const ben = uid(82);
const sub = (n: number) => ({ endpoint: `https://push.example.com/abc${n}`, p256dh: "B".repeat(87), auth: "a".repeat(22) });

async function asServer<T>(sql: string, params: unknown[] = []) {
  await t.db.exec("set role service_role");
  try {
    return await t.db.query<T>(sql, params);
  } finally {
    await t.db.exec("reset role");
  }
}
const save = (user: string, s: ReturnType<typeof sub>) =>
  t.as(user, "select public.save_push_subscription($1, $2, $3)", [s.endpoint, s.p256dh, s.auth]);

beforeAll(async () => {
  t = await createDb();
  await t.member(ana, "Ana");
  await t.member(ben, "Ben");
});

describe("Handy-Mitteilungen", () => {
  it("meldet Geräte an und gibt neue Benachrichtigungen genau einmal heraus", async () => {
    await save(ana, sub(1));
    await save(ana, sub(1)); // doppelt: bleibt ein Gerät
    await t.as(ben, "select public.follow_user($1)", [ana]);
    const r1 = await asServer<{ claim_push: { items: { kind: string; actor: string }[]; subscriptions: unknown[]; locale: string } }>(
      "select public.claim_push($1)", [ana]);
    expect(r1.rows[0].claim_push.items).toEqual([{ kind: "follow", actor: "Ben", post_id: null, comment: null, listing_id: null, listing_title: null }]);
    expect(r1.rows[0].claim_push.subscriptions).toHaveLength(1);
    const r2 = await asServer<{ claim_push: { items: unknown[] } }>("select public.claim_push($1)", [ana]);
    expect(r2.rows[0].claim_push.items).toEqual([]);
  });

  it("schickt nichts mehr, was schon gelesen wurde", async () => {
    await t.as(ana, "select public.follow_user($1)", [ben]);
    await t.as(ben, "select public.mark_notifications_read()");
    const r = await asServer<{ claim_push: { items: unknown[] } }>("select public.claim_push($1)", [ben]);
    expect(r.rows[0].claim_push.items).toEqual([]);
  });

  it("Mitglieder kommen nicht an fremde Geräte oder an den Versand", async () => {
    await expect(t.as(ben, "select * from public.push_subscriptions")).rejects.toThrow();
    await expect(t.as(ben, "select public.claim_push($1)", [ana])).rejects.toThrow();
    await t.as(ben, "select public.delete_push_subscription($1)", [sub(1).endpoint]); // fremdes Gerät: passiert nichts
    const r = await asServer<{ push_targets: { subscriptions: unknown[] } }>("select public.push_targets($1)", [ana]);
    expect(r.rows[0].push_targets.subscriptions).toHaveLength(1);
  });

  it("behält höchstens 10 Geräte und lässt sich abmelden", async () => {
    for (let i = 2; i <= 12; i++) await save(ana, sub(i));
    let r = await asServer<{ push_targets: { subscriptions: unknown[] } }>("select public.push_targets($1)", [ana]);
    expect(r.rows[0].push_targets.subscriptions).toHaveLength(10);
    await t.as(ana, "select public.delete_push_subscription($1)", [sub(12).endpoint]);
    r = await asServer("select public.push_targets($1)", [ana]);
    expect(r.rows[0].push_targets.subscriptions).toHaveLength(9);
  });

  it("lehnt Adressen ohne https ab", async () => {
    await expect(save(ana, { ...sub(99), endpoint: "http://unsicher.example.com/x" })).rejects.toThrow();
  });
});
