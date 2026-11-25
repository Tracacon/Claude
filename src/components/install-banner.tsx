"use client";
/* eslint-disable @next/next/no-img-element -- App-Symbol als einfache Datei */

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";

type Mode = "android" | "android-manual" | "ios" | "inapp";
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const HIDE_KEY = "tracacon-install-hint-hidden-until";
const HIDE_DAYS = 7;

/** Welche Anleitung passt zu diesem Gerät? null = nichts zeigen (Computer oder App ist schon installiert) */
export function detectInstallMode(): Exclude<Mode, "android"> | "android" | null {
  const ua = navigator.userAgent;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (standalone) return null;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  if (!ios && !android) return null;
  if (/Instagram|FBAN|FBAV|FB_IAV|TikTok|musical_ly|Line\/|Snapchat/i.test(ua)) return "inapp";
  return ios ? "ios" : "android-manual";
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline size-5 align-text-bottom" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

/** Die passende Anleitung (wird im Hinweis und auf der Seite /app verwendet) */
export function InstallSteps({ mode, onInstall }: { mode: Mode; onInstall?: () => void }) {
  const t = useTranslations("Install");
  if (mode === "android") {
    return (
      <button type="button" className="btn-primary w-full" onClick={onInstall}>
        {t("installButton")}
      </button>
    );
  }
  if (mode === "inapp") {
    return <p className="text-sm text-cream/85">{t("inApp")}</p>;
  }
  const steps = mode === "ios" ? [t.rich("ios1", { icon: () => <ShareIcon /> }), t("ios2"), t("ios3")] : [t("android1"), t("android2"), t("android3")];
  return (
    <ol className="space-y-1.5 text-sm text-cream/85">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-night">{i + 1}</span>
          <span className="pt-0.5">{s}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Hinweis beim ersten Öffnen auf dem Handy: "Tracacon App aufs Handy holen".
 * Android/Chrome: ein Tipp auf "Installieren" öffnet die echte Installation.
 * iPhone: Apple erlaubt keinen Knopf, deshalb die zwei Handgriffe als Anleitung.
 */
export function InstallBanner() {
  const t = useTranslations("Install");
  const [mode, setMode] = useState<Mode | null>(null);
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    // Hintergrund-Dienst anmelden (nötig für Installation und Mitteilungen)
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);

    let hiddenUntil = 0;
    try {
      hiddenUntil = Number(localStorage.getItem(HIDE_KEY) ?? 0);
    } catch {}
    const detected = detectInstallMode();
    if (!detected || Date.now() < hiddenUntil) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallEvent);
      setMode("android");
    };
    const onInstalled = () => setMode(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Kurz warten, ob Chrome den Ein-Tipp-Weg anbietet; sonst Anleitung zeigen
    const timer = setTimeout(() => setMode((m) => m ?? detected), detected === "android-manual" ? 1500 : 400);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function hide() {
    try {
      localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_DAYS * 86400_000));
    } catch {}
    setMode(null);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    setDeferred(null);
    if (choice?.outcome === "accepted") setMode(null);
    else hide();
  }

  // Auf der Anleitungsseite selbst nicht doppelt zeigen
  if (!mode || pathname === "/app") return null;
  return (
    <div
      role="dialog"
      aria-labelledby="install-title"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-40 mx-auto max-w-md rounded-2xl border border-brand/50 bg-night-2 p-4 shadow-2xl sm:bottom-6"
    >
      <div className="mb-3 flex items-start gap-3">
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="size-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p id="install-title" className="font-display font-semibold">{t("title")}</p>
          <p className="text-sm text-cream/70">{t("text")}</p>
        </div>
        <button type="button" onClick={hide} className="-m-1 grid size-11 shrink-0 place-items-center rounded-lg text-cream/60 hover:bg-white/5" aria-label={t("close")}>
          ✕
        </button>
      </div>
      <InstallSteps mode={mode} onInstall={install} />
      <Link href="/app" className="mt-2 block text-center text-xs text-cream/60 underline">{t("more")}</Link>
    </div>
  );
}
