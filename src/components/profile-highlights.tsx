/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BINDER_COLOR_STYLES } from "@/lib/binder-shared";
import type { Highlight } from "@/lib/highlights";
import { photoUrl } from "@/lib/marketplace";

/**
 * Highlights wie bei Instagram: runde Kreise mit Ring und Beschriftung, seitlich wischbar.
 * Jeder Kreis ist ein Binder; Tippen öffnet ihn. Auf dem eigenen Profil gibt es "Neu".
 */
export async function ProfileHighlights({
  nickname,
  highlights,
  isMe,
}: {
  nickname: string;
  highlights: Highlight[];
  isMe: boolean;
}) {
  const t = await getTranslations("Highlights");
  if (highlights.length === 0 && !isMe) return null;
  return (
    <ul className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" aria-label={t("title")}>
      {highlights.map((h) => {
        const img = h.cover_image
          ? photoUrl(h.owner_id, h.cover_image, "thumb")
          : h.card_photo
            ? photoUrl(h.owner_id, h.card_photo, "thumb")
            : null;
        const c = BINDER_COLOR_STYLES[h.color] ?? BINDER_COLOR_STYLES.night;
        return (
          <li key={h.id} className="w-[4.5rem] shrink-0">
            <Link href={`/u/${nickname}/binder/${h.binder_id}`} className="group block text-center">
              <span className="mx-auto block size-[4.25rem] rounded-full bg-[conic-gradient(from_180deg,var(--color-brand),#a77bff,#ff4fa3,var(--color-brand))] p-[2.5px] transition-transform group-hover:scale-105">
                <span className="block size-full rounded-full bg-night p-[2.5px]">
                  {img ? (
                    <img src={img} alt="" loading="lazy" className="size-full rounded-full object-cover" />
                  ) : (
                    <span
                      className="flex size-full items-center justify-center rounded-full text-xl"
                      style={{ background: `radial-gradient(circle at 30% 30%, ${c.base}, ${c.edge})` }}
                      aria-hidden
                    >
                      📁
                    </span>
                  )}
                </span>
              </span>
              <span className="mt-1 block truncate text-xs">{h.title}</span>
            </Link>
          </li>
        );
      })}
      {isMe && (
        <li className="w-[4.5rem] shrink-0">
          <Link href="/highlights" className="group block text-center">
            <span className="mx-auto flex size-[4.25rem] items-center justify-center rounded-full border-2 border-line text-3xl font-light text-cream/80 transition-colors group-hover:border-brand group-hover:text-brand">
              +
            </span>
            <span className="mt-1 block truncate text-xs">{highlights.length === 0 ? t("new") : t("edit")}</span>
          </Link>
        </li>
      )}
    </ul>
  );
}
