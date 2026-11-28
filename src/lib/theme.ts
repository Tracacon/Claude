// Tag- und Nachtmodus: gespeichert im Cookie "theme" ("light" oder "dark").
// Ohne Cookie richtet sich die App nach der Einstellung am Gerät.
export const THEME_COOKIE = "theme";
export type Theme = "light" | "dark";

export function parseTheme(value: string | undefined): Theme | undefined {
  return value === "light" || value === "dark" ? value : undefined;
}

// Farbe der Statusleiste am Handy
export const THEME_COLOR: Record<Theme, string> = { dark: "#0a0d11", light: "#ffffff" };
