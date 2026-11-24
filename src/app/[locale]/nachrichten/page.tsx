/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Avatar } from "@/components/avatar";
import { Link } from "@/i18n/navigation";
import { requireProfile } from "@/lib/auth";
import type { ConversationSummary } from "@/lib/chat";
import { photoUrl } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";
import { AutoRefresh } from "./auto-refresh";

export async function generateMetadata({ params }: PageProps<"/[locale]/nachrichten">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Chat" });
  return { title: t("title") };
}

export default async function InboxPage({ params }: PageProps<"/[locale]/nachrichten">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireProfile();

  const supabase = await createClient();
  const { data } = await supabase.rpc("list_conversations");
  const items = (data ?? []) as ConversationSummary[];
  const t = await getTranslations("Chat");
  const format = await getFormatter();
  const today = new Date().toDateString();

  return (
    <div className="space-y-4">
      <AutoRefresh />
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {items.length === 0 ? (
        <div className="card space-y-2 text-cream/70">
          <p>{t("inboxEmpty")}</p>
          <Link href="/marktplatz" className="link text-sm">{t("toMarket")} →</Link>
        </div>
      ) : (
        <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-night-2">
          {items.map((c) => {
            const d = new Date(c.last_message_at);
            const when = d.toDateString() === today
              ? format.dateTime(d, { timeStyle: "short" })
              : format.dateTime(d, { day: "2-digit", month: "2-digit" });
            return (
              <li key={c.id}>
                <Link href={`/nachrichten/${c.id}`} className="flex items-center gap-3 p-3 hover:bg-white/5">
                  <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-night-3">
                    {c.cover_photo_id && c.listing_owner_id && (
                      <img src={photoUrl(c.listing_owner_id, c.cover_photo_id, "thumb")} alt="" loading="lazy" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Avatar userId={c.other_id} avatarId={c.other_avatar_id} nickname={c.other_nickname} size="xs" />
                      <p className={`truncate ${c.unread > 0 ? "font-bold" : "font-semibold"}`}>@{c.other_nickname}</p>
                      <span className="ml-auto shrink-0 text-xs text-cream/50">{when}</span>
                    </div>
                    <p className="truncate text-xs text-cream/60">
                      {c.i_am_seller ? t("yourListing") : t("listing")}: {c.listing_title}
                    </p>
                    <p className={`truncate text-sm ${c.unread > 0 ? "text-cream" : "text-cream/70"}`}>
                      {c.last_from_me ? `${t("you")}: ` : ""}
                      {c.last_has_photo ? `📷 ${c.last_body || t("photo")}` : c.last_body}
                    </p>
                  </div>
                  {c.unread > 0 && (
                    <span className="shrink-0 rounded-full bg-amber px-2 py-0.5 text-xs font-bold text-night" aria-label={t("unread", { count: c.unread })}>
                      {c.unread}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
