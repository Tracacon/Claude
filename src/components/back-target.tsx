"use client";

import { useEffect } from "react";
import { usePathname } from "@/i18n/navigation";
import { setBackTarget } from "@/lib/nav-history";

/** Legt fest, wohin der Zurück-Pfeil oben links auf dieser Seite führt. */
export function BackTarget({ href }: { href: string }) {
  const pathname = usePathname();
  useEffect(() => {
    setBackTarget({ path: pathname, href });
    return () => setBackTarget(null);
  }, [pathname, href]);
  return null;
}
