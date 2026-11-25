"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { sendTestPush, subscribePush, unsubscribePush } from "@/lib/actions/push";
import { VAPID_PUBLIC_KEY } from "@/lib/push-shared";

type Status = "checking" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function keyToBytes(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
function toB64url(buf: ArrayBuffer | null) {
  if (!buf) return "";
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/**
 * Mitteilungen aufs Handy ein- und ausschalten.
 * compact: kleiner Hinweis (z. B. auf der Aktivitätsseite), der nur erscheint, solange Mitteilungen aus sind.
 */
export function PushSettings({ available, compact = false }: { available: boolean; compact?: boolean }) {
  const t = useTranslations("Push");
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      let next: Status;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        next = ios && !standalone ? "ios-install" : "unsupported";
      } else if (Notification.permission === "denied") {
        next = "denied";
      } else {
        next = (await currentSubscription()) ? "on" : "off";
      }
      if (!cancelled) setStatus(next);
    })().catch(() => !cancelled && setStatus("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  function enable() {
    setMessage(null);
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStatus(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) }));
        const r = await subscribePush({ endpoint: sub.endpoint, p256dh: toB64url(sub.getKey("p256dh")), auth: toB64url(sub.getKey("auth")) });
        if (r.error) {
          setMessage(t("error"));
          return;
        }
        setStatus("on");
        setMessage(t("enabled"));
      } catch {
        setMessage(t("error"));
      }
    });
  }

  function disable() {
    setMessage(null);
    start(async () => {
      const sub = await currentSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint);
        await sub.unsubscribe().catch(() => undefined);
      }
      setStatus("off");
    });
  }

  function test() {
    setMessage(null);
    start(async () => {
      const r = await sendTestPush();
      setMessage(r.ok ? t("testSent") : t("error"));
    });
  }

  if (!available) return compact ? null : <p className="text-sm text-cream/70">{t("notReady")}</p>;
  if (compact && status !== "off") return null;

  if (compact) {
    return (
      <div className="card flex flex-wrap items-center gap-3 border-brand/40">
        <p className="min-w-0 flex-1 text-sm">{t("hint")}</p>
        <button type="button" className="btn-primary" onClick={enable} disabled={pending}>{t("enable")}</button>
      </div>
    );
  }

  return (
    <div className="space-y-3" aria-live="polite">
      {status === "checking" && <p className="text-sm text-cream/60">…</p>}
      {status === "unsupported" && <p className="text-sm text-cream/70">{t("unsupported")}</p>}
      {status === "ios-install" && <p className="text-sm text-cream/70">{t("iosInstall")}</p>}
      {status === "denied" && <p className="text-sm text-cream/70">{t("denied")}</p>}
      {status === "off" && (
        <button type="button" className="btn-primary" onClick={enable} disabled={pending}>{t("enable")}</button>
      )}
      {status === "on" && (
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-sm text-ok">✓ {t("on")}</span>
          <button type="button" className="btn-ghost" onClick={test} disabled={pending}>{t("testButton")}</button>
          <button type="button" className="btn-ghost" onClick={disable} disabled={pending}>{t("disable")}</button>
        </div>
      )}
      {message && <p role="status" className="text-sm text-cream/80">{message}</p>}
    </div>
  );
}
