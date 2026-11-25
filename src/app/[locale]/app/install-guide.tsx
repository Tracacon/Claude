"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { InstallSteps, detectInstallMode } from "@/components/install-banner";

type InstallEvent = Event & { prompt: () => Promise<void> };

/** Ausführliche Anleitung auf der Seite /app – passend zum Gerät, mit allen Wegen zum Nachlesen. */
export function InstallGuide() {
  const t = useTranslations("Install");
  const [mode, setMode] = useState<ReturnType<typeof detectInstallMode> | "desktop" | "installed" | "checking">("checking");
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallEvent);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const timer = setTimeout(() => setMode((m) => (m === "checking" ? (standalone ? "installed" : detectInstallMode() ?? "desktop") : m)), 800);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  if (mode === "checking") return <p className="text-sm text-cream/60">…</p>;
  if (mode === "installed") return <p className="card text-ok">{t("installed")}</p>;
  return (
    <div className="space-y-6">
      {mode !== "desktop" && mode && (
        <section className="card space-y-3 border-brand/50">
          <h2 className="font-display text-lg font-semibold">{t("yourDevice")}</h2>
          <InstallSteps mode={mode} onInstall={() => deferred?.prompt()} />
        </section>
      )}
      {mode === "desktop" && <p className="card text-sm text-cream/80">{t("desktop")}</p>}
      <section className="card space-y-3">
        <h2 className="font-semibold">iPhone / iPad</h2>
        <InstallSteps mode="ios" />
      </section>
      <section className="card space-y-3">
        <h2 className="font-semibold">Android</h2>
        <InstallSteps mode="android-manual" />
      </section>
      <section className="card space-y-2">
        <h2 className="font-semibold">{t("inAppTitle")}</h2>
        <p className="text-sm text-cream/85">{t("inApp")}</p>
      </section>
    </div>
  );
}
