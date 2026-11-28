"use client";

import { useRouter } from "@/i18n/navigation";
import { navDepth, prevPath } from "@/lib/nav-history";

/**
 * Nach dem Speichern zu einer Seite wechseln, ohne den Verlauf aufzublähen:
 * War man gerade von genau dieser Seite gekommen, geht es dorthin zurück (wie "Zurück").
 * Sonst ersetzt die Zielseite das Formular im Verlauf. So landet "Zurück" danach nie
 * wieder im Formular.
 */
export function useReturn() {
  const router = useRouter();
  return (href: string) => {
    const path = href.split("?")[0];
    if (navDepth() > 0 && prevPath() === path && !href.includes("?")) {
      router.back();
      // Daten der Zielseite auffrischen (z. B. neue Fotos)
      window.setTimeout(() => router.refresh(), 300);
    } else {
      router.replace(href);
    }
  };
}
