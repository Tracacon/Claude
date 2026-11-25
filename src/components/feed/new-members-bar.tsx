import { getTranslations } from "next-intl/server";
import { Avatar } from "@/components/avatar";
import { Link } from "@/i18n/navigation";
import type { MiniProfile } from "@/lib/notifications";

/**
 * Schmaler News-Balken unter der Kopfzeile, auf jeder Seite sichtbar:
 * neue Mitglieder laufen von rechts nach links durch. Antippen öffnet das Profil, darüberfahren hält an.
 */
export async function NewMembersBar({ people }: { people: MiniProfile[] }) {
  if (people.length === 0) return null;
  const t = await getTranslations("Activity");
  // Mindestens 6 Namen pro Hälfte, dann zwei gleiche Hälften: so läuft das Band lückenlos
  let half = people;
  while (half.length < 6) half = [...half, ...people];
  const loop = [...half, ...half];
  const seconds = Math.max(24, loop.length * 4);
  return (
    <section aria-label={t("newMembers")} className="border-t border-line bg-night-2/95">
      <div className="mx-auto flex h-8 max-w-5xl items-center">
        <span className="flex h-full shrink-0 items-center bg-brand/15 px-3 text-[11px] font-bold uppercase tracking-wide text-brand">
          {t("newBadge")}
        </span>
        <div className="relative h-full min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-24px),transparent)]">
          {/* Für Screenreader: einfache Liste mit Links */}
          <ul className="sr-only">
            {people.map((p) => (
              <li key={p.id}>
                <Link href={`/u/${p.nickname}`}>{t("welcome", { nickname: p.nickname })}</Link>
              </li>
            ))}
          </ul>
          <div
            aria-hidden
            className="flex h-full w-max items-center gap-6 pl-3 motion-safe:animate-[ticker_var(--d)_linear_infinite] motion-reduce:overflow-x-auto hover:[animation-play-state:paused]"
            style={{ "--d": `${seconds}s` } as React.CSSProperties}
          >
            {loop.map((p, i) => (
              <Link key={`${p.id}-${i}`} href={`/u/${p.nickname}`} tabIndex={-1} className="flex shrink-0 items-center gap-1.5 text-xs text-cream/85 hover:text-brand">
                <Avatar userId={p.id} avatarId={p.avatar_id} nickname={p.nickname} size="2xs" />
                <span>{t.rich("welcomeRich", { nickname: p.nickname, b: (c) => <b className="font-semibold text-cream">{c}</b> })}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
