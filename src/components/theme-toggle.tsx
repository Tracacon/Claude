"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "./icons";
import { THEME_COLOR, THEME_COOKIE, type Theme } from "@/lib/theme";

function current(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

// Knopf oben in der Kopfzeile: Sonne = zum Tagmodus wechseln, Mond = zum Nachtmodus wechseln
export function ThemeToggle({ labels }: { labels: { toLight: string; toDark: string } }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const sync = () => setTheme(current());
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const next: Theme = theme === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      onClick={() => {
        document.documentElement.dataset.theme = next;
        document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", THEME_COLOR[next]));
        setTheme(next);
      }}
      aria-label={next === "light" ? labels.toLight : labels.toDark}
      title={next === "light" ? labels.toLight : labels.toDark}
      className="rounded-lg p-1.5 text-cream hover:text-brand-ink"
    >
      {theme === "light" ? <MoonIcon className="size-[24px]" /> : <SunIcon className="size-[24px]" />}
    </button>
  );
}
