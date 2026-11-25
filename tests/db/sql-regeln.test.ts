// Supabase lässt UPDATE und DELETE ohne WHERE nicht zu (Erweiterung "safeupdate").
// Die Testdatenbank kennt diese Sperre nicht, deshalb prüfen wir die Migrationen hier direkt.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(__dirname, "../../supabase/migrations");

describe("SQL-Regeln", () => {
  it("jedes UPDATE und DELETE hat ein WHERE", () => {
    const missing: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
      const sql = readFileSync(join(dir, f), "utf8");
      for (const m of sql.matchAll(/\b(update\s+public\.\w+|delete\s+from\s+public\.\w+)[^;]*;/gis)) {
        if (!/\bwhere\b/i.test(m[0])) missing.push(`${f}: ${m[0].slice(0, 60).replace(/\s+/g, " ")}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
