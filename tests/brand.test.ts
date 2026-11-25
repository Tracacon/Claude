import { describe, expect, it } from "vitest";
import { fixBrand } from "@/lib/brand";

describe("Markenname", () => {
  it("schreibt TRACACON als Tracacon, auch in Hashtags", () => {
    expect(fixBrand("TAGESKASSENPREISE DER TRACACON!")).toBe("TAGESKASSENPREISE DER Tracacon!");
    expect(fixBrand("#TRACACON #TRACACONNürtingen")).toBe("#Tracacon #TracaconNürtingen");
    expect(fixBrand("das TRACACON-Jahr 2026")).toBe("das Tracacon-Jahr 2026");
  });
  it("lässt richtige und klein geschriebene Schreibweisen in Ruhe", () => {
    expect(fixBrand("Tracacon Trade Night Show #tracacon")).toBe("Tracacon Trade Night Show #tracacon");
  });
});
