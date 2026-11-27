// Formularprüfung für Inserate: Set-Kürzel und Kartennummer.
import { describe, expect, it } from "vitest";
import { listingSchema } from "@/lib/validation";

const base = {
  title: "Glurak-ex 199/165 151",
  description: "",
  tcg: "pokemon",
  kind: "single",
  offer: "sell",
  price: "120",
  negotiable: "",
  condition: "near_mint",
  card_language: "de",
  grading: "",
  city: "",
  handover_event: "on",
  handover_pickup: "",
  handover_shipping: "",
  photos: JSON.stringify(["10000000-0000-0000-0000-000000000001", "10000000-0000-0000-0000-000000000002"]),
  card_code: " mew ",
  card_no: "199/165",
};

describe("Inserat prüfen", () => {
  it("übernimmt Set-Kürzel (groß geschrieben) und Kartennummer", () => {
    const r = listingSchema.parse(base);
    expect(r.card).toEqual({ code: "MEW", number: "199/165" });
    expect(r).not.toHaveProperty("card_code");
  });

  it("Kürzel und Nummer sind freiwillig", () => {
    expect(listingSchema.parse({ ...base, card_code: "", card_no: "" }).card).toEqual({ code: null, number: null });
  });

  it("ignoriert Kürzel und Nummer bei Sealed-Ware", () => {
    expect(listingSchema.parse({ ...base, kind: "sealed", photos: "[]" }).card).toEqual({ code: null, number: null });
  });

  it("verlangt weiterhin Vorder- und Rückseite bei Einzelkarten", () => {
    const r = listingSchema.safeParse({ ...base, photos: JSON.stringify(["10000000-0000-0000-0000-000000000001"]) });
    expect(r.error?.issues[0].message).toBe("front_back_required");
  });

  it("lehnt seltsame Zeichen ab", () => {
    expect(listingSchema.safeParse({ ...base, card_code: "<b>" }).success).toBe(false);
    expect(listingSchema.safeParse({ ...base, card_no: "1;drop" }).success).toBe(false);
  });

  it("Verschenken braucht keinen Preis", () => {
    const r = listingSchema.parse({ ...base, offer: "gift", price: "", negotiable: "on" });
    expect(r.price_cents).toBeNull();
    expect(r.negotiable).toBe(false);
  });

  it("Nur Sammlung: ohne Fotos, Preis und Übergabe, gespeichert als Tausch-Vorgabe", () => {
    const r = listingSchema.parse({
      ...base,
      offer: "collection",
      price: "",
      photos: "[]",
      handover_event: "",
      quantity: "3",
    });
    expect(r).toMatchObject({ status: "collection", offer: "trade", price_cents: null, quantity: 3, handover_event: true });
  });

  it("Markierte Stücke sind aktiv und brauchen weiter Fotos", () => {
    expect(listingSchema.parse(base)).toMatchObject({ status: "active", quantity: 1 });
    const r = listingSchema.safeParse({ ...base, offer: "trade", photos: "[]" });
    expect(r.error?.issues[0].message).toBe("front_back_required");
  });

  it("prüft die Anzahl", () => {
    expect(listingSchema.safeParse({ ...base, quantity: "0" }).error?.issues[0].message).toBe("invalid_quantity");
    expect(listingSchema.safeParse({ ...base, quantity: "1000" }).error?.issues[0].message).toBe("invalid_quantity");
    expect(listingSchema.safeParse({ ...base, quantity: "zwei" }).success).toBe(false);
  });
});
