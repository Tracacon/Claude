// Prüft die Phase-2-Migration (Marktplatz, Fotos, Meldungen, Moderation) gegen echtes Postgres.
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, uid } from "./helpers";

let t: Awaited<ReturnType<typeof createDb>>;
const seller = uid(1);
const buyer = uid(2);
const mod = uid(3);
const newbie = uid(4);
const photo = (n: number) => `10000000-0000-0000-0000-${n.toString(16).padStart(12, "0")}`;

const glurak = {
  title: "Glurak ex 199/165 Pokémon 151",
  description: "Special Illustration Rare, direkt aus dem Pack in die Hülle.",
  tcg: "pokemon",
  kind: "single",
  offer: "sell",
  price_cents: 12500,
  negotiable: true,
  condition: "near_mint",
  card_language: "de",
  grading: "",
  city: "Stuttgart",
  handover_event: true,
  photos: [photo(1), photo(2)],
};

async function create(user: string, p: Record<string, unknown>) {
  const r = await t.as<{ create_listing: string }>(user, "select public.create_listing($1::jsonb)", [JSON.stringify(p)]);
  return r.rows[0].create_listing;
}

async function search(user: string | null, args: Record<string, unknown> = {}) {
  const r = await t.as<{ id: string; title: string; total_count: number; cover_photo_id: string | null; owner_nickname: string }>(
    user,
    `select * from public.search_listings(p_query => $1, p_tcg => $2::public.tcg, p_offer => $3::public.listing_offer,
       p_min_cents => $4, p_max_cents => $5, p_sort => coalesce($6, 'newest'))`,
    [args.q ?? null, args.tcg ?? null, args.offer ?? null, args.min ?? null, args.max ?? null, args.sort ?? null],
  );
  return r.rows;
}

let glurakId: string;
let luffyId: string;

beforeAll(async () => {
  t = await createDb();
  await t.member(seller, "Verkaeufer");
  await t.member(buyer, "Kaeufer");
  await t.member(mod, "Moderatorin");
  await t.signUp(newbie, "neu@example.com"); // Begrüßung nicht abgeschlossen
  await t.db.query("update public.profiles set role = 'team' where id = $1", [mod]);
});

describe("Inserat anlegen", () => {
  it("legt ein Inserat mit Fotos an", async () => {
    glurakId = await create(seller, glurak);
    const r = await t.db.query<{ status: string; owner_id: string; n: number }>(
      "select status, owner_id, (select count(*)::int from public.listing_photos where listing_id = l.id) as n from public.listings l where id = $1",
      [glurakId],
    );
    expect(r.rows[0]).toEqual({ status: "active", owner_id: seller, n: 2 });
  });

  it("legt ein Tauschangebot ohne Preis an", async () => {
    luffyId = await create(seller, {
      title: "Suche Luffy Leader Alt Art",
      tcg: "one_piece",
      offer: "trade",
      price_cents: 999,
      handover_event: true,
    });
    const r = await t.db.query<{ price_cents: number | null }>("select price_cents from public.listings where id = $1", [luffyId]);
    expect(r.rows[0].price_cents).toBeNull();
  });

  it("verlangt einen Preis beim Verkauf", async () => {
    await expect(create(seller, { ...glurak, price_cents: null, photos: [] })).rejects.toThrow(/listings_price_for_sale/);
  });

  it("verlangt mindestens eine Übergabeart", async () => {
    await expect(
      create(seller, { ...glurak, handover_event: false, handover_pickup: false, handover_shipping: false, photos: [] }),
    ).rejects.toThrow(/listings_handover/);
  });

  it("verlangt eine abgeschlossene Begrüßung", async () => {
    await expect(create(newbie, { ...glurak, photos: [] })).rejects.toThrow(/profile_incomplete/);
  });

  it("verbietet Inserate ohne Anmeldung", async () => {
    await expect(create(null as unknown as string, { ...glurak, photos: [] })).rejects.toThrow(/permission denied/);
  });

  it("erlaubt höchstens 6 Fotos", async () => {
    const photos = [11, 12, 13, 14, 15, 16, 17].map(photo);
    await expect(create(seller, { ...glurak, photos })).rejects.toThrow(/too_many_photos/);
  });

  it("verhindert gefälschten Eigentümer und Status beim direkten Einfügen", async () => {
    await expect(
      t.as(buyer, "insert into public.listings (owner_id, title, tcg, price_cents) values ($1, 'Fake', 'pokemon', 1)", [seller]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.as(buyer, "insert into public.listings (title, tcg, price_cents, status) values ('Fake', 'pokemon', 1, 'removed')"),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("Suche", () => {
  it("findet aktive Inserate auch ohne Anmeldung, mit Verkäufer und Titelbild", async () => {
    const rows = await search(null);
    expect(rows.map((r) => r.id)).toEqual([luffyId, glurakId]);
    expect(rows[1].owner_nickname).toBe("Verkaeufer");
    expect(rows[1].cover_photo_id).toBe(photo(1));
    expect(Number(rows[0].total_count)).toBe(2);
  });

  it("sucht im Text, auch mit Wortstamm und Teilwort", async () => {
    expect((await search(null, { q: "glurak" })).map((r) => r.id)).toEqual([glurakId]);
    expect((await search(null, { q: "Hüllen" })).map((r) => r.id)).toEqual([glurakId]);
    expect((await search(null, { q: "Glur" })).map((r) => r.id)).toEqual([glurakId]);
    expect(await search(null, { q: "Lorcana Mickey" })).toHaveLength(0);
  });

  it("filtert nach Spiel, Angebotsart und Preis", async () => {
    expect((await search(null, { tcg: "one_piece" })).map((r) => r.id)).toEqual([luffyId]);
    expect((await search(null, { offer: "trade" })).map((r) => r.id)).toEqual([luffyId]);
    expect((await search(null, { min: 10000, max: 20000 })).map((r) => r.id)).toEqual([glurakId]);
    expect(await search(null, { max: 5000 })).toHaveLength(0);
  });

  it("behandelt Sonderzeichen in der Suche sicher", async () => {
    expect(await search(null, { q: "%' or 1=1 --" })).toHaveLength(0);
    expect(await search(null, { q: "100%" })).toHaveLength(0);
  });

  it("zeigt die Detailansicht mit Fotos öffentlich", async () => {
    const r = await t.as<{ get_listing: { listing: { title: string }; photos: string[]; is_owner: boolean; owner: { nickname: string } } }>(
      null,
      "select public.get_listing($1)",
      [glurakId],
    );
    expect(r.rows[0].get_listing.listing.title).toBe(glurak.title);
    expect(r.rows[0].get_listing.photos).toEqual([photo(1), photo(2)]);
    expect(r.rows[0].get_listing.owner.nickname).toBe("Verkaeufer");
    expect(r.rows[0].get_listing.is_owner).toBe(false);
  });
});

describe("Bearbeiten, Status, Löschen", () => {
  it("bearbeitet das eigene Inserat und gibt entfernte Fotos zurück", async () => {
    const r = await t.as<{ update_listing: string[] }>(seller, "select public.update_listing($1, $2::jsonb)", [
      glurakId,
      JSON.stringify({ ...glurak, price_cents: 11000, photos: [photo(2), photo(3)] }),
    ]);
    expect(r.rows[0].update_listing).toEqual([photo(1)]);
    const photos = await t.db.query<{ id: string; position: number }>(
      "select id, position from public.listing_photos where listing_id = $1 order by position",
      [glurakId],
    );
    expect(photos.rows).toEqual([
      { id: photo(2), position: 0 },
      { id: photo(3), position: 1 },
    ]);
  });

  it("verhindert das Bearbeiten fremder Inserate", async () => {
    await expect(
      t.as(buyer, "select public.update_listing($1, $2::jsonb)", [glurakId, JSON.stringify({ ...glurak, title: "Gehackt" })]),
    ).rejects.toThrow(/not_found/);
    const r = await t.as(buyer, "update public.listings set title = 'Gehackt' where id = $1", [glurakId]);
    expect(r.affectedRows).toBe(0);
  });

  it("verhindert, dass Fremde Fotos an ein Inserat hängen oder löschen", async () => {
    await expect(
      t.as(buyer, "insert into public.listing_photos (id, listing_id, position) values ($1, $2, 5)", [photo(40), glurakId]),
    ).rejects.toThrow(/row-level security/);
    const r = await t.as(buyer, "delete from public.listing_photos where listing_id = $1", [glurakId]);
    expect(r.affectedRows).toBe(0);
  });

  it("ändert den Status; erledigte Inserate verschwinden aus der Suche", async () => {
    await t.as(seller, "select public.set_listing_status($1, 'reserved')", [luffyId]);
    expect((await search(null)).map((r) => r.id)).toContain(luffyId);
    await t.as(seller, "select public.set_listing_status($1, 'done')", [luffyId]);
    expect((await search(null)).map((r) => r.id)).not.toContain(luffyId);
    const mine = await t.as<{ id: string; status: string }>(seller, "select id, status from public.my_listings()");
    expect(mine.rows.find((m) => m.id === luffyId)?.status).toBe("done");
  });

  it("verhindert, dass Eigentümer ihr Inserat selbst auf 'entfernt' setzen", async () => {
    await expect(t.as(seller, "select public.set_listing_status($1, 'removed')", [luffyId])).rejects.toThrow(/forbidden/);
    await expect(t.as(seller, "update public.listings set status = 'removed' where id = $1", [luffyId])).rejects.toThrow(
      /forbidden|removed_reason/,
    );
  });

  it("löscht das eigene Inserat samt Fotos", async () => {
    const id = await create(seller, { ...glurak, title: "Zum Löschen", photos: [photo(20)] });
    const r = await t.as<{ delete_listing: string[] }>(seller, "select public.delete_listing($1)", [id]);
    expect(r.rows[0].delete_listing).toEqual([photo(20)]);
    const left = await t.db.query("select 1 from public.listing_photos where id = $1", [photo(20)]);
    expect(left.rows).toHaveLength(0);
    await expect(t.as(buyer, "select public.delete_listing($1)", [glurakId])).rejects.toThrow(/not_found/);
  });
});

describe("Melden und Moderation", () => {
  let reportId: string;

  it("erlaubt das Melden fremder Inserate, aber nur einmal", async () => {
    await t.as(buyer, "select public.report_content($1, null, 'counterfeit', 'Sieht nach Fake aus')", [glurakId]);
    await expect(t.as(buyer, "select public.report_content($1, null, 'spam', null)", [glurakId])).rejects.toThrow(
      /already_reported/,
    );
  });

  it("verbietet das Melden eigener Inhalte", async () => {
    await expect(t.as(seller, "select public.report_content($1, null, 'spam', null)", [glurakId])).rejects.toThrow(
      /cannot_report_own/,
    );
  });

  it("erlaubt das Melden von Profilen", async () => {
    await t.as(buyer, "select public.report_content(null, $1, 'offensive', 'Beleidigender Nickname')", [seller]);
  });

  it("zeigt Meldungen nur dem Team", async () => {
    await expect(t.as(buyer, "select * from public.list_open_reports()")).rejects.toThrow(/forbidden/);
    const sellerSees = await t.as(seller, "select * from public.reports");
    expect(sellerSees.rows).toHaveLength(0);
    const r = await t.as<{ id: string; listing_title: string | null; profile_nickname: string | null; reporter_nickname: string }>(
      mod,
      "select * from public.list_open_reports()",
    );
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].listing_title).toBe(glurak.title);
    expect(r.rows[0].reporter_nickname).toBe("Kaeufer");
    expect(r.rows[1].profile_nickname).toBe("Verkaeufer");
    reportId = r.rows[1].id;
    const count = await t.as<{ open_report_count: number }>(mod, "select public.open_report_count()");
    expect(Number(count.rows[0].open_report_count)).toBe(2);
    const countBuyer = await t.as<{ open_report_count: number }>(buyer, "select public.open_report_count()");
    expect(Number(countBuyer.rows[0].open_report_count)).toBe(0);
  });

  it("verlangt eine Begründung zum Entfernen und verbietet Mitgliedern das Moderieren", async () => {
    await expect(t.as(mod, "select public.moderate_listing($1, 'remove', '  ')", [glurakId])).rejects.toThrow(
      /reason_required/,
    );
    await expect(t.as(buyer, "select public.moderate_listing($1, 'remove', 'weg')", [glurakId])).rejects.toThrow(
      /forbidden/,
    );
  });

  it("entfernt ein Inserat mit Begründung und erledigt die Meldungen dazu", async () => {
    await t.as(mod, "select public.moderate_listing($1, 'remove', 'Fälschung laut Prüfung')", [glurakId]);
    expect((await search(null)).map((r) => r.id)).not.toContain(glurakId);

    const owner = await t.as<{ get_listing: { listing: { status: string; removed_reason: string } } }>(
      seller,
      "select public.get_listing($1)",
      [glurakId],
    );
    expect(owner.rows[0].get_listing.listing.status).toBe("removed");
    expect(owner.rows[0].get_listing.listing.removed_reason).toBe("Fälschung laut Prüfung");

    const stranger = await t.as<{ get_listing: unknown }>(buyer, "select public.get_listing($1)", [glurakId]);
    expect(stranger.rows[0]?.get_listing ?? null).toBeNull();

    const open = await t.as<{ id: string }>(mod, "select * from public.list_open_reports()");
    expect(open.rows).toHaveLength(1);
  });

  it("verhindert, dass Eigentümer ein entferntes Inserat bearbeiten oder reaktivieren", async () => {
    await expect(t.as(seller, "select public.set_listing_status($1, 'active')", [glurakId])).rejects.toThrow(
      /listing_removed/,
    );
    await expect(
      t.as(seller, "select public.update_listing($1, $2::jsonb)", [glurakId, JSON.stringify({ ...glurak, photos: [] })]),
    ).rejects.toThrow(/listing_removed/);
  });

  it("gibt ein entferntes Inserat wieder frei", async () => {
    await t.as(mod, "select public.moderate_listing($1, 'restore')", [glurakId]);
    expect((await search(null)).map((r) => r.id)).toContain(glurakId);
  });

  it("schließt eine Meldung ohne Entfernen ab", async () => {
    await t.as(mod, "select public.close_report($1, 'dismissed', 'Kein Verstoß')", [reportId]);
    const open = await t.as(mod, "select * from public.list_open_reports()");
    expect(open.rows).toHaveLength(0);
    const own = await t.as<{ status: string }>(buyer, "select status from public.reports where id = $1", [reportId]);
    expect(own.rows[0].status).toBe("dismissed");
  });
});

describe("Foto-Speicher", () => {
  it("erlaubt Uploads nur in den eigenen Ordner mit gültigem Namen", async () => {
    await t.as(seller, "insert into storage.objects (bucket_id, name) values ('listing-photos', $1)", [
      `${seller}/${photo(50)}.jpg`,
    ]);
    await t.as(seller, "insert into storage.objects (bucket_id, name) values ('listing-photos', $1)", [
      `${seller}/${photo(50)}_t.jpg`,
    ]);
    await expect(
      t.as(buyer, "insert into storage.objects (bucket_id, name) values ('listing-photos', $1)", [`${seller}/${photo(51)}.jpg`]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      t.as(seller, "insert into storage.objects (bucket_id, name) values ('listing-photos', $1)", [`${seller}/evil.html`]),
    ).rejects.toThrow(/row-level security/);
  });

  it("erlaubt das Löschen nur im eigenen Ordner", async () => {
    const r = await t.as(buyer, "delete from storage.objects where name like $1", [`${seller}/%`]);
    expect(r.affectedRows).toBe(0);
  });

  it("legt den Bucket öffentlich mit Größen- und Typgrenze an", async () => {
    const b = await t.db.query<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>(
      "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'listing-photos'",
    );
    expect(b.rows[0]).toEqual({ public: true, file_size_limit: 2097152, allowed_mime_types: ["image/jpeg", "image/webp"] });
  });
});

describe("Konto löschen", () => {
  it("löscht mit dem Konto auch Inserate und Fotos", async () => {
    await t.as(seller, "select public.delete_own_account()");
    const l = await t.db.query("select 1 from public.listings where owner_id = $1", [seller]);
    const p = await t.db.query("select 1 from public.listing_photos where owner_id = $1", [seller]);
    expect(l.rows).toHaveLength(0);
    expect(p.rows).toHaveLength(0);
  });
});
