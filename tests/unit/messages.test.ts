// Doppelte Abschnitte in den Textdateien überschreiben sich still: Der spätere gewinnt, alle Texte des früheren fehlen.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function duplicateKeys(file: string) {
  const text = readFileSync(join(__dirname, "..", "..", "messages", file), "utf8");
  const top = [...text.matchAll(/^ {2}"([^"]+)": \{/gm)].map((m) => m[1]);
  return top.filter((k, i) => top.indexOf(k) !== i);
}

describe("Textdateien", () => {
  it.each(["de.json", "en.json"])("%s hat keine doppelten Abschnitte", (file) => {
    expect(duplicateKeys(file)).toEqual([]);
  });

  it("Deutsch und Englisch haben dieselben Abschnitte", () => {
    const de = JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", "de.json"), "utf8"));
    const en = JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", "en.json"), "utf8"));
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
  });
});
