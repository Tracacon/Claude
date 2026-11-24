import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const migrationsDir = join(__dirname, "..", "..", "supabase", "migrations");

/** Neue Postgres-Instanz mit Supabase-Nachbau und allen Migrationen. */
export async function createDb() {
  const db = new PGlite();
  await db.exec(readFileSync(join(__dirname, "supabase-stub.sql"), "utf8"));
  for (const file of readdirSync(migrationsDir).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }

  /** SQL als angemeldeter Nutzer (oder ohne Anmeldung bei null), wie PostgREST mit JWT. */
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

  /** Registrierung plus abgeschlossene Begrüßung. */
  async function member(id: string, nickname: string) {
    await signUp(id, `${nickname.toLowerCase()}@example.com`);
    await as(id, "select public.complete_onboarding($1, true, true)", [nickname]);
  }

  return { db, as, signUp, member };
}

export const uid = (n: number) => `00000000-0000-0000-0000-${n.toString(16).padStart(12, "0")}`;
