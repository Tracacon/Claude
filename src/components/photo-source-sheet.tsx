"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Einheitliches Foto-Menü wie in Instagram: „Foto aufnehmen“, „Aus Galerie wählen“, optional „Entfernen“.
 * Auf dem Handy als Blatt von unten, am Computer als kleines Fenster.
 * „Foto aufnehmen“ öffnet direkt die Handykamera (capture); am Computer ohne Touch-Bildschirm entfällt es.
 *
 * Die Dateifelder sind immer vorhanden (versteckt), damit die Auswahl ohne Umweg startet.
 */
export function PhotoSourceSheet({
  open,
  onClose,
  onFiles,
  facing = "environment",
  multiple = false,
  title,
  onRemove,
  removeLabel,
  idPrefix,
}: {
  open: boolean;
  onClose: () => void;
  onFiles: (files: File[]) => void;
  facing?: "user" | "environment";
  multiple?: boolean;
  title: string;
  onRemove?: () => void;
  removeLabel?: string;
  idPrefix?: string;
}) {
  const t = useTranslations("Photos");
  const autoId = useId();
  const base = idPrefix ?? autoId;
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [touch, setTouch] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setTouch(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handle(input: HTMLInputElement | null) {
    const files = input?.files ? Array.from(input.files) : [];
    if (input) input.value = "";
    onClose();
    if (files.length) onFiles(files);
  }

  const row = (htmlFor: string, icon: string, label: ReactNode) => (
    <label htmlFor={htmlFor} className="flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3.5 text-base hover:bg-white/5">
      <span aria-hidden className="w-7 text-center text-xl">{icon}</span>
      {label}
    </label>
  );

  return (
    <>
      <input
        ref={cameraRef}
        id={`${base}-camera`}
        type="file"
        accept="image/*"
        capture={facing}
        className="sr-only"
        tabIndex={-1}
        aria-label={t("camera")}
        onChange={() => handle(cameraRef.current)}
      />
      <input
        ref={galleryRef}
        id={`${base}-gallery`}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-label={t("gallery")}
        onChange={() => handle(galleryRef.current)}
      />
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
          <button type="button" aria-hidden tabIndex={-1} className="absolute inset-0 cursor-default bg-night/70" onClick={onClose} />
          <div className="relative w-full max-w-md rounded-t-3xl border-t border-white/15 bg-night-2 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-2xl sm:rounded-3xl sm:border">
            <div aria-hidden className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-white/20 sm:hidden" />
            <p className="px-4 pb-2 pt-1 text-center text-sm font-semibold text-cream/70">{title}</p>
            {touch && row(`${base}-camera`, "📷", t("camera"))}
            {row(`${base}-gallery`, "🖼", multiple ? t("galleryMany") : t("gallery"))}
            {onRemove && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRemove();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-base text-danger hover:bg-white/5"
              >
                <span aria-hidden className="w-7 text-center text-xl">🗑</span>
                {removeLabel ?? t("remove")}
              </button>
            )}
            <button type="button" onClick={onClose} className="mt-1 w-full rounded-xl px-4 py-3 text-center text-cream/70 hover:bg-white/5">
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
