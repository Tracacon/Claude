"use client";
/* eslint-disable @next/next/no-img-element -- lokale Vorschau eines gewählten Fotos */

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

export type CropShape = "circle" | "card" | "post";

// Kartenformat: 63 × 88 mm (Pokémon, Magic, One Piece …)
const CARD_RATIO = 63 / 88;
/** Beitragsfotos wie bei Instagram im Hochformat 4:5 */
const POST_RATIO = 4 / 5;

type View = { zoom: number; x: number; y: number; rotation: number };

/**
 * Bildausschnitt wählen wie in Instagram: Bild mit dem Finger verschieben, mit zwei Fingern
 * (oder Regler / Mausrad) zoomen, bei Karten zusätzlich drehen. Ergebnis ist eine Zeichenfläche.
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
}: {
  src: string;
  img: HTMLImageElement;
  shape: CropShape;
  output: { width: number; height: number };
  title: string;
  onCancel: () => void;
  onDone: (canvas: HTMLCanvasElement) => void;
  confirmLabel?: string;
}) {
  const t = useTranslations("Photos");
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 320, h: 420 });
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0, rotation: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

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
    const ratio = shape === "post" ? POST_RATIO : CARD_RATIO;
    fh = Math.max(100, Math.min(maxH, maxW / ratio));
    fw = fh * ratio;
  }

  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const quarter = ((view.rotation % 360) + 360) % 180 !== 0;
  const rw = quarter ? ih : iw;
  const rh = quarter ? iw : ih;
  const baseScale = Math.max(fw / rw, fh / rh);
  const scale = baseScale * view.zoom;

  function clamp(v: View): View {
    const q = ((v.rotation % 360) + 360) % 180 !== 0;
    const w = (q ? ih : iw) * Math.max(fw / (q ? ih : iw), fh / (q ? iw : ih)) * v.zoom;
    const h = (q ? iw : ih) * Math.max(fw / (q ? ih : iw), fh / (q ? iw : ih)) * v.zoom;
    const mx = Math.max(0, (w - fw) / 2);
    const my = Math.max(0, (h - fh) / 2);
    return { ...v, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) };
  }

  function update(next: Partial<View>) {
    setView((v) => clamp({ ...v, ...next, zoom: Math.min(5, Math.max(1, next.zoom ?? v.zoom)) }));
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      update({ zoom: pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist) });
    } else if (pointers.current.size === 1) {
      setView((v) => clamp({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  function confirm() {
    const canvas = document.createElement("canvas");
    canvas.width = output.width;
    canvas.height = output.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const k = output.width / fw;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.translate(output.width / 2 + view.x * k, output.height / 2 + view.y * k);
    ctx.rotate((view.rotation * Math.PI) / 180);
    ctx.scale(scale * k, scale * k);
    ctx.drawImage(img, -iw / 2, -ih / 2);
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
        <img
          src={src}
          alt=""
          draggable={false}
          className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
          style={{
            width: iw,
            height: ih,
            transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) rotate(${view.rotation}deg) scale(${scale})`,
          }}
        />
        {/* Abgedunkelter Bereich außerhalb des Rahmens */}
        <div
          aria-hidden
          className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-white/90 ${
            shape === "circle" ? "rounded-full" : shape === "post" ? "rounded-none" : "rounded-[4%]"
          }`}
          style={{ width: fw, height: fh, boxShadow: "0 0 0 9999px rgba(10, 16, 28, 0.72)" }}
        />
        {shape === "card" && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-white/80">{t("cardHint")}</p>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-line px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <span aria-hidden className="text-sm">−</span>
        <input
          type="range"
          min={1}
          max={5}
          step={0.01}
          value={view.zoom}
          onChange={(e) => update({ zoom: Number(e.target.value) })}
          aria-label={t("zoom")}
          className="flex-1 accent-brand"
        />
        <span aria-hidden className="text-sm">+</span>
        {shape !== "circle" && (
          <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => update({ rotation: view.rotation + 90, x: 0, y: 0 })} aria-label={t("rotate")}>
            ⟳
          </button>
        )}
      </div>
    </div>
  );
}
