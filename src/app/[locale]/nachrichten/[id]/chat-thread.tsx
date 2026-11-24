"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { PhotoSourceSheet } from "@/components/photo-source-sheet";
import { MESSAGE_MAX, type ChatMessage } from "@/lib/chat";
import { prepareImage } from "@/lib/image";
import { CHAT_PHOTO_BUCKET } from "@/lib/social";
import { createClient } from "@/lib/supabase/client";

// Signierte Adressen für Chat-Fotos (geschützter Speicher), pro Seite zwischengespeichert
const signedCache = new Map<string, Promise<string | null>>();

function signedUrl(client: ReturnType<typeof createClient>, path: string) {
  if (!signedCache.has(path)) {
    signedCache.set(
      path,
      client.storage
        .from(CHAT_PHOTO_BUCKET)
        .createSignedUrl(path, 60 * 60)
        .then(({ data }) => data?.signedUrl ?? null),
    );
  }
  return signedCache.get(path)!;
}

function ChatPhoto({ conversationId, photoId, label }: { conversationId: string; photoId: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void signedUrl(createClient(), `${conversationId}/${photoId}.jpg`).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [conversationId, photoId]);
  if (!url) return <div className="aspect-[3/4] w-48 animate-pulse rounded-xl bg-white/10" />;
  return (
    <a href={url} target="_blank" rel="noopener" aria-label={label} className="block">
      {/* eslint-disable-next-line @next/next/no-img-element -- signierte Adresse aus Supabase Storage */}
      <img src={url} alt="" className="max-h-72 w-auto max-w-full rounded-xl object-contain" />
    </a>
  );
}

const POLL_OFFLINE_MS = 4000; // ohne Echtzeit-Verbindung
const POLL_ONLINE_MS = 30000; // Sicherheitsnetz, falls ein Ereignis verloren geht

function mergeMessages(list: ChatMessage[], incoming: ChatMessage[]) {
  if (incoming.length === 0) return list;
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * Nachrichtenverlauf mit Eingabefeld.
 * Neue Nachrichten kommen per Supabase Realtime; fällt die Verbindung aus, wird regelmäßig nachgeladen.
 * Senden läuft direkt zu Supabase (Funktion send_message prüft Beteiligung, Sperren und Grenzen).
 */
export function ChatThread({
  conversationId,
  meId,
  otherNickname,
  initialMessages,
  canSend,
}: {
  conversationId: string;
  meId: string;
  otherNickname: string;
  initialMessages: ChatMessage[];
  canSend: boolean;
}) {
  const t = useTranslations("Chat");
  const tErr = useTranslations("Errors");
  const format = useFormatter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [photoSending, setPhotoSending] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [caption, setCaption] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastAt = useRef<string | null>(initialMessages.at(-1)?.created_at ?? null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  const supabase = useCallback(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }, []);

  const markRead = useCallback(() => {
    void supabase().rpc("mark_conversation_read", { p_conversation_id: conversationId });
  }, [conversationId, supabase]);

  const add = useCallback(
    (incoming: ChatMessage[]) => {
      if (incoming.length === 0) return;
      setMessages((prev) => mergeMessages(prev, incoming));
      const newest = incoming.reduce((a, m) => (m.created_at > a ? m.created_at : a), lastAt.current ?? "");
      lastAt.current = newest || lastAt.current;
      if (incoming.some((m) => m.sender_id !== meId)) markRead();
    },
    [markRead, meId],
  );

  const fetchNew = useCallback(async () => {
    const { data } = await supabase().rpc("get_messages", {
      p_conversation_id: conversationId,
      p_after: lastAt.current,
      p_limit: 200,
    });
    if (Array.isArray(data)) add(data as ChatMessage[]);
  }, [add, conversationId, supabase]);

  // Gelesen markieren beim Öffnen
  useEffect(() => {
    markRead();
  }, [markRead]);

  // Echtzeit-Verbindung
  useEffect(() => {
    const client = supabase();
    const channel = client
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => add([payload.new as ChatMessage]),
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      void client.removeChannel(channel);
    };
  }, [add, conversationId, supabase]);

  // Nachladen als Ersatz bzw. Sicherheitsnetz
  useEffect(() => {
    const timer = setInterval(() => void fetchNew(), live ? POLL_ONLINE_MS : POLL_OFFLINE_MS);
    const onVisible = () => document.visibilityState === "visible" && void fetchNew();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchNew, live]);

  // Zum neuesten Eintrag scrollen
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function errorCode(text: string) {
    return text.includes("rate_limited")
      ? "rate_limited"
      : text.includes("blocked")
        ? "blocked"
        : text.includes("messages_body") || text.includes("messages_content")
          ? "message_invalid"
          : text.includes("photo_missing")
            ? "photo_missing"
            : "generic";
  }

  function openPreview(file: File) {
    setCaption(draft);
    setPreview({ file, url: URL.createObjectURL(file) });
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  async function sendPhoto(file: File | undefined, text: string) {
    if (!file || photoSending) return;
    setPhotoSending(true);
    setError(null);
    try {
      const { full } = await prepareImage(file);
      const id = crypto.randomUUID();
      const client = supabase();
      const { error: upErr } = await client.storage
        .from(CHAT_PHOTO_BUCKET)
        .upload(`${conversationId}/${id}.jpg`, full, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw new Error("upload_failed");
      const { data, error: err } = await client.rpc("send_message", {
        p_conversation_id: conversationId,
        p_body: text.trim(),
        p_photo_id: id,
      });
      if (err) throw new Error(errorCode(err.message ?? ""));
      if (text.trim() === draft.trim()) setDraft("");
      if (data) add([data as ChatMessage]);
    } catch (e) {
      const code = e instanceof Error && e.message !== "not_an_image" ? e.message : "upload_failed";
      setError(tErr(tErr.has(code) ? code : "upload_failed"));
    } finally {
      setPhotoSending(false);
    }
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    if (body.length > MESSAGE_MAX) {
      setError(tErr("message_invalid"));
      return;
    }
    setSending(true);
    setError(null);
    const { data, error: err } = await supabase().rpc("send_message", { p_conversation_id: conversationId, p_body: body });
    setSending(false);
    if (err) {
      setError(tErr(errorCode(err.message ?? "")));
      return;
    }
    setDraft("");
    if (data) add([data as ChatMessage]);
  }

  // Datumszeile nur beim ersten Eintrag eines Tages
  const days = messages.map((m) => format.dateTime(new Date(m.created_at), { dateStyle: "medium" }));
  return (
    <div className="flex min-h-[50vh] flex-col">
      <ol className="flex-1 space-y-2 py-2" aria-live="polite" aria-label={t("history")}>
        {messages.length === 0 && <li className="py-6 text-center text-sm text-cream/60">{t("empty", { nickname: otherNickname })}</li>}
        {messages.map((m, i) => {
          const mine = m.sender_id === meId;
          const date = new Date(m.created_at);
          const day = days[i];
          const showDay = i === 0 || day !== days[i - 1];
          return (
            <li key={m.id} className="space-y-2">
              {showDay && <p className="py-1 text-center text-xs text-cream/50">{day}</p>}
              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
                    mine ? "rounded-br-md bg-brand text-night" : "rounded-bl-md bg-night-3 text-cream"
                  }`}
                >
                  <span className="sr-only">{mine ? t("you") : otherNickname}: </span>
                  {m.photo_id && (
                    <div className="mb-1">
                      <ChatPhoto conversationId={conversationId} photoId={m.photo_id} label={t("openPhoto")} />
                    </div>
                  )}
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  <p className={`mt-0.5 text-right text-[10px] ${mine ? "text-night/60" : "text-cream/50"}`}>
                    {format.dateTime(date, { timeStyle: "short" })}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div ref={bottomRef} />

      {canSend ? (
        <form
          className="sticky bottom-20 z-10 -mx-4 border-t border-line bg-night/95 px-4 py-3 backdrop-blur sm:bottom-0"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setSheet(true)}
              disabled={photoSending}
              className="btn-ghost shrink-0 px-3"
              aria-label={t("addPhoto")}
              title={t("addPhoto")}
            >
              <span aria-hidden>📷</span>
            </button>
            <label htmlFor="message" className="sr-only">{t("message")}</label>
            <textarea
              id="message"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={Math.min(5, Math.max(1, draft.split("\n").length))}
              maxLength={MESSAGE_MAX}
              placeholder={t("placeholder")}
              className="input resize-none"
            />
            <button type="submit" className="btn-primary shrink-0" disabled={sending || draft.trim() === ""}>
              {sending ? "…" : t("send")}
            </button>
          </div>
          {draft.length > MESSAGE_MAX - 100 && (
            <p className="hint">{draft.length} / {MESSAGE_MAX}</p>
          )}
          {photoSending && <p role="status" className="hint">{t("photoSending")}</p>}
          <PhotoSourceSheet
            idPrefix="chat-photo"
            open={sheet}
            onClose={() => setSheet(false)}
            onFiles={(files) => openPreview(files[0])}
            facing="environment"
            title={t("addPhoto")}
          />
          {error && <p role="alert" className="error">{error}</p>}
        </form>
      ) : null}

      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-night" role="dialog" aria-modal="true" aria-label={t("previewTitle")}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <button type="button" onClick={closePreview} className="text-cream/80">{t("cancel")}</button>
            <p className="font-semibold">{t("previewTitle")}</p>
            <span className="w-16" />
          </div>
          <div className="flex flex-1 items-center justify-center overflow-hidden bg-black p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- lokale Vorschau */}
            <img src={preview.url} alt="" className="max-h-full max-w-full object-contain" />
          </div>
          <form
            className="flex items-end gap-2 border-t border-line px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
            onSubmit={(e) => {
              e.preventDefault();
              const file = preview.file;
              closePreview();
              void sendPhoto(file, caption);
            }}
          >
            <label htmlFor="caption" className="sr-only">{t("caption")}</label>
            <textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={Math.min(4, Math.max(2, caption.split("\n").length))}
              maxLength={MESSAGE_MAX}
              placeholder={t("captionPlaceholder")}
              className="input resize-none"
            />
            <button type="submit" className="btn-primary shrink-0">{t("send")}</button>
          </form>
        </div>
      )}
    </div>
  );
}
