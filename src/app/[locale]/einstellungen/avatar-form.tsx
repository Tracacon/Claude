"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { FormError } from "@/components/form-error";
import { setAvatar, type SocialState } from "@/lib/actions/social";
import { prepareAvatar } from "@/lib/image";
import { AVATAR_BUCKET } from "@/lib/social";
import { createClient } from "@/lib/supabase/client";

/** Profilbild wählen: im Browser quadratisch zuschneiden, hochladen, dann übernehmen. */
export function AvatarForm({ userId, nickname, avatarId }: { userId: string; nickname: string; avatarId: string | null }) {
  const t = useTranslations("Settings");
  const [state, action, pending] = useActionState<SocialState, FormData>(setAvatar, {});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const idRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const blob = await prepareAvatar(file);
      const id = crypto.randomUUID();
      const { error: upErr } = await createClient()
        .storage.from(AVATAR_BUCKET)
        .upload(`${userId}/${id}.jpg`, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
      if (upErr) throw upErr;
      if (idRef.current) idRef.current.value = id;
      formRef.current?.requestSubmit();
    } catch (e) {
      console.error("Profilbild", e);
      setError("upload_failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="card flex flex-wrap items-center gap-4">
      <Avatar userId={userId} avatarId={avatarId} nickname={nickname} size="lg" />
      <div className="space-y-2">
        <h2 className="font-semibold">{t("avatar")}</h2>
        <form ref={formRef} action={action} className="flex flex-wrap gap-2">
          <input ref={idRef} type="hidden" name="avatarId" defaultValue="" />
          <label className="btn-primary cursor-pointer">
            {uploading || pending ? t("uploading") : avatarId ? t("changeAvatar") : t("addAvatar")}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label={t("chooseAvatar")}
              disabled={uploading || pending}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
          {avatarId && (
            <button type="submit" name="remove" value="1" className="btn-ghost" disabled={uploading || pending}>
              {t("removeAvatar")}
            </button>
          )}
        </form>
        <p className="hint mt-0">{t("avatarHint")}</p>
        <FormError code={error ?? state.error} />
      </div>
    </section>
  );
}
