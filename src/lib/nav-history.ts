/**
 * Merkt sich, wie viele Schritte man innerhalb der App gegangen ist (pro Browser-Tab).
 * So weiß der Zurück-Knopf, ob es eine vorherige App-Seite gibt – auch in der installierten
 * App auf dem iPhone, wo es keine Browser-Leiste mit Zurück-Pfeil gibt.
 */
const KEY = "tc-nav-depth";

export function navDepth() {
  try {
    return Math.max(0, Number(sessionStorage.getItem(KEY) ?? "0") || 0);
  } catch {
    return 0;
  }
}

export function setNavDepth(n: number) {
  try {
    sessionStorage.setItem(KEY, String(Math.max(0, n)));
  } catch {
    // ohne Speicher geht der Knopf einfach zur übergeordneten Seite
  }
}

/** Seiten der unteren Leiste: dort gibt es keinen Zurück-Knopf */
export const TOP_LEVEL = new Set(["/", "/marktplatz", "/nachrichten", "/suche"]);

/** Übergeordnete Seite, falls man von außen (z. B. geteilter Link) direkt hier gelandet ist */
export function parentPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  parts.pop();
  const parent = `/${parts.join("/")}`;
  // Für diese Adressen gibt es keine eigene Übersichtsseite
  if (["/p", "/u", "/beitrag", "/checkin"].includes(parent)) return "/";
  return parent;
}
