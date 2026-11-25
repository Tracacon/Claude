// Prüft die Phase-3-Migration (App-Chat) gegen echtes Postgres.
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, uid } from "./helpers";

let t: Awaited<ReturnType<typeof createDb>>;
const seller = uid(11);
const buyer = uid(12);
const stranger = uid(13);
const mod = uid(14);
const newbie = uid(15);
const photo = (n: number) => `20000000-0000-0000-0000-${n.toString(16).padStart(12, "0")}`;

let listingId: string;
let convId: string;

async function send(user: string, conv: string, body: string) {
  return t.as<{ id: string; body: string }>(user, "select * from public.send_message($1, $2)", [conv, body]);
}

beforeAll(async () => {
  t = await createDb();
  await t.member(seller, "Haendlerin");
  await t.member(buyer, "Interessent");
  await t.member(stranger, "Fremder");
  await t.member(mod, "Team1");
  await t.signUp(newbie, "neu2@example.com");
  await t.db.query("update public.profiles set role = 'team' where id = $1", [mod]);
  const r = await t.as<{ create_listing: string }>(seller, "select public.create_listing($1::jsonb)", [
    JSON.stringify({
      title: "Lorcana Elsa Enchanted",
      tcg: "lorcana",
      kind: "single",
      offer: "sell",
      price_cents: 30000,
      handover_event: true,
      photos: [photo(1), photo(2)],
    }),
  ]);
  listingId = r.rows[0].create_listing;
  await t.db.query("select pg_publication_tables.tablename from pg_publication_tables");
});

describe("Unterhaltung beginnen", () => {
  it("startet eine Unterhaltung zu einem fremden Inserat", async () => {
    const r = await t.as<{ start_conversation: string }>(buyer, "select public.start_conversation($1)", [listingId]);
    convId = r.rows[0].start_conversation;
    const again = await t.as<{ start_conversation: string }>(buyer, "select public.start_conversation($1)", [listingId]);
    expect(again.rows[0].start_conversation).toBe(convId);
  });

  it("verbietet Unterhaltungen mit sich selbst und ohne fertiges Profil", async () => {
    await expect(t.as(seller, "select public.start_conversation($1)", [listingId])).rejects.toThrow(/cannot_message_self/);
    await expect(t.as(newbie, "select public.start_conversation($1)", [listingId])).rejects.toThrow(/profile_incomplete/);
    await expect(t.as(null, "select public.start_conversation($1)", [listingId])).rejects.toThrow(/permission denied/);
  });

  it("zeigt leere Unterhaltungen noch nicht in der Liste", async () => {
    const r = await t.as(seller, "select * from public.list_conversations()");
    expect(r.rows).toHaveLength(0);
  });
});

describe("Nachrichten", () => {
  it("sendet und zeigt Nachrichten beiden Beteiligten", async () => {
    await send(buyer, convId, "  Hallo! Ist die Elsa noch da?  ");
    await send(seller, convId, "Ja, bringe sie zur nächsten Tracacon mit.");
    const forBuyer = await t.as<{ body: string }>(buyer, "select body from public.get_messages($1)", [convId]);
    expect(forBuyer.rows.map((m) => m.body)).toEqual(["Hallo! Ist die Elsa noch da?", "Ja, bringe sie zur nächsten Tracacon mit."]);
    const forSeller = await t.as(seller, "select * from public.messages");
    expect(forSeller.rows).toHaveLength(2);
  });

  it("verbirgt Unterhaltungen vor Dritten, auch vor dem Team", async () => {
    expect((await t.as(stranger, "select * from public.messages")).rows).toHaveLength(0);
    expect((await t.as(stranger, "select * from public.conversations")).rows).toHaveLength(0);
    expect((await t.as(stranger, "select * from public.get_messages($1)", [convId])).rows).toHaveLength(0);
    expect((await t.as(mod, "select * from public.messages")).rows).toHaveLength(0);
    const head = await t.as<{ get_conversation: unknown }>(stranger, "select public.get_conversation($1)", [convId]);
    expect(head.rows[0]?.get_conversation ?? null).toBeNull();
    await expect(send(stranger, convId, "Ich mische mich ein")).rejects.toThrow(/not_found/);
    await expect(t.as(mod, "select public.moderation_conversation($1)", [convId])).rejects.toThrow(/not_found/);
  });

  it("verbietet direktes Schreiben an den Funktionen vorbei", async () => {
    await expect(
      t.as(buyer, "insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'x')", [convId, buyer]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.as(buyer, "update public.conversations set seller_id = $1 where id = $2", [stranger, convId]),
    ).rejects.toThrow(/permission denied/);
  });

  it("lehnt leere und zu lange Nachrichten ab", async () => {
    await expect(send(buyer, convId, "   ")).rejects.toThrow(/messages_body_length|messages_content/);
    await expect(send(buyer, convId, "x".repeat(1001))).rejects.toThrow(/messages_body_length|messages_content/);
  });

  it("zählt Ungelesenes und markiert als gelesen", async () => {
    const before = await t.as<{ unread_message_count: number }>(buyer, "select public.unread_message_count()");
    expect(before.rows[0].unread_message_count).toBe(1);
    const list = await t.as<{ unread: number; other_nickname: string; last_body: string; last_from_me: boolean; i_am_seller: boolean }>(
      buyer,
      "select * from public.list_conversations()",
    );
    expect(list.rows[0]).toMatchObject({
      unread: 1,
      other_nickname: "Haendlerin",
      last_body: "Ja, bringe sie zur nächsten Tracacon mit.",
      last_from_me: false,
      i_am_seller: false,
    });
    await t.as(buyer, "select public.mark_conversation_read($1)", [convId]);
    const after = await t.as<{ unread_message_count: number }>(buyer, "select public.unread_message_count()");
    expect(after.rows[0].unread_message_count).toBe(0);
    const sellerSide = await t.as<{ unread_message_count: number }>(seller, "select public.unread_message_count()");
    expect(sellerSide.rows[0].unread_message_count).toBe(0); // eigene Antwort zählt als gelesen
  });

  it("begrenzt die Zahl der Nachrichten pro Minute", async () => {
    const r = await t.as<{ start_conversation: string }>(stranger, "select public.start_conversation($1)", [listingId]);
    const conv = r.rows[0].start_conversation;
    for (let i = 0; i < 20; i++) await send(stranger, conv, `Nachricht ${i}`);
    await expect(send(stranger, conv, "Eine zu viel")).rejects.toThrow(/rate_limited/);
  });

  it("blendet Unterhaltungen aus, bis eine neue Nachricht kommt", async () => {
    await t.as(seller, "select public.hide_conversation($1)", [convId]);
    expect((await t.as<{ id: string }>(seller, "select id from public.list_conversations()")).rows.map((r) => r.id)).not.toContain(convId);
    await send(buyer, convId, "Noch Interesse?");
    expect((await t.as<{ id: string }>(seller, "select id from public.list_conversations()")).rows.map((r) => r.id)).toContain(convId);
  });
});

describe("Blockieren", () => {
  it("verhindert Nachrichten in beide Richtungen und neue Unterhaltungen", async () => {
    await t.as(seller, "select public.block_user($1)", [buyer]);
    await expect(send(buyer, convId, "Hallo?")).rejects.toThrow(/blocked/);
    await expect(send(seller, convId, "Doch noch was")).rejects.toThrow(/blocked/);
    await expect(t.as(buyer, "select public.start_conversation($1)", [listingId])).rejects.toThrow(/blocked/);
    const head = await t.as<{ get_conversation: { i_blocked: boolean; blocked_me: boolean } }>(
      buyer,
      "select public.get_conversation($1)",
      [convId],
    );
    expect(head.rows[0].get_conversation).toMatchObject({ i_blocked: false, blocked_me: true });
  });

  it("zeigt Sperren nur der sperrenden Person und hebt sie wieder auf", async () => {
    expect((await t.as(buyer, "select * from public.blocks")).rows).toHaveLength(0);
    expect((await t.as(seller, "select * from public.blocks")).rows).toHaveLength(1);
    await t.as(seller, "select public.unblock_user($1)", [buyer]);
    await send(buyer, convId, "Danke fürs Entsperren");
  });
});

describe("Melden", () => {
  it("lässt nur Beteiligte eine Unterhaltung melden", async () => {
    await expect(t.as(stranger, "select public.report_conversation($1, 'scam', null)", [convId])).rejects.toThrow(/not_found/);
    await expect(
      t.as(stranger, "insert into public.reports (conversation_id, reason) values ($1, 'scam')", [convId]),
    ).rejects.toThrow(/permission denied/);
  });

  it("macht eine gemeldete Unterhaltung für das Team lesbar", async () => {
    await t.as(seller, "select public.report_conversation($1, 'scam', 'Will per Freunde-Option zahlen')", [convId]);
    await expect(t.as(seller, "select public.report_conversation($1, 'spam', null)", [convId])).rejects.toThrow(
      /already_reported/,
    );
    const list = await t.as<{ conversation_id: string; conversation_title: string }>(mod, "select * from public.list_open_reports()");
    expect(list.rows[0]).toMatchObject({ conversation_id: convId, conversation_title: "Lorcana Elsa Enchanted" });
    const conv = await t.as<{ moderation_conversation: { seller: string; buyer: string; messages: { from: string; body: string }[] } }>(
      mod,
      "select public.moderation_conversation($1)",
      [convId],
    );
    expect(conv.rows[0].moderation_conversation.seller).toBe("Haendlerin");
    expect(conv.rows[0].moderation_conversation.messages[0]).toMatchObject({ from: "Interessent", body: "Hallo! Ist die Elsa noch da?" });
    await expect(t.as(buyer, "select public.moderation_conversation($1)", [convId])).rejects.toThrow(/forbidden/);
  });
});

describe("Inserat und Konto löschen", () => {
  it("behält die Unterhaltung mit Titel, wenn das Inserat gelöscht wird", async () => {
    await t.as(seller, "select public.delete_listing($1)", [listingId]);
    const head = await t.as<{ get_conversation: { listing_id: string | null; listing_title: string } }>(
      buyer,
      "select public.get_conversation($1)",
      [convId],
    );
    expect(head.rows[0].get_conversation).toMatchObject({ listing_id: null, listing_title: "Lorcana Elsa Enchanted" });
  });

  it("löscht Unterhaltungen und Nachrichten mit dem Konto", async () => {
    await t.as(buyer, "select public.delete_own_account()");
    const c = await t.db.query("select 1 from public.conversations where buyer_id = $1", [buyer]);
    const m = await t.db.query("select 1 from public.messages where sender_id = $1", [buyer]);
    expect(c.rows).toHaveLength(0);
    expect(m.rows).toHaveLength(0);
  });

  it("liefert neue Nachrichten per Echtzeit aus", async () => {
    const r = await t.db.query<{ tablename: string }>(
      "select tablename from pg_publication_tables where pubname = 'supabase_realtime'",
    );
    expect(r.rows.map((x) => x.tablename)).toContain("messages");
  });
});
