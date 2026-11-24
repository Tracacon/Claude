import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["de", "en"],
  defaultLocale: "de",
  // Immer mit Sprachkürzel (/de/anmelden, /en/anmelden). Ohne Kürzel schreibt der
  // Proxy intern um, und Weiterleitungen aus solchen Anfragen behandelt der
  // Cloudflare-Adapter nicht sauber (getestet mit OpenNext 1.20).
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
