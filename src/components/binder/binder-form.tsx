"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { FormError } from "@/components/form-error";
import { ImageCropper } from "@/components/image-cropper";
import { PhotoSourceSheet } from "@/components/photo-source-sheet";
import { Link } from "@/i18n/navigation";
import { autosaveBinder, deleteBinder, getMyImages, removeLibraryImage, type BinderFormState, type LibraryImage } from "@/lib/actions/binders";
import {
  BINDER_COLORS,
  BINDER_COLOR_STYLES,
  BINDER_EFFECTS,
  BINDER_VISIBILITIES,
  type BinderColor,
  type BinderEffect,
  type BinderVisibility,
} from "@/lib/binder-shared";
import { canvasToJpeg, loadImage } from "@/lib/image";
import { PHOTO_BUCKET, photoUrl } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/client";
import { BinderCover } from "./binder-cover";

type Section = "color" | "effect" | "visibility" | null;
type SaveState = "idle" | "saving" | "saved" | "error";

const VIS_ICON: Record<BinderVisibility, string> = { public: "🌐", followers: "👥", private: "🔒" };

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h3l1.6-2.4A1.5 1.5 0 0 1 9.9 5h4.2a1.5 1.5 0 0 1 1.3.6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.6" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`size-5 text-cream/50 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Binder anlegen oder bearbeiten, wie bei Instagram:
 * Vorschau oben (bleibt stehen), Kamera-Knopf auf dem Einband für das Titelbild,
 * darunter Name und aufklappbare Zeilen für Farbe, Effekt und Sichtbarkeit.
 * Jede Änderung wird automatisch gespeichert; ein neuer Binder entsteht, sobald er einen Namen hat.
 */
export function BinderForm({
  userId,
  nickname,
  binder,
}: {
  userId: string;
  nickname: string;
  binder?: { id: string; name: string; color: BinderColor; visibility: string; effect: BinderEffect; cover_image: string | null };
}) {
  const t = useTranslations("Binder");
  const tP = useTranslations("Photos");
  const [id, setId] = useState<string | null>(binder?.id ?? null);
  const [name, setName] = useState(binder?.name ?? "");
  const [color, setColor] = useState<BinderColor>(binder?.color ?? "night");
  const [effect, setEffect] = useState<BinderEffect>(binder?.effect ?? "none");
  const [visibility, setVisibility] = useState<BinderVisibility>((binder?.visibility as BinderVisibility) ?? "public");
  const [cover, setCover] = useState<{ id: string; preview: string } | null>(
    binder?.cover_image ? { id: binder.cover_image, preview: photoUrl(userId, binder.cover_image, "thumb") } : null,
  );
  const [open, setOpen] = useState<Section>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | undefined>();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [crop, setCrop] = useState<{ img: HTMLImageElement; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  // Eigene Bilder (frühere Titelbilder, Kartenvorderseiten) zur Auswahl im Foto-Menü
  const [library, setLibrary] = useState<LibraryImage[] | null>(null);
  useEffect(() => {
    if (!sourceOpen || library) return;
    let off = false;
    void getMyImages().then((x) => !off && setLibrary(x));
    return () => {
      off = true;
    };
  }, [sourceOpen, library]);
  const [del, delAction, deleting] = useActionState<BinderFormState, FormData>(deleteBinder, {});

  // Vorschau bleibt unter der oberen Leiste stehen: deren Höhe messen
  const [headerH, setHeaderH] = useState(64);
  useEffect(() => {
    const h = document.querySelector<HTMLElement>("header.sticky");
    if (!h) return;
    const ro = new ResizeObserver(() => setHeaderH(h.offsetHeight));
    ro.observe(h);
    return () => ro.disconnect();
  }, []);

  // --- Automatisch speichern -------------------------------------------------------
  const latest = useRef({ id, name, color, effect, visibility, cover: cover?.id ?? null });
  latest.current = { id, name, color, effect, visibility, cover: cover?.id ?? null };
  const busy = useRef(false);
  const again = useRef(false);
  const first = useRef(true);

  async function persist() {
    if (busy.current) {
      again.current = true;
      return;
    }
    const v = latest.current;
    if (v.name.trim() === "") return; // ohne Namen wird (noch) nichts angelegt
    busy.current = true;
    setSave("saving");
    const r = await autosaveBinder({ id: v.id, name: v.name, color: v.color, effect: v.effect, visibility: v.visibility, cover: v.cover });
    busy.current = false;
    if (r.error) {
      setSave("error");
      setSaveError(r.error);
    } else {
      setSave("saved");
      setSaveError(undefined);
      if (!v.id && r.id) {
        setId(r.id);
        latest.current.id = r.id;
        // Adresse auf "bearbeiten" umstellen, damit Neuladen bzw. Zurück den Binder behält
        window.history.replaceState(window.history.state, "", window.location.pathname.replace(/\/binder\/neu$/, `/binder/${r.id}/bearbeiten`));
      }
    }
    if (again.current) {
      again.current = false;
      void persist();
    }
  }

  // Name: kurz nach dem Tippen speichern; alles andere sofort
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = window.setTimeout(() => void persist(), 700);
    return () => window.clearTimeout(timer);
    // persist liest den Stand über latest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, color, effect, visibility, cover?.id]);

  // --- Titelbild ---------------------------------------------------------------------
  async function pickCover(files: File[]) {
    setCoverError(null);
    if (!files[0]) return;
    try {
      setCrop(await loadImage(files[0]));
    } catch {
      setCoverError(t("coverError"));
    }
  }

  /** Früheres Titelbild direkt übernehmen (hat schon das Einband-Format) */
  function pickLibraryCover(imageId: string) {
    setSourceOpen(false);
    setCover({ id: imageId, preview: photoUrl(userId, imageId, "thumb") });
  }

  /** Kartenvorderseite als Ausgangsbild: laden und zum Zuschneiden öffnen */
  async function cropFromCard(imageId: string) {
    setSourceOpen(false);
    setCoverError(null);
    try {
      const res = await fetch(photoUrl(userId, imageId));
      const blob = await res.blob();
      setCrop(await loadImage(new File([blob], `${imageId}.jpg`, { type: "image/jpeg" })));
    } catch {
      setCoverError(t("coverError"));
    }
  }

  async function forgetImage(imageId: string) {
    setLibrary((l) => l?.filter((x) => !(x.kind === "cover" && x.image_id === imageId)) ?? l);
    await removeLibraryImage(imageId);
  }

  async function uploadCover(canvas: HTMLCanvasElement) {
    if (crop) URL.revokeObjectURL(crop.url);
    setCrop(null);
    const newId = crypto.randomUUID();
    const preview = canvas.toDataURL("image/jpeg", 0.7);
    setUploading(true);
    try {
      const [full, thumb] = await Promise.all([canvasToJpeg(canvas, 1500, 0.86), canvasToJpeg(canvas, 600, 0.82)]);
      const supabase = createClient();
      const opts = { contentType: "image/jpeg", cacheControl: "31536000", upsert: false };
      const [a, b] = await Promise.all([
        supabase.storage.from(PHOTO_BUCKET).upload(`${userId}/${newId}.jpg`, full, opts),
        supabase.storage.from(PHOTO_BUCKET).upload(`${userId}/${newId}_t.jpg`, thumb, opts),
      ]);
      if (a.error || b.error) throw a.error ?? b.error;
      setCover({ id: newId, preview });
    } catch (e) {
      console.error("Titelbild", e);
      setCoverError(t("coverError"));
    } finally {
      setUploading(false);
    }
  }

  const toggle = (x: Section) => setOpen((o) => (o === x ? null : x));
  const row = "flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03]";
  const swatch = (x: BinderColor) => ({ background: `radial-gradient(circle at 30% 30%, ${BINDER_COLOR_STYLES[x].base}, ${BINDER_COLOR_STYLES[x].edge})` });

  return (
    <div className="space-y-4">
      {/* Vorschau mit Kamera-Knopf, bleibt beim Scrollen stehen */}
      <div className="sticky z-10 -mx-4 bg-night/95 px-4 pb-3 pt-2 backdrop-blur" style={{ top: headerH }}>
        <div className="relative mx-auto w-36 sm:w-44">
          <BinderCover name={name || t("namePlaceholder")} color={color} effect={effect} imageUrl={cover?.preview ?? null} subtitle={t("preview")} />
          <button
            type="button"
            onClick={() => setSourceOpen(true)}
            disabled={uploading}
            className="absolute -bottom-2 -right-3 grid size-12 place-items-center rounded-full border-2 border-night bg-brand text-on-brand shadow-lg transition-transform hover:scale-105 disabled:opacity-60"
            aria-label={cover ? t("coverChange") : t("coverAdd")}
            title={cover ? t("coverChange") : t("coverAdd")}
          >
            {uploading ? <span className="size-5 animate-spin rounded-full border-2 border-on-brand border-t-transparent" /> : <CameraIcon className="size-6" />}
          </button>
          {cover && !uploading && (
            <button
              type="button"
              onClick={() => setCover(null)}
              className="absolute -right-3 -top-2 grid size-8 place-items-center rounded-full border-2 border-night bg-night-3 text-sm text-cream/80 shadow hover:text-danger"
              aria-label={t("coverRemove")}
              title={t("coverRemove")}
            >
              ✕
            </button>
          )}
        </div>
        <p className="mt-3 min-h-4 text-center text-xs text-cream/60" role="status">
          {save === "saving" ? t("autosaving") : save === "saved" ? `✓ ${t("autosaved")}` : !id && name.trim() === "" ? t("nameFirst") : ""}
        </p>
        {coverError && <p role="alert" className="error text-center">{coverError}</p>}
        {save === "error" && <div className="text-center"><FormError code={saveError} /></div>}
      </div>

      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-night-2">
        {/* Name */}
        <label className="flex items-center gap-3 px-4 py-3">
          <span className="w-7 text-center text-lg" aria-hidden>✏️</span>
          <span className="sr-only">{t("name")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 40))}
            maxLength={40}
            placeholder={t("namePlaceholder")}
            className="min-w-0 flex-1 bg-transparent py-1 text-base font-semibold outline-none placeholder:font-normal placeholder:text-cream/40"
            aria-label={t("name")}
          />
        </label>

        {/* Farbe */}
        <div>
          <button type="button" className={row} onClick={() => toggle("color")} aria-expanded={open === "color"}>
            <span className="w-7 text-center" aria-hidden>
              <span className="mx-auto block size-6 rounded-full border border-white/20" style={swatch(color)} />
            </span>
            <span className="flex-1 font-medium">{t("color")}</span>
            <span className="text-sm text-cream/60">{t(`color_${color}`)}</span>
            <Chevron open={open === "color"} />
          </button>
          {open === "color" && (
            <div className="flex flex-wrap gap-3 px-4 pb-4 pt-1">
              {BINDER_COLORS.map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => setColor(x)}
                  aria-pressed={color === x}
                  title={t(`color_${x}`)}
                  aria-label={t(`color_${x}`)}
                  className={`size-11 rounded-full border-2 ring-offset-2 ring-offset-night-2 ${color === x ? "border-transparent ring-2 ring-brand" : "border-white/10"}`}
                  style={swatch(x)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Effekt */}
        <div>
          <button type="button" className={row} onClick={() => toggle("effect")} aria-expanded={open === "effect"}>
            <span className="w-7 text-center text-lg" aria-hidden>✨</span>
            <span className="flex-1 font-medium">{t("effect")}</span>
            <span className="text-sm text-cream/60">{t(`effect_${effect}`)}</span>
            <Chevron open={open === "effect"} />
          </button>
          {open === "effect" && (
            <div className="grid grid-cols-3 gap-2 px-4 pb-4 pt-1 sm:grid-cols-6">
              {BINDER_EFFECTS.map((x) => (
                <button key={x} type="button" onClick={() => setEffect(x)} aria-pressed={effect === x} className="text-center">
                  <span
                    className={`relative block aspect-square overflow-hidden rounded-xl border-2 ${effect === x ? "border-brand" : "border-transparent"}`}
                    style={{ background: `radial-gradient(120% 90% at 30% 10%, ${BINDER_COLOR_STYLES[color].base}, ${BINDER_COLOR_STYLES[color].edge})` }}
                  >
                    {x !== "none" && <span aria-hidden className={`binder-fx binder-fx-${x}`} />}
                  </span>
                  <span className="mt-1 block text-xs text-cream/80">{t(`effect_${x}`)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sichtbarkeit */}
        <div>
          <button type="button" className={row} onClick={() => toggle("visibility")} aria-expanded={open === "visibility"}>
            <span className="w-7 text-center text-lg" aria-hidden>{VIS_ICON[visibility]}</span>
            <span className="flex-1 font-medium">{t("visibilityShort")}</span>
            <span className="text-sm text-cream/60">{t(`visibility_${visibility}`)}</span>
            <Chevron open={open === "visibility"} />
          </button>
          {open === "visibility" && (
            <div className="space-y-1 px-2 pb-3">
              {BINDER_VISIBILITIES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  aria-pressed={visibility === v}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left ${visibility === v ? "bg-brand/10" : "hover:bg-white/[0.03]"}`}
                >
                  <span className="w-6 text-center" aria-hidden>{VIS_ICON[v]}</span>
                  <span className="flex-1">
                    <span className="block font-medium">{t(`visibility_${v}`)}</span>
                    <span className="block text-xs text-cream/60">{t(`visibility_${v}_hint`)}</span>
                  </span>
                  {visibility === v && <span className="text-brand" aria-hidden>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {id && <Link href={`/u/${nickname}/binder/${id}`} className="btn-primary w-full">{t("done")}</Link>}

      {id && (
        <section className="rounded-2xl border border-line bg-night-2 px-4 py-3">
          {!confirm ? (
            <button type="button" className="flex items-center gap-3 text-sm text-danger hover:underline" onClick={() => setConfirm(true)}>
              <span aria-hidden>🗑</span> {t("delete")}
            </button>
          ) : (
            <form action={delAction} className="space-y-2">
              <input type="hidden" name="id" value={id} />
              <p className="text-sm">{t("deleteConfirm")}</p>
              <div className="flex gap-2">
                <button type="submit" className="btn-danger" disabled={deleting}>{t("deleteYes")}</button>
                <button type="button" className="btn-ghost" onClick={() => setConfirm(false)}>{t("cancel")}</button>
              </div>
              <FormError code={del.error} />
            </form>
          )}
        </section>
      )}

      <PhotoSourceSheet
        idPrefix="binder-cover"
        open={sourceOpen}
        onClose={() => setSourceOpen(false)}
        onFiles={(files) => void pickCover(files)}
        facing="environment"
        title={t("coverImage")}
        onRemove={cover ? () => setCover(null) : undefined}
        removeLabel={t("coverRemove")}
      >
        {library === null ? (
          <p className="px-4 py-3 text-sm text-cream/60">{t("libraryLoading")}</p>
        ) : (
          (["cover", "card"] as const).map((kind) => {
            const list = library.filter((x) => x.kind === kind);
            if (list.length === 0) return null;
            return (
              <div key={kind} className="px-3 pb-2 pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cream/60">
                  {kind === "cover" ? t("libraryCovers") : t("libraryCards")}
                </p>
                <ul className="grid grid-cols-4 gap-2">
                  {list.map((x) => (
                    <li key={`${kind}-${x.image_id}`} className="relative">
                      <button
                        type="button"
                        onClick={() => (kind === "cover" ? pickLibraryCover(x.image_id) : void cropFromCard(x.image_id))}
                        className={`block w-full overflow-hidden rounded-lg border-2 ${cover?.id === x.image_id ? "border-brand" : "border-transparent hover:border-brand/60"} ${kind === "cover" ? "aspect-[4/5]" : "aspect-[63/88]"}`}
                        aria-label={kind === "cover" ? t("libraryUseCover") : t("libraryUseCard")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoUrl(userId, x.image_id, "thumb")} alt="" loading="lazy" className="h-full w-full object-cover" />
                      </button>
                      {kind === "cover" && cover?.id !== x.image_id && (
                        <button
                          type="button"
                          onClick={() => void forgetImage(x.image_id)}
                          className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full border border-line bg-night text-xs text-cream/70 hover:text-danger"
                          aria-label={t("libraryForget")}
                          title={t("libraryForget")}
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </PhotoSourceSheet>
      {crop && (
        <ImageCropper
          key={crop.url}
          src={crop.url}
          img={crop.img}
          shape="cover"
          adjustable
          output={{ width: 1200, height: 1500 }}
          title={tP("cropCover")}
          onCancel={() => {
            URL.revokeObjectURL(crop.url);
            setCrop(null);
          }}
          onDone={(canvas) => void uploadCover(canvas)}
        />
      )}
    </div>
  );
}
