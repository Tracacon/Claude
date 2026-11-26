// Zurück-Knopf: wohin es geht, wenn man von außen kommt.
import { describe, expect, it } from "vitest";
import { parentPath, TOP_LEVEL } from "@/lib/nav-history";

describe("Zurück-Knopf", () => {
  it("geht zur übergeordneten Seite", () => {
    expect(parentPath("/marktplatz/abc")).toBe("/marktplatz");
    expect(parentPath("/termine/abc")).toBe("/termine");
    expect(parentPath("/nachrichten/abc")).toBe("/nachrichten");
    expect(parentPath("/termine")).toBe("/");
    expect(parentPath("/p/abc")).toBe("/");
    expect(parentPath("/u/ana")).toBe("/");
    expect(parentPath("/u/ana/follower")).toBe("/u/ana");
  });
  it("kein Knopf auf den Seiten der unteren Leiste", () => {
    expect([...TOP_LEVEL]).toEqual(["/", "/marktplatz", "/nachrichten", "/suche"]);
  });
});
