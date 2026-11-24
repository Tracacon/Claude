/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Avatar } from "@/components/avatar";
import { PriceTag } from "@/components/listing-card";
import { Link } from "@/i18n/navigation";
import { requireProfile } from "@/lib/auth";
import type { ChatMessage, ConversationHead } from "@/lib/chat";
import { UUID_PATTERN, photoUrl } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";
import { ChatThread } from "./chat-thread";
import { ConversationMenu } from "./conversation-menu";

export async function generateMetadata({ params }: PageProps<"/[locale]/nachrichten/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Chat" });
  return { title: t("title") };
}

export default async function ConversationPage({ params }: PageProps<"/[locale]/nachrichten/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const me = await requireProfile();
  if (!UUID_PATTERN.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: head }, { data: messages }] = await Promise.all([
    supabase.rpc("get_conversation", { p_conversation_id: id }),
    supabase.rpc("get_messages", { p_conversation_id: id, p_limit: 200 }),
  ]);
  if (!head) notFound();
  const c = head as ConversationHead;
  // Beim Öffnen gelesen markieren (zuverlässig auf dem Server; der Browser markiert neue Nachrichten nach)
  await supabase.rpc("mark_conversation_read", { p_conversation_id: id });
  const t = await getTranslations("Chat");
  const tStatus = await getTranslations("Status");
  const blocked = c.i_blocked || c.blocked_me;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link href="/nachrichten" className="rounded-lg px-2 py-1 text-cream/70 hover:bg-white/5" aria-label={t("back")}>←</Link>
        <Link href={`/u/${c.other_nickname}`} className="flex min-w-0 flex-1 items-center gap-2">
          <Avatar userId={c.other_id} avatarId={c.other_avatar_id} nickname={c.other_nickname} size="xs" />
          <h1 className="truncate text-lg font-bold">@{c.other_nickname}</h1>
        </Link>
        <ConversationMenu conversationId={c.id} otherId={c.other_id} otherNickname={c.other_nickname} iBlocked={c.i_blocked} />
      </div>

      {c.listing_id ? (
        <Link href={`/marktplatz/${c.listing_id}`} className="card flex items-center gap-3 p-3 hover:border-brand/50 sm:p-3">
          <div className="h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-night-3">
            {c.cover_photo_id && c.listing_owner_id && (
              <img src={photoUrl(c.listing_owner_id, c.cover_photo_id, "thumb")} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{c.listing_title}</p>
            <p className="text-sm text-brand">
              {c.listing_offer && <PriceTag offer={c.listing_offer} cents={c.listing_price_cents} negotiable={false} />}
              {c.listing_status && c.listing_status !== "active" && (
                <span className="ml-2 text-xs text-cream/60">({tStatus(c.listing_status)})</span>
              )}
            </p>
          </div>
        </Link>
      ) : (
        <p className="card p-3 text-sm text-cream/70 sm:p-3">{t("listingGone", { title: c.listing_title })}</p>
      )}

      <p className="rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-xs text-cream/80">{t("safety")}</p>

      <ChatThread
        conversationId={c.id}
        meId={me.id}
        otherNickname={c.other_nickname}
        initialMessages={(messages ?? []) as ChatMessage[]}
        canSend={!blocked}
      />

      {blocked && (
        <p role="status" className="card text-sm text-cream/80">
          {c.i_blocked ? t("youBlocked", { nickname: c.other_nickname }) : t("blockedYou")}
        </p>
      )}
    </div>
  );
}
