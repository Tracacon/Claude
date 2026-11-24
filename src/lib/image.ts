"use client";

// Fotos im Browser vorbereiten: drehen laut Kamera, verkleinern, als JPEG neu speichern.
// Das Neuspeichern entfernt Metadaten wie GPS-Position (EXIF).

const FULL_MAX = 1600;
const THUMB_MAX = 480;
const MAX_BYTES = 1_900_000; // Grenze des Speichers: 2 MB

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fällt auf <img> zurück (z. B. ältere Safari-Versionen)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(source: ImageBitmap | HTMLImageElement, max: number, quality: number): Promise<Blob> {
  const w = "naturalWidth" in source ? source.naturalWidth : source.width;
  const h = "naturalHeight" in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", quality),
  );
}

export async function prepareImage(file: File): Promise<{ full: Blob; thumb: Blob }> {
  if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
    throw new Error("not_an_image");
  }
  const source = await decode(file);
  let full = await toJpeg(source, FULL_MAX, 0.85);
  if (full.size > MAX_BYTES) full = await toJpeg(source, 1200, 0.75);
  const thumb = await toJpeg(source, THUMB_MAX, 0.8);
  if ("close" in source) source.close();
  return { full, thumb };
}
