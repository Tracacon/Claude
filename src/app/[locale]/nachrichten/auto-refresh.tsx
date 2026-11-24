"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** Lädt die Übersicht neu, sobald eine neue Nachricht eintrifft (Echtzeit), sonst alle 20 Sekunden. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const client = createClient();
    let live = false;
    const channel = client
      .channel("inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => router.refresh())
      .subscribe((status) => {
        live = status === "SUBSCRIBED";
      });
    const timer = setInterval(() => {
      if (!live && document.visibilityState === "visible") router.refresh();
    }, 20000);
    return () => {
      clearInterval(timer);
      void client.removeChannel(channel);
    };
  }, [router]);
  return null;
}
