// Set-Kürzel: Liste, Vorschläge, Suche über Kürzel und Nummer (ohne echtes Internet).
import { afterEach, describe, expect, it, vi } from "vitest";
import { SET_CODES, setsForCode, suggestSetCodes } from "@/lib/set-codes";

vi.mock("server-only", () => ({}));
const { searchByCode, normalizeCardNumber, isPocketSet } = await import("@/lib/cards");

afterEach(() => vi.unstubAllGlobals());

function mockApi(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    const path = decodeURIComponent(url.replace("https://api.tcgdex.net/v2", ""));
    const body = routes[path];
    return body === undefined ? new Response("{}", { status: 404 }) : new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Kürzel-Liste", () => {
  it("kennt die gängigen Kürzel mit deutschem Set-Namen", () => {
    expect(setsForCode("mew")).toMatchObject([{ id: "sv03.5", name: "151" }]);
    expect(setsForCode(" PFL ")).toMatchObject([{ id: "me02", name: "Fatale Flammen" }]);
    expect(setsForCode("30C").map((s) => s.id)).toEqual(["30th", "30th-c"]);
    expect(SET_CODES.length).toBeGreaterThan(180);
  });

  it("schlägt Kürzel über den Set-Namen vor", () => {
    expect(suggestSetCodes("fatale").map((s) => s.code)).toContain("PFL");
    expect(suggestSetCodes("151")[0].code).toBe("MEW");
    expect(suggestSetCodes("")).toEqual([]);
  });
});

describe("Nummern und Pocket-Sets", () => {
  it("macht Nummern vergleichbar", () => {
    expect(normalizeCardNumber("199/165")).toBe("199");
    expect(normalizeCardNumber("005")).toBe("5");
    expect(normalizeCardNumber("tg05")).toBe("TG5");
    expect(normalizeCardNumber(" 12 ")).toBe("12");
  });

  it("erkennt Sets aus dem Handyspiel", () => {
    expect(["A1", "A1a", "B2a", "P-A"].every(isPocketSet)).toBe(true);
    expect(["sv03.5", "base1", "me02", "swsh9tg"].some(isPocketSet)).toBe(false);
  });
});

describe("Suche über Kürzel und Nummer", () => {
  it("findet die Karte im Set, deutscher Name mit englischem dazu", async () => {
    mockApi({
      "/de/sets/sv03.5": { id: "sv03.5", name: "151", cardCount: { official: 165 }, cards: [
        { id: "sv03.5-199", localId: "199", name: "Glurak-ex", image: "https://assets.tcgdex.net/de/sv/sv03.5/199" },
        { id: "sv03.5-006", localId: "006", name: "Glurak-ex" },
      ] },
      "/en/sets/sv03.5": { id: "sv03.5", name: "151", cardCount: { official: 165 }, cards: [
        { id: "sv03.5-199", localId: "199", name: "Charizard ex" },
      ] },
    });
    const r = await searchByCode("mew", "199/165");
    expect(r.sets).toEqual([{ code: "MEW", name: "151" }]);
    expect(r.hits).toEqual([
      { id: "sv03.5-199", name: "Glurak-ex", name_en: "Charizard ex", set: "151", number: "199/165", image: "https://assets.tcgdex.net/de/sv/sv03.5/199/low.webp" },
    ]);
    expect((await searchByCode("MEW", "6")).hits.map((h) => h.id)).toEqual(["sv03.5-006"]);
  });

  it("nimmt den englischen Namen, wenn die deutsche Karte noch fehlt", async () => {
    mockApi({
      "/de/sets/me02": { id: "me02", name: "Fatale Flammen", cardCount: { official: 94 }, cards: [] },
      "/en/sets/me02": { id: "me02", name: "Phantasmal Flames", cardCount: { official: 94 }, cards: [
        { id: "me02-013", localId: "013", name: "Mega Charizard X ex" },
      ] },
    });
    const r = await searchByCode("PFL", "13");
    expect(r.hits).toMatchObject([{ id: "me02-013", name: "Mega Charizard X ex", set: "Fatale Flammen", number: "013/94" }]);
  });

  it("fragt unbekannte Kürzel (neue Sets) bei der Kartendatenbank nach", async () => {
    const fetchMock = mockApi({
      "/en/sets?abbreviation.official=eq:NEU|neu": [{ id: "me07", name: "Neues Set" }],
      "/de/sets/me07": { id: "me07", name: "Neues Set", cardCount: { official: 100 }, cards: [{ id: "me07-001", localId: "001", name: "Pikachu" }] },
    });
    const r = await searchByCode("neu", "1");
    expect(r.hits.map((h) => h.id)).toEqual(["me07-001"]);
    expect(fetchMock.mock.calls.some((c) => decodeURIComponent(String(c[0])).includes("abbreviation.official=eq:NEU|neu"))).toBe(true);
  });

  it("lehnt seltsame Eingaben ab, ohne zu fragen", async () => {
    const fetchMock = mockApi({});
    expect(await searchByCode("../x", "1")).toEqual({ sets: [], hits: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
