// Kartensuche: Eingabe zerlegen und Treffer aus der Kartendatenbank zusammenführen (ohne echtes Internet).
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { parseCardQuery, searchCards, getCardInfo } = await import("@/lib/cards");

const sets = [
  { id: "base1", name: "Base", cardCount: { official: 102 } },
  { id: "sv03.5", name: "151", cardCount: { official: 165 } },
  { id: "sv08", name: "Stürmische Funken", cardCount: { official: 191 } },
];

function mockApi(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    const path = url.replace("https://api.tcgdex.net/v2", "");
    const key = Object.keys(routes).find((k) => path === k || path.startsWith(`${k}?`));
    if (!key) return new Response("[]", { status: 200 });
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("Eingabe zerlegen", () => {
  it("trennt Name und Nummer", () => {
    expect(parseCardQuery("Glurak ex 199/165")).toEqual({ name: "Glurak ex", number: "199", total: 165 });
    expect(parseCardQuery("Glurak 199")).toEqual({ name: "Glurak", number: "199", total: null });
    expect(parseCardQuery("199/165")).toEqual({ name: "", number: "199", total: 165 });
    expect(parseCardQuery("Pikachu")).toEqual({ name: "Pikachu", number: null, total: null });
  });
});

describe("Kartensuche", () => {
  it("führt deutsche und englische Treffer zusammen, neueste Sets zuerst", async () => {
    mockApi({
      "/de/sets": sets,
      "/en/sets": sets,
      "/de/cards": [
        { id: "base1-4", localId: "4", name: "Glurak", image: "https://assets.tcgdex.net/de/base/base1/4" },
        { id: "sv03.5-199", localId: "199", name: "Glurak-ex", image: "https://assets.tcgdex.net/de/sv/sv03.5/199" },
      ],
      "/en/cards": [
        { id: "sv03.5-199", localId: "199", name: "Charizard ex" },
        { id: "base1-4", localId: "4", name: "Charizard" },
      ],
    });
    const hits = await searchCards("glurak");
    expect(hits.map((h) => h.id)).toEqual(["sv03.5-199", "base1-4"]);
    expect(hits[0]).toMatchObject({ name: "Glurak-ex", name_en: "Charizard ex", set: "151", number: "199/165", image: "https://assets.tcgdex.net/de/sv/sv03.5/199/low.webp" });
  });

  it("findet über die Nummer allein die Karte im passenden Set", async () => {
    const fetchMock = mockApi({
      "/de/sets": sets,
      "/en/sets": sets,
      "/de/cards": [
        { id: "sv03.5-199", localId: "199", name: "Glurak-ex" },
        { id: "sv08-199", localId: "199", name: "Anderes" },
      ],
    });
    const hits = await searchCards("199/165");
    expect(hits.map((h) => h.id)).toEqual(["sv03.5-199"]);
    expect(String(fetchMock.mock.calls.find((c) => String(c[0]).includes("/de/cards"))?.[0])).toContain("localId=eq%3A199");
  });

  it("sucht kurze Nummern in allen Schreibweisen (5, 05, 005)", async () => {
    const fetchMock = mockApi({ "/de/sets": sets, "/en/sets": sets });
    await searchCards("Pikachu 5");
    const url = decodeURIComponent(String(fetchMock.mock.calls.find((c) => String(c[0]).includes("/de/cards"))?.[0]));
    expect(url).toContain("name=Pikachu");
    expect(url).toContain("localId=eq:5|05|005");
  });

  it("sucht nicht bei zu kurzer Eingabe", async () => {
    const fetchMock = mockApi({});
    expect(await searchCards("g")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("holt die Kartendaten zum Speichern", async () => {
    mockApi({
      "/de/cards/sv03.5-199": { id: "sv03.5-199", localId: "199", name: "Glurak-ex", rarity: "Special Illustration Rare", image: "https://assets.tcgdex.net/de/sv/sv03.5/199", set: { id: "sv03.5", name: "151", cardCount: { official: 165 } } },
      "/en/cards/sv03.5-199": { id: "sv03.5-199", localId: "199", name: "Charizard ex", set: { id: "sv03.5", name: "151" } },
    });
    expect(await getCardInfo("sv03.5-199")).toEqual({
      card_ref: "tcgdex:sv03.5-199",
      card_name: "Glurak-ex",
      card_name_en: "Charizard ex",
      card_set: "151",
      card_number: "199/165",
      card_rarity: "Special Illustration Rare",
      card_image: "https://assets.tcgdex.net/de/sv/sv03.5/199/low.webp",
    });
    expect(await getCardInfo("../etc")).toBeNull();
  });
});
