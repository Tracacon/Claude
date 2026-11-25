// Benachrichtigungen, Online-Status und "Neu dabei" (Migration 20261125210000).
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, uid } from "./helpers";

let t: Awaited<ReturnType<typeof createDb>>;
const ana = uid(71);
const ben = uid(72);
const cem = uid(73); // privates Profil mit Bestätigung
const dan = uid(74); // folgt niemandem
let n = 700;

type Note = { kind: string; read: boolean; actor: { nickname: string }; post_id: string | null; comment: string | null; request_open: boolean; my_follow: string | null };

async function notes(user: string) {
  const r = await t.as<{ my_notifications: Note[] }>(user, "select public.my_notifications()");
  return r.rows[0].my_notifications;
}
async function unread(user: string) {
  const r = await t.as<{ c: number }>(user, "select public.unread_notification_count() as c");
  return r.rows[0].c;
}
async function post(user: string) {
  const id = uid(n++);
  await t.as(user, "insert into storage.objects (bucket_id, name, owner) values ('post-photos', $1, auth.uid())", [`${user}/${id}.jpg`]);
  const r = await t.as<{ create_post: string }>(user, "select public.create_post('Hallo', $1::uuid[])", [[id]]);
  return r.rows[0].create_post;
}
const follow = (a: string, b: string) => t.as(a, "select public.follow_user($1)", [b]);

beforeAll(async () => {
  t = await createDb();
  await t.member(ana, "Ana");
  await t.member(ben, "Ben");
  await t.member(cem, "Cem");
  await t.member(dan, "Dan");
  await t.as(cem, "select public.update_privacy('followers', true)");
});

describe("Benachrichtigungen", () => {
  it("meldet einen neuen Follower", async () => {
    await follow(ben, ana);
    const list = await notes(ana);
    expect(list).toMatchObject([{ kind: "follow", read: false, actor: { nickname: "Ben" }, my_follow: null }]);
    expect(await unread(ana)).toBe(1);
  });

  it("meldet Folgeanfragen und die Annahme", async () => {
    await follow(ana, cem);
    expect((await notes(cem))[0]).toMatchObject({ kind: "follow_request", request_open: true, actor: { nickname: "Ana" } });
    await t.as(cem, "select public.respond_follow_request($1, true)", [ana]);
    expect((await notes(cem)).some((x) => x.kind === "follow_request")).toBe(false);
    expect((await notes(ana))[0]).toMatchObject({ kind: "follow_accepted", actor: { nickname: "Cem" } });
  });

  it("entfernt die Anfrage, wenn sie abgelehnt wird", async () => {
    await follow(dan, cem);
    await t.as(cem, "select public.respond_follow_request($1, false)", [dan]);
    expect((await notes(cem)).some((x) => x.actor.nickname === "Dan")).toBe(false);
  });

  it("meldet Likes nur einmal und Kommentare mit Text", async () => {
    const p = await post(ana);
    await t.as(ben, "select public.toggle_like($1)", [p]);
    await t.as(ben, "select public.toggle_like($1)", [p]); // weg
    await t.as(ben, "select public.toggle_like($1)", [p]); // wieder da
    await t.as(ana, "select public.toggle_like($1)", [p]); // eigener Like: keine Meldung
    await t.as(ben, "select public.add_comment($1, 'Starke Karte!')", [p]);
    const list = await notes(ana);
    expect(list.filter((x) => x.kind === "like")).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: "comment", comment: "Starke Karte!", post_id: p });
  });

  it("markiert alles als gelesen und zeigt niemandem fremde Meldungen", async () => {
    await t.as(ana, "select public.mark_notifications_read()");
    expect(await unread(ana)).toBe(0);
    expect((await notes(dan)).length).toBe(0);
    await expect(t.as(dan, "select * from public.notifications")).rejects.toThrow();
  });
});

describe("Online-Status", () => {
  it("zeigt Follower und Gefolgte, die gerade da sind", async () => {
    await t.as(ana, "select public.touch_presence()");
    const r = await t.as<{ nickname: string }>(ben, "select nickname from public.online_contacts()");
    expect(r.rows.map((x) => x.nickname)).toEqual(["Ana"]);
    const fremd = await t.as(dan, "select * from public.online_contacts()");
    expect(fremd.rows).toHaveLength(0);
  });

  it("respektiert die Einstellung – in beide Richtungen", async () => {
    await t.as(ana, "select public.update_presence_settings(false, true)");
    expect((await t.as(ben, "select * from public.online_contacts()")).rows).toHaveLength(0);
    await t.as(ana, "select public.update_presence_settings(true, true)");
    await t.as(ben, "select public.update_presence_settings(false, true)");
    expect((await t.as(ben, "select * from public.online_contacts()")).rows).toHaveLength(0);
    await t.as(ben, "select public.update_presence_settings(true, true)");
  });

  it("die Zeit ist nicht direkt lesbar", async () => {
    await expect(t.as(ben, "select * from public.presence")).rejects.toThrow();
  });
});

describe("Neu dabei", () => {
  it("zeigt neue Mitglieder, außer sie möchten das nicht", async () => {
    let r = await t.as<{ nickname: string }>(null, "select nickname from public.new_members()");
    expect(r.rows.map((x) => x.nickname).sort()).toEqual(["Ana", "Ben", "Cem", "Dan"]);
    await t.as(dan, "select public.update_presence_settings(true, false)");
    r = await t.as<{ nickname: string }>(null, "select nickname from public.new_members()");
    expect(r.rows.map((x) => x.nickname)).not.toContain("Dan");
  });
});
