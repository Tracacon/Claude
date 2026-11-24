"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { FormError } from "@/components/form-error";
import { ImageCropper } from "@/components/image-cropper";
import { PhotoSourceSheet } from "@/components/photo-source-sheet";
import { setAvatar, type SocialState } from "@/lib/actions/social";
import { canvasToJpeg, loadImage } from "@/lib/image";
import { AVATAR_BUCKET } from "@/lib/social";
import { createClient } from "@/lib/supabase/client";

/**
 * Profilbild wie bei Instagram: aufs Bild tippen → Kamera (Frontkamera), Galerie oder Entfernen
 * → Ausschnitt im Kreis verschieben und zoomen → übernehmen.
 */
export function AvatarForm({ userId, nickname, avatarId }: { userId: string; nickname: string; avatarId: string | null }) {
  const t = useTranslations("Settings");
  const [state, action, pending] = useActionState<SocialState, FormData>(setAvatar, {});
  const [sheet, setSheet] = useState(false);
  const [crop, setCrop] = useState<{ img: HTMLImageElement; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const removeRef = useRef<HTMLInputElement>(null);
  const busy = uploading || pending;

  async function choose(files: File[]) {
    setError(null);
    try {
      setCrop(await loadImage(files[0]));
    } catch {
      setError("not_an_image");
    }
  }

  function closeCrop() {
    if (crop) URL.revokeObjectURL(crop.url);
    setCrop(null);
  }

  async function upload(canvas: HTMLCanvasElement) {
    closeCrop();
    setUploading(true);
    try {
      const blob = await canvasToJpeg(canvas, 512, 0.85);
      const id = crypto.randomUUID();
      const { error: upErr } = await createClient()
        .storage.from(AVATAR_BUCKET)
        .upload(`${userId}/${id}.jpg`, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
      if (upErr) throw upErr;
      if (idRef.current) idRef.current.value = id;
      if (removeRef.current) removeRef.current.value = "";
      formRef.current?.requestSubmit();
    } catch (e) {
      console.error("Profilbild", e);
      setError("upload_failed");
    } finally {
      setUploading(false);
    }
  }

  function remove() {
    if (idRef.current) idRef.current.value = "";
    if (removeRef.current) removeRef.current.value = "1";
    formRef.current?.requestSubmit();
  }

  return (
    <section className="card flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={() => setSheet(true)}
        disabled={busy}
        className="relative rounded-full focus-visible:outline-2 focus-visible:outline-amber"
        aria-label={avatarId ? t("changeAvatar") : t("addAvatar")}
      >
        <Avatar userId={userId} avatarId={avatarId} nickname={nickname} size="lg" />
        <span aria-hidden className="absolute bottom-0 right-0 flex size-7 items-center justify-center rounded-full border-2 border-night-2 bg-amber text-sm text-night">
          {busy ? "…" : "📷"}
        </span>
      </button>
      <div className="space-y-2">
        <h2 className="font-semibold">{t("avatar")}</h2>
        <button type="button" className="btn-ghost" onClick={() => setSheet(true)} disabled={busy}>
          {busy ? t("uploading") : avatarId ? t("changeAvatar") : t("addAvatar")}
        </button>
        <p className="hint mt-0">{t("avatarHint")}</p>
        <FormError code={error ?? state.error} />
      </div>

      <form ref={formRef} action={action} className="hidden">
        <input ref={idRef} type="hidden" name="avatarId" defaultValue="" />
        <input ref={removeRef} type="hidden" name="remove" defaultValue="" />
      </form>

      <PhotoSourceSheet
        idPrefix="avatar"
        open={sheet}
        onClose={() => setSheet(false)}
        onFiles={choose}
        facing="user"
        title={t("avatar")}
        onRemove={avatarId ? remove : undefined}
        removeLabel={t("removeAvatar")}
      />

      {crop && (
        <ImageCropper
          src={crop.url}
          img={crop.img}
          shape="circle"
          output={{ width: 512, height: 512 }}
          title={t("cropAvatar")}
          onCancel={closeCrop}
          onDone={upload}
        />
      )}
    </section>
  );
}
