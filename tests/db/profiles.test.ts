// Prüft die Phase-1-Migration gegen eine echte Postgres-Instanz (PGlite).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const migrationsDir = join(root, "supabase", "migrations");

let db: PGlite;
const ids = {
  admin: "00000000-0000-0000-0000-00000000000a",
  alice: "00000000-0000-0000-0000-0000000000a1",
  bob: "00000000-0000-0000-0000-0000000000b0",
};

/** Führt SQL als angemeldeter Nutzer aus (wie PostgREST mit JWT). */
async function as<T = Record<string, unknown>>(userId: string | null, sql: string, params: unknown[] = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.exec(userId ? "set role authenticated" : "set role anon");
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

async function signUp(id: string, email: string, locale?: string) {
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
    id,
    email,
    JSON.stringify(locale ? { locale } : {}),
  ]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(__dirname, "supabase-stub.sql"), "utf8"));
  for (const file of readdirSync(migrationsDir).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }
  await signUp(ids.admin, "admin@tracacon.de");
  await signUp(ids.alice, "alice@example.com", "en");
  await signUp(ids.bob, "bob@example.com", "xx");
  // Erster Admin wird wie im Handbuch beschrieben direkt per SQL gesetzt.
  await db.query("update public.profiles set role = 'admin' where id = $1", [ids.admin]);
});

describe("Registrierung", () => {
  it("legt bei jeder Registrierung ein Profil an", async () => {
    const r = await db.query<{ id: string; role: string; locale: string }>(
      "select id, role, locale from public.profiles order by id",
    );
    expect(r.rows).toHaveLength(3);
    const alice = r.rows.find((p) => p.id === ids.alice)!;
    expect(alice.role).toBe("member");
    expect(alice.locale).toBe("en");
    expect(r.rows.find((p) => p.id === ids.bob)!.locale).toBe("de");
  });
});

describe("Begrüßung", () => {
  it("verweigert den Abschluss ohne Altersbestätigung", async () => {
    await expect(as(ids.alice, "select public.complete_onboarding('Alice', false, true)")).rejects.toThrow(
      /age_not_confirmed/,
    );
  });

  it("verweigert den Abschluss ohne Community-Regeln", async () => {
    await expect(as(ids.alice, "select public.complete_onboarding('Alice', true, false)")).rejects.toThrow(
      /terms_not_accepted/,
    );
  });

  it("schließt mit gültigen Angaben ab und setzt die Zeitstempel", async () => {
    await as(ids.alice, "select public.complete_onboarding('Alice_TCG', true, true)");
    const r = await db.query<{ nickname: string; age_confirmed_at: Date | null }>(
      "select nickname, age_confirmed_at from public.profiles where id = $1",
      [ids.alice],
    );
    expect(r.rows[0].nickname).toBe("Alice_TCG");
    expect(r.rows[0].age_confirmed_at).not.toBeNull();
  });

  it("lehnt doppelte Nicknames unabhängig von Groß- und Kleinschreibung ab", async () => {
    await expect(as(ids.bob, "select public.complete_onboarding('alice_tcg', true, true)")).rejects.toThrow(
      /profiles_nickname_unique/,
    );
  });

  it("lehnt ungültige Nicknames ab", async () => {
    await expect(as(ids.bob, "select public.complete_onboarding('<script>', true, true)")).rejects.toThrow(
      /profiles_nickname_format/,
    );
  });

  it("erlaubt keinen Nickname ohne Bestätigungen am Ablauf vorbei", async () => {
    await expect(as(ids.bob, "update public.profiles set nickname = 'Bob' where id = auth.uid()")).rejects.toThrow(
      /profiles_onboarding_complete/,
    );
  });
});

describe("Zugriffsregeln", () => {
  it("zeigt Nutzern ohne Anmeldung keine Profile", async () => {
    await expect(as(null, "select * from public.profiles")).rejects.toThrow(/permission denied/);
  });

  it("zeigt angemeldeten Nutzern das eigene und alle fertigen Profile", async () => {
    const r = await as<{ id: string }>(ids.bob, "select id from public.profiles order by id");
    const seen = r.rows.map((p) => p.id);
    expect(seen).toContain(ids.bob); // eigenes, noch unfertiges Profil
    expect(seen).toContain(ids.alice); // fertiges Profil
    expect(seen).not.toContain(ids.admin); // fremdes, unfertiges Profil
  });

  it("erlaubt das Bearbeiten des eigenen Profils", async () => {
    await as(ids.alice, "update public.profiles set city = 'Stuttgart', bio = 'Pokémon-Sammlerin' where id = $1", [
      ids.alice,
    ]);
    const r = await db.query<{ city: string }>("select city from public.profiles where id = $1", [ids.alice]);
    expect(r.rows[0].city).toBe("Stuttgart");
  });

  it("verhindert das Bearbeiten fremder Profile", async () => {
    const r = await as(ids.bob, "update public.profiles set city = 'Hack' where id = $1", [ids.alice]);
    expect(r.affectedRows).toBe(0);
  });

  it("verhindert, dass Nutzer sich selbst eine Rolle geben", async () => {
    await expect(as(ids.alice, "update public.profiles set role = 'admin' where id = auth.uid()")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("verhindert das Fälschen der Altersbestätigung", async () => {
    await expect(
      as(ids.bob, "update public.profiles set age_confirmed_at = now() where id = auth.uid()"),
    ).rejects.toThrow(/permission denied/);
  });

  it("verhindert das direkte Anlegen und Löschen von Profilen", async () => {
    await expect(
      as(ids.bob, "insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000ff')"),
    ).rejects.toThrow(/permission denied/);
    await expect(as(ids.bob, "delete from public.profiles where id = auth.uid()")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("verlangt https bei der Website", async () => {
    await expect(
      as(ids.alice, "update public.profiles set website = 'javascript:alert(1)' where id = auth.uid()"),
    ).rejects.toThrow(/profiles_website_format/);
  });
});

describe("Rollen", () => {
  it("erlaubt Mitgliedern keine Rollenvergabe", async () => {
    await expect(as(ids.alice, "select public.set_user_role($1, 'admin')", [ids.alice])).rejects.toThrow(/forbidden/);
  });

  it("erlaubt Admins die Rollenvergabe", async () => {
    await as(ids.admin, "select public.set_user_role($1, 'team')", [ids.alice]);
    const r = await as<{ is_team: boolean; is_admin: boolean }>(ids.alice, "select public.is_team(), public.is_admin()");
    expect(r.rows[0]).toEqual({ is_team: true, is_admin: false });
  });

  it("schützt den letzten Admin vor dem Herabstufen", async () => {
    await expect(as(ids.admin, "select public.set_user_role($1, 'member')", [ids.admin])).rejects.toThrow(
      /last_admin/,
    );
  });

  it("liefert die Nutzerliste mit E-Mail nur an Admins", async () => {
    const r = await as<{ email: string }>(ids.admin, "select * from public.admin_list_users('alice')");
    expect(r.rows.map((u) => u.email)).toEqual(["alice@example.com"]);
    await expect(as(ids.alice, "select * from public.admin_list_users()")).rejects.toThrow(/forbidden/);
  });

  it("sperrt Funktionen für Nutzer ohne Anmeldung", async () => {
    await expect(as(null, "select public.is_admin()")).rejects.toThrow(/permission denied/);
    await expect(as(null, "select * from public.admin_list_users()")).rejects.toThrow(/permission denied/);
  });
});

describe("Konto löschen", () => {
  it("verhindert das Löschen des letzten Admins", async () => {
    await expect(as(ids.admin, "select public.delete_own_account()")).rejects.toThrow(/last_admin/);
  });

  it("löscht Konto und Profil des Nutzers", async () => {
    await as(ids.bob, "select public.delete_own_account()");
    const users = await db.query("select 1 from auth.users where id = $1", [ids.bob]);
    const profiles = await db.query("select 1 from public.profiles where id = $1", [ids.bob]);
    expect(users.rows).toHaveLength(0);
    expect(profiles.rows).toHaveLength(0);
  });
});
