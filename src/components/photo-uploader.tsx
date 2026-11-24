"use client";
/* eslint-disable @next/next/no-img-element -- Vorschau aus dem Speicher bzw. lokal */

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { prepareImage } from "@/lib/image";
import { MAX_PHOTOS, PHOTO_BUCKET, photoUrl } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/client";

type Photo = { id: string; preview: string; state: "ready" | "uploading" | "error" };

/**
 * Fotos auswählen, im Browser verkleinern und direkt in den eigenen Ordner bei Supabase hochladen.
 * Das Formular bekommt nur die Foto-IDs (verstecktes Feld "photos").
 */
export function PhotoUploader({
  userId,
  initial,
  requireBothSides = false,
  onPendingChange,
}: {
  userId: string;
  initial: string[];
  /** Erste zwei Plätze als Vorder- und Rückseite beschriften und als Pflicht markieren */
  requireBothSides?: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const t = useTranslations("Listing");
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>(() =>
    initial.map((id) => ({ id, preview: photoUrl(userId, id, "thumb"), state: "ready" })),
  );
  const [error, setError] = useState<string | null>(null);

  const pending = photos.some((p) => p.state === "uploading");
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  function update(next: (p: Photo[]) => Photo[]) {
    setPhotos(next);
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    const free = MAX_PHOTOS - photos.length;
    const selected = Array.from(files).slice(0, Math.max(0, free));
    const supabase = createClient();

    for (const file of selected) {
      const id = crypto.randomUUID();
      const localPreview = URL.createObjectURL(file);
      update((p) => [...p, { id, preview: localPreview, state: "uploading" }]);
      try {
        const { full, thumb } = await prepareImage(file);
        const opts = { contentType: "image/jpeg", cacheControl: "31536000", upsert: false };
        const [a, b] = await Promise.all([
          supabase.storage.from(PHOTO_BUCKET).upload(`${userId}/${id}.jpg`, full, opts),
          supabase.storage.from(PHOTO_BUCKET).upload(`${userId}/${id}_t.jpg`, thumb, opts),
        ]);
        if (a.error || b.error) throw a.error ?? b.error;
        update((p) => p.map((x) => (x.id === id ? { ...x, state: "ready" } : x)));
      } catch (e) {
        console.error("Foto-Upload", e);
        setError(e instanceof Error && e.message === "not_an_image" ? t("photoError") : null);
        update((p) => p.map((x) => (x.id === id ? { ...x, state: "error" } : x)));
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  const ready = photos.filter((p) => p.state === "ready");

  return (
    <div>
      <input type="hidden" name="photos" value={JSON.stringify(ready.map((p) => p.id))} />
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {photos.map((p, i) => (
          <li key={p.id} className="relative aspect-[3/4] overflow-hidden rounded-xl border border-white/15 bg-night-3">
            <img src={p.preview} alt="" className={`h-full w-full object-cover ${p.state !== "ready" ? "opacity-40" : ""}`} />
            {requireBothSides && i < 2 && (
              <span className="absolute left-1 top-1 rounded-md bg-night/85 px-1.5 py-0.5 text-[10px] font-semibold text-amber">
                {i === 0 ? t("front") : t("back")}
              </span>
            )}
            {p.state === "uploading" && (
              <span className="absolute inset-0 flex items-center justify-center text-xs">{t("uploading")}</span>
            )}
            {p.state === "error" && (
              <span className="absolute inset-0 flex items-center justify-center p-1 text-center text-xs text-danger">!</span>
            )}
            <div className="absolute inset-x-1 bottom-1 flex justify-between">
              {i > 0 && p.state === "ready" ? (
                <button
                  type="button"
                  aria-label={t("moveLeft")}
                  title={t("moveLeft")}
                  onClick={() => update((list) => { const c = [...list]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; })}
                  className="rounded-lg bg-night/85 px-2 py-1 text-xs"
                >
                  ←
                </button>
              ) : <span />}
              <button
                type="button"
                aria-label={t("removePhoto")}
                title={t("removePhoto")}
                onClick={() => update((list) => list.filter((x) => x.id !== p.id))}
                className="rounded-lg bg-night/85 px-2 py-1 text-xs text-danger"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
        {photos.length < MAX_PHOTOS && (
          <li>
            <label
              htmlFor={inputId}
              className={`flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-center text-xs hover:border-amber hover:text-amber ${
                requireBothSides && photos.length < 2 ? "border-amber/60 text-amber" : "border-white/20 text-cream/70"
              }`}
            >
              <span className="text-2xl leading-none">+</span>
              {requireBothSides && photos.length < 2 ? (photos.length === 0 ? t("front") : t("back")) : t("addPhotos")}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept="image/*"
              multiple
              aria-label={t("addPhotos")}
              className="sr-only"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </li>
        )}
        {requireBothSides && photos.length === 0 && (
          <li aria-hidden className="flex aspect-[3/4] flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/10 text-center text-xs text-cream/40">
            {t("back")}
          </li>
        )}
      </ul>
      {error && <p role="alert" className="error">{error}</p>}
      {photos.some((p) => p.state === "error") && !error && (
        <p role="alert" className="error">{t("photoError")}</p>
      )}
    </div>
  );
}
