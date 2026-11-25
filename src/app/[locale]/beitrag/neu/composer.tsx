"use client";
/* eslint-disable @next/next/no-img-element -- lokale Vorschau */

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError } from "@/components/form-error";
import { ImageCropper } from "@/components/image-cropper";
import { PhotoSourceSheet } from "@/components/photo-source-sheet";
import { createPost, type PostState } from "@/lib/actions/posts";
import { CAPTION_MAX, POST_BUCKET, POST_PHOTOS_MAX } from "@/lib/feed-shared";
import { canvasToJpeg, loadImage } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";

type Photo = { id: string; preview: string; state: "uploading" | "ready" | "error" };

/** Neuer Beitrag: Fotos wählen, im Hochformat 4:5 zuschneiden, Text schreiben, teilen */
export function PostComposer({ userId }: { userId: string }) {
  const t = useTranslations("Feed");
  const tP = useTranslations("Photos");
  const [state, action, pending] = useActionState<PostState, FormData>(createPost, {});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [sheet, setSheet] = useState(false);
  const [queue, setQueue] = useState<File[]>([]);
  const [crop, setCrop] = useState<{ img: HTMLImageElement; url: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function openNext(list: File[]) {
    setQueue(list);
    if (list.length === 0) return setCrop(null);
    try {
      setCrop(await loadImage(list[0]));
    } catch {
      setError("not_an_image");
      void openNext(list.slice(1));
    }
  }

  function onFiles(files: File[]) {
    setError(null);
    void openNext(files.slice(0, Math.max(0, POST_PHOTOS_MAX - photos.length)));
  }

  async function upload(canvas: HTMLCanvasElement) {
    const id = crypto.randomUUID();
    setPhotos((p) => [...p, { id, preview: canvas.toDataURL("image/jpeg", 0.6), state: "uploading" }]);
    try {
      const [full, thumb] = await Promise.all([canvasToJpeg(canvas, 1350, 0.86), canvasToJpeg(canvas, 600, 0.8)]);
      const supabase = createClient();
      const opts = { contentType: "image/jpeg", cacheControl: "31536000", upsert: false };
      const [a, b] = await Promise.all([
        supabase.storage.from(POST_BUCKET).upload(`${userId}/${id}.jpg`, full, opts),
        supabase.storage.from(POST_BUCKET).upload(`${userId}/${id}_t.jpg`, thumb, opts),
      ]);
      if (a.error || b.error) throw a.error ?? b.error;
      setPhotos((p) => p.map((x) => (x.id === id ? { ...x, state: "ready" } : x)));
    } catch (e) {
      console.error("Beitragsfoto", e);
      setPhotos((p) => p.map((x) => (x.id === id ? { ...x, state: "error" } : x)));
    }
  }

  function finishCrop(canvas: HTMLCanvasElement | null) {
    if (crop) URL.revokeObjectURL(crop.url);
    if (canvas) void upload(canvas);
    void openNext(queue.slice(1));
  }

  const ready = photos.filter((p) => p.state === "ready");
  const uploading = photos.some((p) => p.state === "uploading");

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="photos" value={ready.map((p) => p.id).join(",")} />

      {photos.length === 0 ? (
        <button
          type="button"
          onClick={() => setSheet(true)}
          className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line text-cream/70 hover:border-brand hover:text-brand"
        >
          <span className="text-5xl" aria-hidden>📷</span>
          <span className="font-semibold">{t("choosePhotos")}</span>
          <span className="text-xs text-cream/50">{t("photosHint", { max: POST_PHOTOS_MAX })}</span>
        </button>
      ) : (
        <div className="space-y-2">
          <ul className="flex snap-x gap-2 overflow-x-auto pb-1">
            {photos.map((p, i) => (
              <li key={p.id} className="relative w-40 shrink-0 snap-start">
                <img src={p.preview} alt={t("photoOf", { n: i + 1, total: photos.length })} className="aspect-[4/5] w-full rounded-xl object-cover" />
                {p.state === "uploading" && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-night/60 text-xs">{t("uploading")}</span>
                )}
                {p.state === "error" && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-danger/60 text-xs">{t("uploadFailed")}</span>
                )}
                <button
                  type="button"
                  onClick={() => setPhotos((all) => all.filter((x) => x.id !== p.id))}
                  aria-label={t("removePhoto", { n: i + 1 })}
                  className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-night/85 text-sm"
                >
                  ✕
                </button>
              </li>
            ))}
            {photos.length < POST_PHOTOS_MAX && (
              <li className="w-40 shrink-0">
                <button
                  type="button"
                  onClick={() => setSheet(true)}
                  className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-cream/70 hover:border-brand hover:text-brand"
                >
                  <span className="text-2xl" aria-hidden>+</span>
                  <span className="text-xs">{t("addMorePhotos")}</span>
                </button>
              </li>
            )}
          </ul>
        </div>
      )}

      <div>
        <label htmlFor="caption" className="label">{t("caption")}</label>
        <textarea
          id="caption"
          name="caption"
          rows={4}
          maxLength={CAPTION_MAX}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder={t("captionPlaceholder")}
          className="input"
        />
        <p className="hint text-right">{caption.length}/{CAPTION_MAX}</p>
      </div>

      <FormError code={error ?? state.error} />
      <button type="submit" className="btn-primary w-full" disabled={pending || uploading || ready.length === 0}>
        {pending ? t("sharing") : uploading ? t("uploading") : t("share_post")}
      </button>

      <PhotoSourceSheet
        idPrefix="post-photo"
        open={sheet}
        onClose={() => setSheet(false)}
        onFiles={onFiles}
        facing="environment"
        multiple
        title={t("choosePhotos")}
      />
      {crop && (
        <ImageCropper
          key={crop.url}
          src={crop.url}
          img={crop.img}
          shape="post"
          output={{ width: 1080, height: 1350 }}
          title={tP("cropCard")}
          onCancel={() => finishCrop(null)}
          onDone={(canvas) => finishCrop(canvas)}
        />
      )}
    </form>
  );
}
