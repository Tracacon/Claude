import { getTranslations } from "next-intl/server";
import { Avatar } from "@/components/avatar";
import { Link } from "@/i18n/navigation";
import type { MiniProfile } from "@/lib/notifications";

/** News-Balken: neue Mitglieder laufen von rechts nach links durch. */
export async function NewMembersBar({ people }: { people: MiniProfile[] }) {
  if (people.length === 0) return null;
  const t = await getTranslations("Activity");
  // Mindestens 6 Namen pro Hälfte, dann zwei gleiche Hälften: so läuft das Band lückenlos
  let half = people;
  while (half.length < 6) half = [...half, ...people];
  const loop = [...half, ...half];
  const seconds = Math.max(20, loop.length * 4);
  return (
    <section aria-label={t("newMembers")} className="overflow-hidden rounded-2xl border border-line bg-night-2">
      <div className="flex items-center">
        <span className="shrink-0 border-r border-line bg-brand/15 px-3 py-2 text-xs font-bold uppercase tracking-wide text-brand">
          {t("newBadge")}
        </span>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {/* Für Screenreader und bei "weniger Bewegung": einfache Liste */}
          <ul className="sr-only">
            {people.map((p) => <li key={p.id}>{t("welcome", { nickname: p.nickname })}</li>)}
          </ul>
          <div
            aria-hidden
            className="flex w-max gap-6 py-2 pl-4 motion-safe:animate-[ticker_var(--d)_linear_infinite] motion-reduce:overflow-x-auto hover:[animation-play-state:paused]"
            style={{ "--d": `${seconds}s` } as React.CSSProperties}
          >
            {loop.map((p, i) => (
              <Link key={`${p.id}-${i}`} href={`/u/${p.nickname}`} tabIndex={-1} className="flex shrink-0 items-center gap-2 text-sm">
                <Avatar userId={p.id} avatarId={p.avatar_id} nickname={p.nickname} size="xs" />
                <span>{t.rich("welcomeRich", { nickname: p.nickname, b: (c) => <b className="font-semibold">{c}</b> })}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
