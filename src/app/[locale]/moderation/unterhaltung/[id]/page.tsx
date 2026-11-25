import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/marketplace";
import { createClient } from "@/lib/supabase/server";
import { BrandText } from "@/components/brand-text";

type ModConversation = {
  id: string;
  listing_title: string;
  seller: string;
  buyer: string;
  messages: { from: string; body: string; photo_id: string | null; created_at: string }[];
};

export async function generateMetadata({ params }: PageProps<"/[locale]/moderation/unterhaltung/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Moderation" });
  return { title: t("readConversation") };
}

/** Gemeldete Unterhaltung für das Team (nur lesbar, wenn es eine Meldung dazu gibt). */
export default async function ModerationConversationPage({ params }: PageProps<"/[locale]/moderation/unterhaltung/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireRole("team", "admin");
  if (!UUID_PATTERN.test(id)) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("moderation_conversation", { p_conversation_id: id });
  if (error || !data) notFound();
  const c = data as ModConversation;
  // Fotos liegen im geschützten Speicher; das Team darf sie nach einer Meldung lesen
  const photoIds = c.messages.flatMap((m) => (m.photo_id ? [m.photo_id] : []));
  const signed = photoIds.length
    ? (await supabase.storage.from("chat-photos").createSignedUrls(photoIds.map((p) => `${c.id}/${p}.jpg`), 3600)).data ?? []
    : [];
  const photoUrl = new Map(signed.map((s, i) => [photoIds[i], s.signedUrl]));
  const t = await getTranslations("Moderation");
  const format = await getFormatter();

  return (
    <div className="space-y-4">
      <Link href="/moderation" className="link text-sm">← {t("title")}</Link>
      <h1 className="text-xl font-bold">{t("readConversation")}: <BrandText text={c.listing_title} /></h1>
      <p className="text-sm text-cream/70">{t("conversationBetween", { seller: c.seller, buyer: c.buyer })}</p>
      <p className="rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-xs">{t("privacyNote")}</p>
      <ol className="space-y-2">
        {c.messages.map((m, i) => (
          <li key={i} className="card p-3 sm:p-3">
            <p className="text-xs text-cream/60">
              @{m.from} · {format.dateTime(new Date(m.created_at), { dateStyle: "short", timeStyle: "short" })}
            </p>
            {m.photo_id && photoUrl.get(m.photo_id) && (
              // eslint-disable-next-line @next/next/no-img-element -- signierte Adresse aus Supabase Storage
              <img src={photoUrl.get(m.photo_id)!} alt="" className="my-1 max-h-72 rounded-xl" />
            )}
            {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
