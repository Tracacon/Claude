"use client";

import { useState } from "react";

/** Teilen über das Handy-Menü, sonst Link kopieren */
export function ShareButton({ title, path, label, copied }: { title: string; path: string; label: string; copied: string }) {
  const [done, setDone] = useState(false);
  async function share() {
    const url = `${window.location.origin}/${document.documentElement.lang}${path}`;
    if (navigator.share) {
      await navigator.share({ title, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }
  return (
    <button type="button" onClick={share} className="btn-ghost">
      ↗ {done ? copied : label}
    </button>
  );
}
