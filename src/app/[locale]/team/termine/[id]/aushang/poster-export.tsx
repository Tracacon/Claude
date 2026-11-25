"use client";

import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { useState } from "react";

/**
 * QR-Code und Text zum Herunterladen bzw. Kopieren,
 * damit man in Canva o. Ä. ein eigenes Plakat gestalten kann.
 */
export function PosterExport({ url, fileName, text }: { url: string; fileName: string; text: string }) {
  const t = useTranslations("Events");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function download(kind: "white" | "transparent" | "svg") {
    setBusy(kind);
    try {
      let href: string;
      let ext = "png";
      if (kind === "svg") {
        const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#ffffff" } });
        href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        ext = "svg";
      } else {
        href = await QRCode.toDataURL(url, {
          errorCorrectionLevel: "M",
          width: 2000,
          margin: kind === "white" ? 4 : 1,
          color: { dark: "#000000", light: kind === "white" ? "#ffffff" : "#00000000" },
        });
      }
      const a = document.createElement("a");
      a.href = href;
      a.download = `${fileName}${kind === "transparent" ? "-transparent" : ""}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (href.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(href), 5000);
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  const btn = "btn-ghost justify-start text-left";
  return (
    <section className="card space-y-4 print:hidden" aria-labelledby="export-title">
      <div>
        <h2 id="export-title" className="font-display text-lg font-semibold uppercase">{t("exportTitle")}</h2>
        <p className="mt-1 text-sm text-cream/70">{t("exportIntro")}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <button type="button" className={btn} onClick={() => void download("white")} disabled={busy !== null}>
          ⬇ {t("exportPngWhite")}
        </button>
        <button type="button" className={btn} onClick={() => void download("transparent")} disabled={busy !== null}>
          ⬇ {t("exportPngTransparent")}
        </button>
        <button type="button" className={btn} onClick={() => void download("svg")} disabled={busy !== null}>
          ⬇ {t("exportSvg")}
        </button>
      </div>
      <div className="space-y-2">
        <label htmlFor="poster-text" className="label">{t("exportTextLabel")}</label>
        <textarea id="poster-text" readOnly value={text} rows={10} className="input text-sm" />
        <button type="button" className="btn-primary" onClick={() => void copy()}>
          {copied ? `✓ ${t("exportCopied")}` : t("exportCopy")}
        </button>
      </div>
      <p className="hint">{t("exportWarning")}</p>
    </section>
  );
}
