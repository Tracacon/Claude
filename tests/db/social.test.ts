// Prüft die Social-Migration: Privatsphäre, Folgen, Abzeichen, Profilbild, Fotos im Chat.
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, uid } from "./helpers";

let t: Awaited<ReturnType<typeof createDb>>;
const ana = uid(21); // öffentliches Profil
const ben = uid(22); // privates Profil mit Bestätigung
const cem = uid(23);
const dora = uid(24); // Team
const photo = (n: number) => `30000000-0000-0000-0000-${n.toString(16).padStart(12, "0")}`;

type Prof = {
  id: string;
  nickname: string;
  can_view: boolean;
  avatar_id: string | null;
  bio: string | null;
  follower_count: number;
  following_count: number;
  listing_count: number;
  my_follow: string;
  follows_me: boolean;
  badges: string[];
  is_me: boolean;
};

async function profile(viewer: string | null, nickname: string) {
  const r = await t.as<{ get_profile: Prof }>(viewer, "select public.get_profile($1)", [nickname]);
  return r.rows[0].get_profile;
}

beforeAll(async () => {
  t = await createDb();
  await t.member(ana, "Ana");
  await t.member(ben, "Ben");
  await t.member(cem, "Cem");
  await t.member(dora, "Dora");
  await t.db.query("update public.profiles set role = 'team' where id = $1", [dora]);
  await t.as(ana, "update public.profiles set bio = 'Pokémon seit 1999' where id = auth.uid()");
  await t.as(ben, "update public.profiles set bio = 'Geheim' where id = auth.uid()");
  await t.as(ben, "select public.update_privacy('followers', true)");
  await t.as(ana, "select public.set_avatar($1)", [photo(1)]);
  await t.as(ben, "select public.set_avatar($1)", [photo(2)]);
  await t.as(ana, "select public.create_listing($1::jsonb)", [
    JSON.stringify({ title: "Display 151", tcg: "pokemon", kind: "sealed", offer: "sell", price_cents: 15000, handover_event: true }),
  ]);
  await t.as(ben, "select public.create_listing($1::jsonb)", [
    JSON.stringify({ title: "Luffy Gear 5", tcg: "one_piece", kind: "sealed", offer: "trade", handover_event: true }),
  ]);
});

describe("Privatsphäre", () => {
  it("zeigt öffentliche Profile auch ohne Anmeldung vollständig", async () => {
    const p = await profile(null, "ana");
    expect(p).toMatchObject({ nickname: "Ana", can_view: true, avatar_id: photo(1), bio: "Pokémon seit 1999", listing_count: 1 });
  });

  it("verbirgt bei privaten Profilen Bild, Beschreibung und Inserate auf der Profilseite", async () => {
    const p = await profile(cem, "ben");
    expect(p).toMatchObject({ nickname: "Ben", can_view: false, avatar_id: null, bio: null, listing_count: 1 });
    const listings = await t.as(cem, "select * from public.profile_listings('ben')");
    expect(listings.rows).toHaveLength(0);
    expect((await profile(null, "ben")).can_view).toBe(false);
  });

  it("zeigt das eigene private Profil und dem Team vollständig", async () => {
    expect(await profile(ben, "ben")).toMatchObject({ can_view: true, is_me: true, bio: "Geheim" });
    expect((await profile(dora, "ben")).can_view).toBe(true);
  });

  it("lässt private Inserate im Marktplatz trotzdem sichtbar", async () => {
    const r = await t.as<{ title: string }>(null, "select title from public.search_listings()");
    expect(r.rows.map((x) => x.title)).toContain("Luffy Gear 5");
  });

  it("verhindert das Auslesen fremder Profile an der Funktion vorbei", async () => {
    const r = await t.as(cem, "select bio from public.profiles where id = $1", [ben]);
    expect(r.rows).toHaveLength(0);
    await expect(t.as(null, "select * from public.profiles")).rejects.toThrow(/permission denied/);
  });

  it("lässt Privatsphäre und Profilbild nur über die Funktionen ändern", async () => {
    await expect(t.as(cem, "update public.profiles set profile_visibility = 'followers' where id = auth.uid()")).rejects.toThrow(
      /permission denied/,
    );
    await expect(t.as(cem, "select public.update_privacy('niemand', false)")).rejects.toThrow(/profiles_visibility_valid/);
  });
});

describe("Folgen", () => {
  it("folgt öffentlichen Profilen sofort", async () => {
    const r = await t.as<{ follow_user: string }>(cem, "select public.follow_user($1)", [ana]);
    expect(r.rows[0].follow_user).toBe("accepted");
    expect(await profile(cem, "ana")).toMatchObject({ my_follow: "accepted", follower_count: 1 });
    expect(await profile(ana, "cem")).toMatchObject({ follows_me: true, following_count: 1 });
  });

  it("stellt bei Bestätigungspflicht eine Anfrage", async () => {
    const r = await t.as<{ follow_user: string }>(cem, "select public.follow_user($1)", [ben]);
    expect(r.rows[0].follow_user).toBe("pending");
    expect(await profile(cem, "ben")).toMatchObject({ my_follow: "pending", can_view: false, follower_count: 0 });
    const req = await t.as<{ nickname: string }>(ben, "select * from public.my_follow_requests()");
    expect(req.rows.map((x) => x.nickname)).toEqual(["Cem"]);
    const n = await t.as<{ pending_follow_request_count: number }>(ben, "select public.pending_follow_request_count()");
    expect(n.rows[0].pending_follow_request_count).toBe(1);
  });

  it("zeigt nach Annahme das private Profil dem Follower", async () => {
    await expect(t.as(ana, "select public.respond_follow_request($1, true)", [cem])).rejects.toThrow(/not_found/);
    await t.as(ben, "select public.respond_follow_request($1, true)", [cem]);
    expect(await profile(cem, "ben")).toMatchObject({ my_follow: "accepted", can_view: true, bio: "Geheim", avatar_id: photo(2) });
    expect((await t.as(cem, "select * from public.profile_listings('ben')")).rows).toHaveLength(1);
  });

  it("lehnt Anfragen ab und entfernt Follower", async () => {
    await t.as(ana, "select public.follow_user($1)", [ben]);
    await t.as(ben, "select public.respond_follow_request($1, false)", [ana]);
    expect((await profile(ana, "ben")).my_follow).toBe("none");
    await t.as(ben, "select public.remove_follower($1)", [cem]);
    expect((await profile(cem, "ben")).can_view).toBe(false);
  });

  it("nimmt offene Anfragen an, wenn die Bestätigung abgeschaltet wird", async () => {
    await t.as(cem, "select public.follow_user($1)", [ben]);
    await t.as(ben, "select public.update_privacy('followers', false)");
    expect((await profile(cem, "ben")).my_follow).toBe("accepted");
  });

  it("listet Follower und gefolgte Personen mit Bild nur bei Berechtigung", async () => {
    const followers = await t.as<{ nickname: string; avatar_id: string | null; my_follow: string }>(
      ana,
      "select * from public.list_follows('ben', 'followers')",
    );
    expect(followers.rows).toHaveLength(0); // Ana darf Bens Listen nicht sehen
    const ownFollowers = await t.as<{ nickname: string }>(ben, "select * from public.list_follows('ben', 'followers')");
    expect(ownFollowers.rows.map((x) => x.nickname)).toEqual(["Cem"]);
    const following = await t.as<{ nickname: string; avatar_id: string | null; my_follow: string }>(
      ana,
      "select * from public.list_follows('cem', 'following')",
    );
    const byName = Object.fromEntries(following.rows.map((x) => [x.nickname, x]));
    expect(byName.Ana).toMatchObject({ avatar_id: photo(1) });
    expect(byName.Ben).toMatchObject({ avatar_id: null }); // privat, Ana folgt nicht
  });

  it("verbietet direktes Schreiben, Selbst-Folgen und Folgen trotz Sperre", async () => {
    await expect(
      t.as(ana, "insert into public.follows (follower_id, following_id, status) values (auth.uid(), $1, 'accepted')", [ben]),
    ).rejects.toThrow(/permission denied/);
    await expect(t.as(ana, "select public.follow_user($1)", [ana])).rejects.toThrow(/invalid_action/);
    await t.as(ana, "select public.block_user($1)", [cem]);
    expect((await profile(cem, "ana")).my_follow).toBe("none"); // Sperre entfernt das Folgen
    await expect(t.as(cem, "select public.follow_user($1)", [ana])).rejects.toThrow(/blocked/);
    await t.as(ana, "select public.unblock_user($1)", [cem]);
  });

  it("entfolgt", async () => {
    await t.as(cem, "select public.follow_user($1)", [ana]);
    await t.as(cem, "select public.unfollow_user($1)", [ana]);
    expect((await profile(cem, "ana")).my_follow).toBe("none");
  });
});

describe("Abzeichen und Profilbild", () => {
  it("vergibt Abzeichen aus vorhandenen Daten", async () => {
    expect((await profile(null, "ana")).badges).toEqual(expect.arrayContaining(["founder", "first_listing"]));
    expect((await profile(null, "dora")).badges).toContain("team");
    expect((await profile(null, "cem")).badges).not.toContain("first_listing");
  });

  it("gibt beim Wechsel des Profilbilds das alte zurück", async () => {
    const r = await t.as<{ set_avatar: string }>(ana, "select public.set_avatar($1)", [photo(9)]);
    expect(r.rows[0].set_avatar).toBe(photo(1));
  });

  it("erlaubt Profilbild-Uploads nur in den eigenen Ordner", async () => {
    await t.as(ana, "insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${ana}/${photo(9)}.jpg`]);
    await expect(
      t.as(ana, "insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${ben}/${photo(10)}.jpg`]),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("Fotos im Chat", () => {
  let conv: string;
  let listing: string;

  beforeAll(async () => {
    const l = await t.as<{ id: string }>(null, "select id from public.search_listings(p_query => 'Display')");
    listing = l.rows[0].id;
    const r = await t.as<{ start_conversation: string }>(cem, "select public.start_conversation($1)", [listing]);
    conv = r.rows[0].start_conversation;
  });

  it("erlaubt Uploads nur Beteiligten in den Ordner der Unterhaltung", async () => {
    await t.as(cem, "insert into storage.objects (bucket_id, name, owner) values ('chat-photos', $1, auth.uid())", [
      `${conv}/${photo(30)}.jpg`,
    ]);
    await expect(
      t.as(ben, "insert into storage.objects (bucket_id, name, owner) values ('chat-photos', $1, auth.uid())", [
        `${conv}/${photo(31)}.jpg`,
      ]),
    ).rejects.toThrow(/row-level security/);
  });

  it("sendet ein Foto ohne Text und lehnt fremde oder fehlende Fotos ab", async () => {
    const r = await t.as<{ photo_id: string; body: string }>(cem, "select * from public.send_message($1, '', $2)", [conv, photo(30)]);
    expect(r.rows[0]).toMatchObject({ photo_id: photo(30), body: "" });
    await expect(t.as(ana, "select * from public.send_message($1, 'Schau', $2)", [conv, photo(30)])).rejects.toThrow(
      /photo_missing/,
    );
    await expect(t.as(cem, "select * from public.send_message($1, '', $2)", [conv, photo(99)])).rejects.toThrow(/photo_missing/);
    await expect(t.as(cem, "select * from public.send_message($1, '  ')", [conv])).rejects.toThrow(/messages_content/);
  });

  it("zeigt Chat-Fotos nur Beteiligten; dem Team erst nach einer Meldung", async () => {
    const seen = (user: string) =>
      t.as(user, "select name from storage.objects where bucket_id = 'chat-photos'").then((r) => r.rows.length);
    expect(await seen(cem)).toBe(1);
    expect(await seen(ana)).toBe(1);
    expect(await seen(ben)).toBe(0);
    expect(await seen(dora)).toBe(0);
    await t.as(ana, "select public.report_conversation($1, 'offensive', null)", [conv]);
    expect(await seen(dora)).toBe(1);
    const mod = await t.as<{ moderation_conversation: { messages: { photo_id: string }[] } }>(
      dora,
      "select public.moderation_conversation($1)",
      [conv],
    );
    expect(mod.rows[0].moderation_conversation.messages[0].photo_id).toBe(photo(30));
  });

  it("zeigt in der Chatliste ein Foto-Kennzeichen und das Profilbild bei Berechtigung", async () => {
    const r = await t.as<{ last_has_photo: boolean; other_avatar_id: string | null }>(ana, "select * from public.list_conversations()");
    expect(r.rows[0]).toMatchObject({ last_has_photo: true, other_avatar_id: null }); // Cem hat kein Bild
    const c = await t.as<{ other_avatar_id: string | null }>(cem, "select * from public.list_conversations()");
    expect(c.rows[0].other_avatar_id).toBe(photo(9));
  });
});
