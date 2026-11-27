// Sicherheit: Grenzen gegen Missbrauch (Migration 20261127120000).
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, uid } from "./helpers";

let t: Awaited<ReturnType<typeof createDb>>;
const ana = uid(151);
const ben = uid(152);

beforeAll(async () => {
  t = await createDb();
  await t.member(ana, "Ana");
  await t.member(ben, "Ben");
});

const upload = (user: string, n: number) =>
  t.as(user, "insert into storage.objects (bucket_id, name, owner, owner_id) values ('post-photos', $1, auth.uid(), auth.uid()::text)", [
    `${user}/${uid(10000 + n)}.jpg`,
  ]);

describe("Foto-Uploads", () => {
  it("höchstens 120 pro Stunde je Person, andere sind nicht betroffen", async () => {
    // 119 alte Uploads der letzten Stunde direkt anlegen, dann zählt der nächste als 120.
    await t.db.query(
      "insert into storage.objects (bucket_id, name, owner, owner_id, created_at) select 'post-photos', $1 || '/alt' || g || '.jpg', $1::uuid, $1, now() - interval '5 minutes' from generate_series(1, 119) g",
      [ana],
    );
    await upload(ana, 1);
    await expect(upload(ana, 2)).rejects.toThrow(/row-level security/);
    await upload(ben, 3);
  });

  it("ältere Uploads zählen nach einer Stunde nicht mehr (bis zur Tagesgrenze)", async () => {
    await t.db.query("update storage.objects set created_at = now() - interval '2 hours' where owner_id = $1", [ana]);
    await upload(ana, 4);
  });
});

describe("Likes und Meldungen", () => {
  it("Likes haben eine Stundengrenze", async () => {
    const trig = await t.db.query("select 1 from pg_trigger where tgname = 'post_likes_limit'");
    expect(trig.rows).toHaveLength(1);
    const src = (await t.db.query<{ prosrc: string }>("select prosrc from pg_proc where proname = 'post_likes_limit'")).rows[0].prosrc;
    expect(src).toMatch(/>= 300/);
  });

  it("höchstens 20 Meldungen pro Stunde", async () => {
    await t.db.query(
      "insert into public.reports (reporter_id, profile_id, reason, status) select $1, $2, 'spam', 'dismissed' from generate_series(1, 20)",
      [ana, ben],
    );
    await expect(t.as(ana, "select public.report_content(null, $1, 'spam', null)", [ben])).rejects.toThrow(/rate_limited/);
    await t.as(ben, "select public.report_content(null, $1, 'spam', null)", [ana]);
  });
});
