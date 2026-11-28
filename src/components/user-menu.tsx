"use client";
/* eslint-disable @next/next/no-img-element -- Profilbild aus Supabase Storage */

import { useEffect, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { signOut } from "@/lib/actions/auth";
import { avatarUrl } from "@/lib/social";

export type UserMenuData = {
  id: string;
  nickname: string;
  avatarId: string | null;
  role: "member" | "team" | "admin";
  unread: number;
  requests: number;
  reports: number;
  labels: Record<
    | "menu" | "myProfile" | "myListings" | "messages" | "followers" | "following" | "requests"
    | "badges" | "settings" | "moderation" | "teamStats" | "teamEvents" | "admin" | "logout" | "profile" | "close",
    string
  >;
};

function Face({ data, size }: { data: UserMenuData; size: string }) {
  return data.avatarId ? (
    <img src={avatarUrl(data.id, data.avatarId)} alt="" className={`${size} rounded-full bg-night-3 object-cover`} />
  ) : (
    <span aria-hidden className={`${size} flex items-center justify-center rounded-full bg-brand text-sm font-black text-on-brand`}>
      {data.nickname.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * Profilmenü: Auf breiten Bildschirmen als Aufklappmenü in der Kopfzeile,
 * auf dem Handy als Blatt von unten (aus der Leiste am unteren Rand).
 */
export function UserMenu({ data, variant }: { data: UserMenuData; variant: "header" | "bottom" | "sheet" }) {
  const pathname = usePathname();
  // Menü merkt sich die Seite, auf der es geöffnet wurde; nach einem Seitenwechsel ist es zu.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean | ((o: boolean) => boolean)) => {
    const next = typeof value === "function" ? value(open) : value;
    setOpenOn(next ? pathname : null);
  };
  const panelRef = useRef<HTMLDivElement>(null);
  const L = data.labels;
  const badgeCount = data.unread + data.requests;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    document.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const item = (href: string, icon: string, label: string, count = 0) => (
    <Link href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-tint/5">
      <span aria-hidden className="w-6 text-center text-lg">{icon}</span>
      <span className="flex-1">{label}</span>
      {count > 0 && <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-on-brand">{count}</span>}
    </Link>
  );

  const panel = (
    <div
      ref={panelRef}
      role="menu"
      aria-label={L.menu}
      className={
        variant === "header"
          ? "absolute right-0 top-12 z-40 w-72 rounded-2xl border border-line bg-night-2 p-2 shadow-2xl"
          : "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-line bg-night-2 p-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl"
      }
    >
      {variant === "bottom" && <div aria-hidden className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-tint/20" />}
      <Link href="/profil" className="mb-1 flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-tint/5">
        <Face data={data} size="size-11" />
        <span className="min-w-0">
          <span className="block truncate font-bold">@{data.nickname}</span>
          <span className="text-xs text-cream/60">{L.myProfile}</span>
        </span>
      </Link>
      <div className="my-1 border-t border-line" />
      {item("/meine-inserate", "▦", L.myListings)}
      {item("/nachrichten", "✉", L.messages, data.unread)}
      {item(`/u/${data.nickname}/follower`, "👥", L.followers)}
      {item(`/u/${data.nickname}/folgt`, "➜", L.following)}
      {item("/aktivitaet", "🔔", L.requests, data.requests)}
      {item("/profil?tab=abzeichen", "🏅", L.badges)}
      <div className="my-1 border-t border-line" />
      {item("/einstellungen", "⚙", L.settings)}
      {(data.role === "team" || data.role === "admin") && item("/moderation", "⚑", L.moderation, data.reports)}
      {(data.role === "team" || data.role === "admin") && item("/team/zahlen", "📊", L.teamStats)}
      {(data.role === "team" || data.role === "admin") && item("/team/termine", "📅", L.teamEvents)}
      {data.role === "admin" && item("/admin", "🛡", L.admin)}
      <form action={signOut}>
        <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-cream/70 hover:bg-tint/5">
          <span aria-hidden className="w-6 text-center text-lg">⎋</span>
          {L.logout}
        </button>
      </form>
    </div>
  );

  if (variant === "header") {
    return (
      <div className="relative hidden sm:block">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-tint/5"
        >
          <span className="relative">
            <Face data={data} size="size-8" />
            {badgeCount > 0 && <span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-night bg-brand" />}
          </span>
          <span className="max-w-32 truncate text-sm font-semibold">{data.nickname}</span>
          <span aria-hidden className="text-xs">▾</span>
        </button>
        {open && (
          <>
            <button type="button" aria-label={L.close} className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
            {panel}
          </>
        )}
      </div>
    );
  }

  // Leiste unten: Profilbild führt direkt zum eigenen Profil (das Menü sitzt dort oben rechts)
  if (variant === "bottom") {
    const active = pathname.startsWith("/profil") || pathname.startsWith("/einstellungen");
    return (
      <Link href="/profil" aria-label={L.myProfile} aria-current={active ? "page" : undefined} className="relative flex flex-1 items-center justify-center py-3">
        <span className={`relative rounded-full ${active ? "ring-2 ring-cream ring-offset-1 ring-offset-black" : ""}`}>
          <Face data={data} size="size-[26px]" />
        </span>
      </Link>
    );
  }

  // Menü-Knopf (☰) auf dem eigenen Profil, öffnet das Blatt von unten
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={L.menu}
        className="relative grid size-11 place-items-center rounded-lg text-cream hover:bg-tint/5"
      >
        <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        {data.requests + data.reports > 0 && <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-danger" />}
      </button>
      {open && (
        <>
          <button type="button" aria-label={L.close} className="fixed inset-0 z-40 bg-night/70" onClick={() => setOpen(false)} />
          {panel}
        </>
      )}
    </>
  );
}
