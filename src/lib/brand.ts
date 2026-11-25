/** Markenname: immer "Tracacon", nie komplett in Großbuchstaben. */
export const BRAND = "Tracacon";

/** Die falsche Schreibweise in Großbuchstaben, aus BRAND gebildet (damit sie im Code nicht ausgeschrieben steht). */
const BRAND_UPPER = new RegExp(BRAND.toUpperCase(), "g");

/**
 * Korrigiert den Markennamen in Texten von außen (Instagram-Beiträge, Termine aus Odoo):
 * die Großbuchstaben-Schreibweise wird zu "Tracacon".
 * Gilt auch mitten in Wörtern und Hashtags, zum Beispiel bei "#…Nürtingen".
 * Klein geschriebene Hashtags wie "#tracacon" bleiben, wie sie sind.
 */
export function fixBrand(text: string): string {
  return text.replace(BRAND_UPPER, BRAND);
}
