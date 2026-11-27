"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "@/i18n/navigation";
import { navDepth, setNavDepth, setPrevPath } from "@/lib/nav-history";

/** Zählt Seitenwechsel in der App mit (vorwärts +1, Zurück-Geste oder Zurück-Knopf −1). */
export function NavTracker() {
  const pathname = usePathname();
  const first = useRef(true);
  const back = useRef(false);
  const last = useRef<string | null>(null);

  useEffect(() => {
    const onPop = () => {
      back.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (last.current !== null) setPrevPath(last.current);
    last.current = pathname;
    if (first.current) {
      first.current = false;
      return;
    }
    setNavDepth(navDepth() + (back.current ? -1 : 1));
    back.current = false;
  }, [pathname]);

  return null;
}
