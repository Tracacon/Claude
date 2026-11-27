/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */
import { BINDER_COLOR_STYLES, type BinderColor, type BinderEffect } from "@/lib/binder-shared";

/**
 * Einband eines Sammelkartenbinders: Ledereffekt in der Binderfarbe (oder eigenes Titelbild),
 * Effekt (Glitzer, Holo …), Rücken mit Naht und Namensschild.
 */
export function BinderCover({
  name,
  color,
  effect = "none",
  imageUrl = null,
  subtitle,
  locked,
  dashed = false,
}: {
  name: string;
  color: BinderColor;
  /** Glitzer, Holo usw. über der Einbandfarbe */
  effect?: BinderEffect;
  /** Eigenes Titelbild, füllt den Einband */
  imageUrl?: string | null;
  subtitle: string;
  /** Schloss für Binder, die nicht öffentlich sind */
  locked?: "followers" | "private" | null;
  /** Gestrichelt für "Ohne Binder" */
  dashed?: boolean;
}) {
  const c = BINDER_COLOR_STYLES[color] ?? BINDER_COLOR_STYLES.night;
  return (
    <div
      className={`relative aspect-[4/5] overflow-hidden rounded-l-md rounded-r-2xl shadow-[0_10px_25px_-10px_rgba(0,0,0,0.8)] transition-transform group-hover:-translate-y-1 ${
        dashed ? "border-2 border-dashed border-line" : ""
      }`}
      style={
        dashed
          ? { background: "var(--color-night-2)", color: "var(--color-cream)" }
          : {
              background: `radial-gradient(120% 90% at 30% 10%, ${c.base} 0%, ${c.edge} 100%)`,
              color: c.text,
            }
      }
    >
      {/* Eigenes Titelbild */}
      {imageUrl && <img src={imageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
      {/* Lederstruktur */}
      {!dashed && !imageUrl && (
        <span
          aria-hidden
          className="absolute inset-0 opacity-25 mix-blend-overlay"
          style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 4px)" }}
        />
      )}
      {!dashed && effect !== "none" && <span aria-hidden className={`binder-fx binder-fx-${effect}`} />}
      {/* Rücken mit Naht */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[14%]"
        style={{ background: dashed ? "transparent" : `linear-gradient(90deg, ${c.edge}, ${c.base})` }}
      />
      {!dashed && <span aria-hidden className="absolute inset-y-2 left-[14%] border-l border-dashed border-white/30" />}
      <span aria-hidden className="absolute inset-y-2 right-2 rounded-r-xl border border-dashed border-white/20" style={{ left: "17%" }} />

      {/* Geprägter Rahmen auf dem Einband */}
      {!dashed && !imageUrl && (
        <span aria-hidden className="absolute left-[26%] right-[12%] top-[14%] bottom-[30%] rounded-lg border border-white/15 shadow-[inset_0_1px_3px_rgba(0,0,0,0.45),0_1px_0_rgba(255,255,255,0.08)]" />
      )}
      {dashed && <span aria-hidden className="absolute inset-0 flex items-center justify-center pb-[20%] text-4xl opacity-40">🃏</span>}
      {/* Namensschild */}
      <span className="absolute bottom-[6%] left-[20%] right-[6%] rounded-md bg-black/35 px-2 py-1.5 backdrop-blur-sm">
        <span className="block truncate text-sm font-bold leading-tight text-white">{name}</span>
        <span className="block truncate text-[11px] text-white/75">
          {locked === "private" ? "🔒 " : locked === "followers" ? "👥 " : ""}
          {subtitle}
        </span>
      </span>
    </div>
  );
}
