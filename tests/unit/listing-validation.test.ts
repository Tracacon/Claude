// Formularprüfung für Inserate: Kartendetails, Grading und Produktart.
import { describe, expect, it } from "vitest";
import { listingSchema } from "@/lib/validation";

const base = {
  title: "Glurak-ex 199/165 151",
  description: "",
  tcg: "pokemon",
  kind: "slab",
  offer: "sell",
  price: "500",
  negotiable: "",
  condition: "",
  card_language: "de",
  grading: "",
  city: "",
  handover_event: "on",
  handover_pickup: "",
  handover_shipping: "",
  photos: JSON.stringify(["10000000-0000-0000-0000-000000000001", "10000000-0000-0000-0000-000000000002"]),
  card_id: "sv03.5-199",
  variant: "full_art",
  grading_company: "psa",
  grading_grade: "10",
  sealed_type: "",
};

describe("Inserat prüfen", () => {
  it("setzt den Grading-Text aus Firma und Note zusammen", () => {
    const r = listingSchema.parse(base);
    expect(r.grading).toBe("PSA 10");
    expect(r.details).toEqual({ card_id: "sv03.5-199", variant: "full_art", grading_company: "psa", grading_grade: 10, sealed_type: null });
  });

  it("verlangt eine Note, wenn eine Firma gewählt ist", () => {
    const r = listingSchema.safeParse({ ...base, grading_grade: "" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("grade_required");
  });

  it("nimmt bei „Andere“ den freien Text", () => {
    const r = listingSchema.parse({ ...base, grading_company: "other", grading_grade: "", grading: "Hauseigenes Grading 9" });
    expect(r.grading).toBe("Hauseigenes Grading 9");
  });

  it("ignoriert Karte und Grading bei Sealed-Ware", () => {
    const r = listingSchema.parse({ ...base, kind: "sealed", photos: "[]", sealed_type: "display" });
    expect(r.grading).toBeNull();
    expect(r.details).toEqual({ card_id: null, variant: null, grading_company: null, grading_grade: null, sealed_type: "display" });
  });

  it("lehnt ungültige Kartenkennungen ab", () => {
    expect(listingSchema.safeParse({ ...base, card_id: "../../geheim" }).success).toBe(false);
  });
});
