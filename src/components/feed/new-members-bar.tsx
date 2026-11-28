import { getTranslations } from "next-intl/server";
import type { MiniProfile } from "@/lib/notifications";
import { NewMembersTicker } from "./new-members-ticker";

/**
 * Schmaler News-Balken unter der Kopfzeile, auf jeder Seite sichtbar: neue Mitglieder laufen als
 * Laufschrift durch. Antippen klappt darunter eine Liste aller neuen Mitglieder auf.
 */
export async function NewMembersBar({ people }: { people: MiniProfile[] }) {
  if (people.length === 0) return null;
  const t = await getTranslations("Activity");
  return (
    <NewMembersTicker
      people={people}
      labels={{
        badge: t("newBadge"),
        title: t("newMembers"),
        open: t("newMembersOpen"),
        close: t("newMembersClose"),
        joined: t("newMembersJoined"),
        count: t("newMembersCount", { count: people.length }),
      }}
      welcome={people.map((p) => t("welcome", { nickname: p.nickname }))}
    />
  );
}
