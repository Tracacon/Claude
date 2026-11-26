// Eventseite wie auf tracacon.de: Beschreibung, Titelbild, Händler, Händlertische, Kalender.
import { describe, expect, it } from "vitest";
import { buildDealers, coverUrl, dealerLink, dealerTables, icsFile, parseDescription, safeHref } from "@/lib/event-details";

const SITE = "https://www.tracacon.de";

describe("Beschreibung aus Odoo", () => {
  const html =
    '<h3>Tracacon – New Year Card Show 2027</h3><div class="tc-auf-einen-blick card p-3 mb-4"><h4 class="h5 mb-2">Auf einen Blick</h4>' +
    '<ul class="list-unstyled mb-0"><li><strong>Datum:</strong> Sonntag, 3. Januar 2027</li><li><strong>Einlass:</strong> 10:00 Uhr &amp; mehr</li></ul></div>' +
    '<p>Am <strong>Sonntag</strong> wird DAS K <script>alert(1)</script>zum Treffpunkt.</p><h4>Einlasszeiten</h4><ul><li><strong>10:00 Uhr</strong> – Early Access</li></ul>' +
    '<p class="tc-booth-cta mt-4"><a class="btn" href="https://www.eventim-light.com/x">Besuchertickets</a><a class="btn" href="/aussteller">Infos für Aussteller</a>' +
    '<a href="javascript:alert(1)">böse</a></p>';
  const blocks = parseDescription(html, SITE, "New Year Cardshow Stuttgart");

  it("übernimmt nur Text, Fettschrift und sichere Links", () => {
    expect(blocks[0]).toEqual({ type: "h", box: true, parts: [{ text: "Auf einen Blick" }] });
    expect(blocks[1]).toEqual({ type: "li", box: true, parts: [{ text: "Datum:", bold: true }, { text: " Sonntag, 3. Januar 2027" }] });
    expect(blocks[2].parts.map((p) => p.text).join("")).toBe("Einlass: 10:00 Uhr & mehr");
    expect(blocks[3]).toEqual({ type: "p", parts: [{ text: "Am " }, { text: "Sonntag", bold: true }, { text: " wird DAS K zum Treffpunkt." }] });
    expect(JSON.stringify(blocks)).not.toMatch(/alert|script|javascript/);
  });

  it("entfernt die doppelte Titelzeile und macht Links absolut", () => {
    expect(blocks.some((b) => b.parts.some((p) => p.text.includes("New Year Card Show")))).toBe(false);
    const links = blocks.flatMap((b) => b.parts).filter((p) => p.href).map((p) => p.href);
    expect(links).toEqual(["https://www.eventim-light.com/x", "https://www.tracacon.de/aussteller"]);
    expect(blocks.find((b) => b.parts.some((p) => p.text === "Infos für Aussteller"))?.parts).toHaveLength(1);
  });

  it("leer bleibt leer", () => {
    expect(parseDescription(false, SITE)).toEqual([]);
    expect(parseDescription("<p> </p>", SITE)).toEqual([]);
  });
});

describe("Titelbild und Links", () => {
  it("liest das Bild aus den Titelbild-Einstellungen", () => {
    expect(coverUrl(`{"background-image": "url('/web/image/5270/hero-halle.jpg')", "opacity": "0.45"}`, SITE)).toBe(
      "https://www.tracacon.de/web/image/5270/hero-halle.jpg",
    );
    expect(coverUrl('{"background-image": "url(\\"/web/image/5343-b7d42fb0/Reutlingen%20Card.jpg\\")"}', SITE)).toBe(
      "https://www.tracacon.de/web/image/5343-b7d42fb0/Reutlingen%20Card.jpg",
    );
    expect(coverUrl('{"background-image": "none"}', SITE)).toBeNull();
    expect(coverUrl("kaputt", SITE)).toBeNull();
  });

  it("nur https oder eigene Pfade", () => {
    expect(safeHref("//boese.de/x", SITE)).toBeNull();
    expect(safeHref("http://x.de", SITE)).toBeNull();
    expect(safeHref("/event", SITE)).toBe("https://www.tracacon.de/event");
  });

  it("Händlerlinks wie auf der Homepage", () => {
    expect(dealerLink("@plugfromjapan")).toEqual({ url: "https://www.instagram.com/plugfromjapan", label: "@plugfromjapan" });
    expect(dealerLink("https://www.instagram.com/patricks_troedelmarkt?bqrl=Yz")).toEqual({
      url: "https://www.instagram.com/patricks_troedelmarkt",
      label: "@patricks_troedelmarkt",
    });
    expect(dealerLink("tobis-pokemon-shop.com")).toEqual({ url: "https://tobis-pokemon-shop.com/", label: "tobis-pokemon-shop.com" });
    expect(dealerLink("ZenbabyTCG")).toBeNull();
    expect(dealerLink("")).toBeNull();
  });
});

describe("Händler", () => {
  const regs = [
    { id: 1, event_id: 9, email: "Zen@Example.com ", company_name: "Zen aus Buchung" },
    { id: 2, event_id: 9, email: "plug@example.com", company_name: "Plug" },
    { id: 3, event_id: 9, email: "geheim@example.com", company_name: "Ohne Zustimmung" },
    { id: 4, event_id: 9, email: "nurbuchung@example.com", company_name: "Nur Buchung" },
    { id: 5, event_id: 9, email: "versteckt@example.com", company_name: "Versteckt" },
  ];
  const profiles = [
    { id: 10, x_email: "zen@example.com", x_name: "ZenbabyTCG", x_zustimmung: true, x_pokemon: true, x_onepiece: true, x_einzelkarten: true, x_link: "ZenbabyTCG" },
    { id: 11, x_email: "plug@example.com", x_name: "PlugFromJapan", x_zustimmung: true, x_pokemon: true, x_graded: true, x_link: "@plugfromjapan" },
    { id: 12, x_email: "geheim@example.com", x_name: "Geheim", x_zustimmung: false, x_pokemon: true },
    { id: 13, x_email: "versteckt@example.com", x_name: "Versteckt", x_zustimmung: true, x_ausgeblendet: true },
    { id: 14, x_email: "andere@example.com", x_name: "Nicht gebucht", x_zustimmung: true },
  ];
  const answers = [
    // Plug hat bei der Buchung andere TCGs/Produkte angegeben: die gehen vor
    { registration_id: 2, question_id: 5, value_answer_id: 15, value_text_box: null },
    { registration_id: 2, question_id: 15, value_answer_id: 21, value_text_box: null },
    { registration_id: 2, question_id: 14, value_answer_id: null, value_text_box: "Sportkarten" },
    // Nur Buchung: Zustimmung und Link aus der Buchung
    { registration_id: 4, question_id: 19, value_answer_id: 25, value_text_box: null },
    { registration_id: 4, question_id: 18, value_answer_id: null, value_text_box: "@nurbuchung" },
  ];
  const dealers = buildDealers(regs, answers, profiles, new Map([[10, 5332]]), SITE);

  it("zeigt nur gebuchte Händler mit Zustimmung, alphabetisch", () => {
    expect(dealers.map((d) => d.name)).toEqual(["Nur Buchung", "PlugFromJapan", "ZenbabyTCG"]);
  });

  it("Angaben aus Profil oder Buchung, Logo von der Homepage", () => {
    const zen = dealers.find((d) => d.name === "ZenbabyTCG")!;
    expect(zen).toEqual({
      name: "ZenbabyTCG",
      logo_url: "https://www.tracacon.de/web/image/5332/160x160",
      tcgs: ["pokemon", "onepiece"],
      other: null,
      products: ["singles"],
      link_url: null,
      link_label: null,
    });
    const plug = dealers.find((d) => d.name === "PlugFromJapan")!;
    expect(plug.tcgs).toEqual(["riftbound"]);
    expect(plug.products).toEqual(["sealed"]);
    expect(plug.other).toBe("Sportkarten");
    expect(plug.link_label).toBe("@plugfromjapan");
    expect(dealers[0].link_url).toBe("https://www.instagram.com/nurbuchung");
    expect(JSON.stringify(dealers)).not.toMatch(/@example\.com/);
  });
});

describe("Händlertische und Kalender", () => {
  it("zählt freie Tische", () => {
    expect(dealerTables([])).toBeNull();
    expect(dealerTables([{ seats_max: 73, seats_available: 0, sale_available: false, is_sold_out: true }])).toEqual({ total: 73, free: 0, on_sale: false });
    expect(dealerTables([{ seats_max: 40, seats_available: 12, sale_available: true, is_sold_out: false }])).toEqual({ total: 40, free: 12, on_sale: true });
  });

  it("Kalenderdatei", () => {
    const ics = icsFile({
      id: "abc",
      name: "Cardshow; Stuttgart, 2027",
      starts_at: "2027-01-03T09:00:00.000Z",
      ends_at: "2027-01-03T16:00:00.000Z",
      venue: "DAS K",
      address: "Stuttgarter Straße 65, 70806 Kornwestheim",
      url: "https://app.example/de/termine/abc",
    });
    expect(ics).toContain("DTSTART:20270103T090000Z");
    expect(ics).toContain("SUMMARY:Cardshow\\; Stuttgart\\, 2027");
    expect(ics).toContain("LOCATION:DAS K\\, Stuttgarter Straße 65\\, 70806 Kornwestheim");
  });
});
