"use client";
/* eslint-disable @next/next/no-img-element -- lokale Vorschau eines gewählten Fotos */

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

export type CropShape = "circle" | "card" | "post" | "cover";

// Kartenformat: 63 × 88 mm (Pokémon, Magic, One Piece …)
const CARD_RATIO = 63 / 88;
/** Beitragsfotos wie bei Instagram im Hochformat 4:5 */
const POST_RATIO = 4 / 5;
/** Binder-Einband (Titelbild) */
const COVER_RATIO = 4 / 5;

/** Bildanpassung in Prozent (100 = unverändert) */
type Adjust = { brightness: number; contrast: number; saturation: number; warmth: number };
const NO_ADJUST: Adjust = { brightness: 100, contrast: 100, saturation: 100, warmth: 0 };

function cssFilter(a: Adjust) {
  // Wärme: leichter Sepia-Anteil plus etwas Farbe
  const warm = a.warmth > 0 ? ` sepia(${a.warmth * 0.5}%)` : a.warmth < 0 ? ` hue-rotate(${a.warmth * 0.3}deg)` : "";
  return `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturation}%)${warm}`;
}

/** Anpassung direkt auf die Pixel (für Browser ohne Zeichenflächen-Filter, z. B. ältere Safari) */
function adjustPixels(ctx: CanvasRenderingContext2D, w: number, h: number, a: Adjust) {
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  const br = a.brightness / 100;
  const ct = a.contrast / 100;
  const sat = a.saturation / 100;
  const warm = a.warmth / 100;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * br;
    let g = d[i + 1] * br;
    let b = d[i + 2] * br;
    r = (r - 128) * ct + 128;
    g = (g - 128) * ct + 128;
    b = (b - 128) * ct + 128;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = l + (r - l) * sat;
    g = l + (g - l) * sat;
    b = l + (b - l) * sat;
    r += 30 * warm;
    b -= 30 * warm;
    d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  ctx.putImageData(data, 0, 0);
}

/** rotation: Vierteldrehungen (0, 90, 180 …); tilt: feines Geraderichten in Grad */
type View = { zoom: number; x: number; y: number; rotation: number; tilt: number };

/** Höchstens so weit lässt sich ein schiefes Foto gerade drehen */
const MAX_TILT = 20;

/**
 * Bildausschnitt wählen wie in Instagram: Bild mit dem Finger verschieben, mit zwei Fingern
 * (oder Regler / Mausrad) zoomen, bei Karten und Beiträgen zusätzlich drehen: in Vierteldrehungen
 * und fein zum Geraderichten (Regler oder Drehen mit zwei Fingern). Ergebnis ist eine Zeichenfläche.
 */
export function ImageCropper({
  src,
  img,
  shape,
  output,
  title,
  onCancel,
  onDone,
  confirmLabel,
  adjustable = false,
}: {
  src: string;
  img: HTMLImageElement;
  shape: CropShape;
  output: { width: number; height: number };
  title: string;
  onCancel: () => void;
  onDone: (canvas: HTMLCanvasElement) => void;
  confirmLabel?: string;
  /** Zusätzlich Helligkeit, Kontrast, Sättigung und Wärme anpassen */
  adjustable?: boolean;
}) {
  const t = useTranslations("Photos");
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 320, h: 420 });
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0, rotation: 0, tilt: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number; angle: number; tilt: number } | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const canRotate = shape !== "circle";
  const [adjust, setAdjust] = useState<Adjust>(NO_ADJUST);
  // Verkleinerte Kopie für die Anzeige (große Handyfotos überfordern sonst manche Browser)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  useEffect(() => {
    const max = 1800;
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    if (k >= 1) return;
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    let url: string | null = null;
    c.toBlob((b) => {
      if (!b) return;
      url = URL.createObjectURL(b);
      setPreviewSrc(url);
    }, "image/jpeg", 0.9);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [img]);
  const [panel, setPanel] = useState<"crop" | "adjust">("crop");
  const adjusted = JSON.stringify(adjust) !== JSON.stringify(NO_ADJUST);

  // Größe der Arbeitsfläche messen
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Rahmen: Kreis bzw. Karte, mittig mit Rand
  const margin = 24;
  const maxW = box.w - margin * 2;
  const maxH = box.h - margin * 2;
  let fw: number;
  let fh: number;
  if (shape === "circle") {
    fw = fh = Math.max(80, Math.min(maxW, maxH));
  } else {
    const ratio = shape === "post" ? POST_RATIO : shape === "cover" ? COVER_RATIO : CARD_RATIO;
    fh = Math.max(100, Math.min(maxH, maxW / ratio));
    fw = fh * ratio;
  }

  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  /** Farbe für leere Flächen, wenn das Foto kleiner gezoomt ist als der Rahmen */
  const fill = shape === "card" ? "#ffffff" : "#0a0d11";

  /**
   * zoom = 1: das (gedrehte) Foto füllt den Rahmen ganz aus.
   * Kleiner als 1 (bis minZoom): Rauszoomen, bis das ganze Foto in den Rahmen passt.
   */
  function geometry(v: View) {
    const phi = ((v.rotation + v.tilt) * Math.PI) / 180;
    const c = Math.abs(Math.cos(phi));
    const sn = Math.abs(Math.sin(phi));
    const needW = fw * c + fh * sn;
    const needH = fw * sn + fh * c;
    const base = Math.max(needW / iw, needH / ih);
    // Ganzes Foto sichtbar: gedrehter Umriss des Fotos passt in den Rahmen
    const fit = Math.min(fw / (iw * c + ih * sn), fh / (iw * sn + ih * c));
    const minZoom = Math.min(1, fit / base);
    return { phi, needW, needH, minZoom, scale: base * v.zoom };
  }

  const scale = geometry(view).scale;

  function clamp(v: View): View {
    const { phi, needW, needH, scale: sc } = geometry(v);
    // Verschiebung in Fotorichtung umrechnen, begrenzen, zurückrechnen
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    // Größer als der Rahmen: Rand darf nicht sichtbar werden. Kleiner: Foto bleibt im Rahmen.
    const mu = Math.abs(sc * iw - needW) / 2;
    const mv = Math.abs(sc * ih - needH) / 2;
    const u = Math.min(mu, Math.max(-mu, v.x * cos + v.y * sin));
    const w = Math.min(mv, Math.max(-mv, -v.x * sin + v.y * cos));
    return { ...v, x: u * cos - w * sin, y: u * sin + w * cos };
  }

  function update(next: Partial<View>) {
    setView((v) => {
      const n = { ...v, ...next, tilt: Math.min(MAX_TILT, Math.max(-MAX_TILT, next.tilt ?? v.tilt)) };
      const { minZoom } = geometry(n);
      return clamp({ ...n, zoom: Math.min(5, Math.max(minZoom, next.zoom ?? v.zoom)) });
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: view.zoom,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        tilt: view.tilt,
      };
      setAdjusting(true);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      // Zwei Finger: zoomen und (bei Karten und Beiträgen) leicht drehen
      const turn = ((Math.atan2(b.y - a.y, b.x - a.x) - pinch.current.angle) * 180) / Math.PI;
      update({
        zoom: pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist),
        ...(canRotate ? { tilt: Math.round((pinch.current.tilt + turn) * 10) / 10 } : {}),
      });
    } else if (pointers.current.size === 1) {
      setView((v) => clamp({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) {
      pinch.current = null;
      setAdjusting(false);
    }
  }

  function confirm() {
    const canvas = document.createElement("canvas");
    canvas.width = output.width;
    canvas.height = output.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const k = output.width / fw;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.translate(output.width / 2 + view.x * k, output.height / 2 + view.y * k);
    ctx.rotate(((view.rotation + view.tilt) * Math.PI) / 180);
    ctx.scale(scale * k, scale * k);
    // Anpassungen: Zeichenflächen-Filter, wenn der Browser ihn kann, sonst Pixel für Pixel
    const useFilter = adjusted && "filter" in ctx && (() => {
      ctx.filter = "brightness(100%)";
      return ctx.filter === "brightness(100%)";
    })();
    if (useFilter) ctx.filter = cssFilter(adjust);
    ctx.drawImage(img, -iw / 2, -ih / 2);
    if (adjusted && !useFilter) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      adjustPixels(ctx, canvas.width, canvas.height, adjust);
    }
    onDone(canvas);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-night" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <button type="button" onClick={onCancel} className="text-cream/80">{t("cancel")}</button>
        <p className="font-semibold">{title}</p>
        <button type="button" onClick={confirm} className="font-bold text-brand">{confirmLabel ?? t("apply")}</button>
      </div>

      <div
        ref={boxRef}
        className="relative flex-1 touch-none select-none overflow-hidden bg-black"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => update({ zoom: view.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08) })}
      >
        {/* Füllfarbe im Rahmen (sichtbar, wenn rausgezoomt) */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: fw, height: fh, background: fill }} />
        <img
          src={previewSrc ?? src}
          alt=""
          draggable={false}
          className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
          style={{
            // In Bildschirmgröße zeigen (nicht in Originalgröße skaliert): sonst wird das Foto
            // mit Helligkeit/Kontrast auf manchen Geräten (Safari) schwarz
            width: iw * scale,
            height: ih * scale,
            transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) rotate(${view.rotation + view.tilt}deg)`,
            filter: adjusted ? cssFilter(adjust) : undefined,
          }}
        />
        {/* Abgedunkelter Bereich außerhalb des Rahmens */}
        <div
          aria-hidden
          className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-white/90 ${
            shape === "circle" ? "rounded-full" : shape === "post" ? "rounded-none" : shape === "cover" ? "rounded-l-md rounded-r-2xl" : "rounded-[4%]"
          }`}
          style={{ width: fw, height: fh, boxShadow: "0 0 0 9999px rgba(10, 16, 28, 0.72)" }}
        >
          {/* Hilfslinien zum Geraderichten, sichtbar beim Drehen */}
          {canRotate && (
            <span
              className={`absolute inset-0 transition-opacity ${adjusting || view.tilt !== 0 ? "opacity-100" : "opacity-0"}`}
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(255,255,255,0.45) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.45) 1px, transparent 1px)",
                backgroundSize: `${fw / 3}px ${fh / 3}px`,
                backgroundPosition: "-1px -1px",
              }}
            />
          )}
        </div>
        {(shape === "card" || shape === "cover") && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-white/80">{t(shape === "cover" ? "coverHint" : "cardHint")}</p>
        )}
      </div>

      <div className="space-y-2 border-t border-line px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        {adjustable && (
          <div className="flex justify-center gap-2" role="tablist">
            {(["crop", "adjust"] as const).map((x) => (
              <button
                key={x}
                type="button"
                role="tab"
                aria-selected={panel === x}
                onClick={() => setPanel(x)}
                className={`rounded-full px-4 py-1.5 text-sm ${panel === x ? "bg-brand/15 font-semibold text-brand" : "text-cream/70"}`}
              >
                {t(x === "crop" ? "tabCrop" : "tabAdjust")}
              </button>
            ))}
          </div>
        )}
        {adjustable && panel === "adjust" ? (
          <div className="space-y-2">
            {(["brightness", "contrast", "saturation", "warmth"] as const).map((k) => {
              const [min, max] = k === "warmth" ? [-100, 100] : [50, 150];
              const neutral = NO_ADJUST[k];
              return (
                <label key={k} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-cream/80">{t(`adjust_${k}`)}</span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={1}
                    value={adjust[k]}
                    onChange={(e) => setAdjust((a) => ({ ...a, [k]: Number(e.target.value) }))}
                    onDoubleClick={() => setAdjust((a) => ({ ...a, [k]: neutral }))}
                    className="flex-1 accent-brand"
                  />
                  <span className="w-10 text-right text-xs tabular-nums text-cream/70">
                    {adjust[k] - neutral > 0 ? "+" : ""}
                    {adjust[k] - neutral}
                  </span>
                </label>
              );
            })}
            <div className="flex justify-end">
              <button type="button" className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-40" disabled={!adjusted} onClick={() => setAdjust(NO_ADJUST)}>
                {t("adjustReset")}
              </button>
            </div>
          </div>
        ) : (
        <>
        <div className="flex items-center gap-3">
          <span aria-hidden className="w-12 text-sm text-cream/70">🔍</span>
          <input
            type="range"
            min={Math.floor(geometry(view).minZoom * 100) / 100}
            max={5}
            step={0.01}
            value={view.zoom}
            onChange={(e) => update({ zoom: Number(e.target.value) })}
            aria-label={t("zoom")}
            className="flex-1 accent-brand"
          />
          {canRotate && (
            <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => update({ rotation: view.rotation + 90, x: 0, y: 0 })} aria-label={t("rotate")} title={t("rotate")}>
              ⟳
            </button>
          )}
        </div>
        {canRotate && (
          <div className="flex items-center gap-3">
            <span className="w-12 text-right text-sm tabular-nums text-cream/80" aria-hidden>
              {view.tilt > 0 ? "+" : ""}
              {view.tilt.toFixed(1).replace(".", ",")}°
            </span>
            <input
              type="range"
              min={-MAX_TILT}
              max={MAX_TILT}
              step={0.1}
              value={view.tilt}
              onChange={(e) => update({ tilt: Number(e.target.value) })}
              onPointerDown={() => setAdjusting(true)}
              onPointerUp={() => setAdjusting(false)}
              onBlur={() => setAdjusting(false)}
              aria-label={t("straighten")}
              aria-valuetext={`${view.tilt.toFixed(1)}°`}
              className="flex-1 accent-brand"
            />
            <button
              type="button"
              className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-40"
              onClick={() => update({ tilt: 0 })}
              disabled={view.tilt === 0}
            >
              {t("straightenReset")}
            </button>
          </div>
        )}
        {canRotate && <p className="text-center text-xs text-cream/60">{t("straightenHint")}</p>}
        </>
        )}
      </div>
    </div>
  );
}
