/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */
import { BINDER_COLOR_STYLES, type BinderColor } from "@/lib/binder-shared";

/**
 * Einband eines Sammelkartenbinders: Ledereffekt in der Binderfarbe, Rücken mit Nähten,
 * Sichtfenster mit der Vorderseite der ersten Karte und Namensschild.
 */
export function BinderCover({
  name,
  color,
  coverUrl,
  subtitle,
  locked,
  dashed = false,
}: {
  name: string;
  color: BinderColor;
  coverUrl: string | null;
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
      {/* Lederstruktur */}
      {!dashed && (
        <span
          aria-hidden
          className="absolute inset-0 opacity-25 mix-blend-overlay"
          style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 4px)" }}
        />
      )}
      {/* Rücken mit Naht */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[14%]"
        style={{ background: dashed ? "transparent" : `linear-gradient(90deg, ${c.edge}, ${c.base})` }}
      />
      {!dashed && <span aria-hidden className="absolute inset-y-2 left-[14%] border-l border-dashed border-white/30" />}
      <span aria-hidden className="absolute inset-y-2 right-2 rounded-r-xl border border-dashed border-white/20" style={{ left: "17%" }} />

      {/* Sichtfenster mit Vorderseite der ersten Karte */}
      <span className="absolute left-[30%] right-[16%] top-[12%] aspect-[63/88] overflow-hidden rounded-md border border-white/40 bg-black/30 shadow-inner">
        {coverUrl ? (
          <img src={coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-2xl opacity-60" aria-hidden>🃏</span>
        )}
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(130deg,rgba(255,255,255,0.35)_0%,transparent_35%,transparent_70%,rgba(255,255,255,0.12)_100%)]" />
      </span>

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
