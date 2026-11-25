import { BRAND, fixBrand } from "@/lib/brand";

/**
 * Text mit Markenname für Überschriften: Hauptüberschriften werden in Großbuchstaben gesetzt,
 * der Markenname "Tracacon" bleibt dabei trotzdem normal geschrieben.
 */
export function BrandText({ text }: { text: string }) {
  const parts = fixBrand(text).split(new RegExp(`(${BRAND})`));
  return (
    <>
      {parts.map((part, i) =>
        part === BRAND ? (
          <span key={i} className="normal-case">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
