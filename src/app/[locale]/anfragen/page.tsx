import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Avatar } from "@/components/avatar";
import { RequestButtons } from "@/components/social-buttons";
import { Link } from "@/i18n/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Request = { id: string; nickname: string; avatar_id: string | null; created_at: string };

export async function generateMetadata({ params }: PageProps<"/[locale]/anfragen">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Social" });
  return { title: t("requests") };
}

/** Offene Follower-Anfragen annehmen oder ablehnen. */
export default async function RequestsPage({ params }: PageProps<"/[locale]/anfragen">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_follow_requests");
  const items = (data ?? []) as Request[];
  const t = await getTranslations("Social");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("requests")}</h1>
      {!me.follow_approval && <p className="text-sm text-cream/70">{t("requestsOff")}</p>}
      {items.length === 0 ? (
        <p className="card text-sm text-cream/70">{t("noRequests")}</p>
      ) : (
        <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-line bg-night-2">
          {items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
              <Link href={`/u/${r.nickname}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar userId={r.id} avatarId={r.avatar_id} nickname={r.nickname} />
                <span className="truncate font-semibold">@{r.nickname}</span>
              </Link>
              <RequestButtons userId={r.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
