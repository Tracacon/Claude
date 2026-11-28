"use client";
/* eslint-disable @next/next/no-img-element -- Vorschau aus dem Speicher bzw. lokal */

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ImageCropper } from "@/components/image-cropper";
import { PhotoSourceSheet } from "@/components/photo-source-sheet";
import { canvasToJpeg, loadImage, prepareImage } from "@/lib/image";
import { MAX_PHOTOS, PHOTO_BUCKET, photoUrl } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/client";

type Photo = { id: string; preview: string; state: "ready" | "uploading" | "error" };

/**
 * Fotos aufnehmen oder aus der Galerie wählen, im Browser verkleinern und direkt in den eigenen Ordner
 * bei Supabase hochladen. Bei Einzelkarten und Slabs wird jedes Foto im Kartenformat zugeschnitten
 * (verschieben, zoomen, drehen). Das Formular bekommt nur die Foto-IDs (verstecktes Feld "photos").
 */
export function PhotoUploader({
  userId,
  initial,
  requireBothSides = false,
  cropCards = false,
  onPendingChange,
}: {
  userId: string;
  initial: string[];
  /** Erste zwei Plätze als Vorder- und Rückseite beschriften und als Pflicht markieren */
  requireBothSides?: boolean;
  /** Jedes Foto im Kartenformat zuschneiden und anpassen (Einzelkarten und Slabs) */
  cropCards?: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const t = useTranslations("Listing");
  const tP = useTranslations("Photos");
  const [sheet, setSheet] = useState(false);
  const [queue, setQueue] = useState<File[]>([]);
  const [crop, setCrop] = useState<{ img: HTMLImageElement; url: string } | null>(null);
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

  async function upload(make: () => Promise<{ full: Blob; thumb: Blob }>, preview: string) {
    const id = crypto.randomUUID();
    update((p) => [...p, { id, preview, state: "uploading" }]);
    try {
      const { full, thumb } = await make();
      const supabase = createClient();
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

  // Nächstes Foto aus der Warteschlange zum Zuschneiden öffnen
  async function openNext(list: File[]) {
    setQueue(list);
    if (list.length === 0) return setCrop(null);
    try {
      setCrop(await loadImage(list[0]));
    } catch {
      setError(t("photoError"));
      void openNext(list.slice(1));
    }
  }

  function handleFiles(files: File[]) {
    setError(null);
    const selected = files.slice(0, Math.max(0, MAX_PHOTOS - photos.length));
    // Kartenfotos immer zuschneiden (auch die Rückseite und weitere Fotos)
    if (requireBothSides || cropCards) {
      void openNext(selected);
      return;
    }
    for (const file of selected) void upload(() => prepareImage(file), URL.createObjectURL(file));
  }

  function finishCrop(canvas: HTMLCanvasElement | null) {
    if (crop) URL.revokeObjectURL(crop.url);
    if (canvas) {
      const preview = canvas.toDataURL("image/jpeg", 0.6);
      void upload(async () => ({ full: await canvasToJpeg(canvas, 1600, 0.85), thumb: await canvasToJpeg(canvas, 480, 0.8) }), preview);
    }
    void openNext(queue.slice(1));
  }

  const nextIndex = photos.length;
  const cropTitle =
    nextIndex === 0 ? tP("cropFront") : nextIndex === 1 ? tP("cropBack") : tP("cropCard");

  const ready = photos.filter((p) => p.state === "ready");

  return (
    <div>
      <input type="hidden" name="photos" value={JSON.stringify(ready.map((p) => p.id))} />
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {photos.map((p, i) => (
          <li key={p.id} className="relative aspect-[3/4] overflow-hidden rounded-xl border border-line bg-night-3">
            <img src={p.preview} alt="" className={`h-full w-full object-cover ${p.state !== "ready" ? "opacity-40" : ""}`} />
            {requireBothSides && i < 2 && (
              <span className="absolute left-1 top-1 rounded-md bg-night/85 px-1.5 py-0.5 text-[10px] font-semibold text-brand-ink">
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
            <button
              type="button"
              onClick={() => setSheet(true)}
              className={`flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-center text-xs hover:border-brand hover:text-brand-ink ${
                requireBothSides && photos.length < 2 ? "border-brand/60 text-brand-ink" : "border-tint/20 text-cream/70"
              }`}
            >
              <span className="text-2xl leading-none">📷</span>
              {requireBothSides && photos.length < 2 ? (photos.length === 0 ? t("front") : t("back")) : t("addPhotos")}
            </button>
          </li>
        )}
        {requireBothSides && photos.length === 0 && (
          <li aria-hidden className="flex aspect-[3/4] flex-col items-center justify-center rounded-xl border-2 border-dashed border-line text-center text-xs text-cream/40">
            {t("back")}
          </li>
        )}
      </ul>
      <PhotoSourceSheet
        idPrefix="listing-photo"
        open={sheet}
        onClose={() => setSheet(false)}
        onFiles={handleFiles}
        facing="environment"
        multiple
        title={requireBothSides && photos.length < 2 ? (photos.length === 0 ? t("front") : t("back")) : t("addPhotos")}
      />
      {crop && (
        <ImageCropper
          key={crop.url}
          src={crop.url}
          img={crop.img}
          shape="card"
          adjustable
          output={{ width: 1146, height: 1600 }}
          title={cropTitle}
          onCancel={() => finishCrop(null)}
          onDone={(canvas) => finishCrop(canvas)}
        />
      )}
      {error && <p role="alert" className="error">{error}</p>}
      {photos.some((p) => p.state === "error") && !error && (
        <p role="alert" className="error">{t("photoError")}</p>
      )}
    </div>
  );
}
