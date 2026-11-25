"use client";

import { useEffect } from "react";
import { pingPresence } from "@/lib/actions/presence";

/** Meldet alle 2 Minuten "bin noch da", solange die App sichtbar geöffnet ist. */
export function PresencePing() {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === "visible") pingPresence().catch(() => undefined);
    };
    const timer = setInterval(ping, 120_000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);
  return null;
}
