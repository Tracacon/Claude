import { getTranslations } from "next-intl/server";
import { OnlineAvatar } from "@/components/online-avatar";
import { Link } from "@/i18n/navigation";
import type { MiniProfile } from "@/lib/notifications";

/** "Gerade online": Follower und Gefolgte, die jetzt in der App sind. */
export async function OnlineStrip({ people }: { people: MiniProfile[] }) {
  if (people.length === 0) return null;
  const t = await getTranslations("Activity");
  return (
    <section aria-label={t("onlineNow")} className="space-y-2">
      <h2 className="text-sm font-semibold text-cream/80">
        <span aria-hidden className="mr-1.5 inline-block size-2 rounded-full bg-ok align-middle" />
        {t("onlineNow")}
      </h2>
      <ul className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {people.map((p) => (
          <li key={p.id} className="w-16 shrink-0">
            <Link href={`/u/${p.nickname}`} className="flex flex-col items-center gap-1 text-center">
              <OnlineAvatar userId={p.id} avatarId={p.avatar_id} nickname={p.nickname} online size="md" label={t("online")} />
              <span className="w-full truncate text-xs text-cream/80">{p.nickname}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
