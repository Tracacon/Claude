"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { FormError } from "@/components/form-error";
import { Link } from "@/i18n/navigation";
import { addComment, deleteComment, reportPostOrComment, type PostState } from "@/lib/actions/posts";
import { COMMENT_MAX, type PostComment } from "@/lib/feed-shared";

function CommentRow({ c, postId, loggedIn }: { c: PostComment; postId: string; loggedIn: boolean }) {
  const t = useTranslations("Feed");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const [delState, delAction, deleting] = useActionState<PostState, FormData>(deleteComment, {});
  const [repState, repAction, reporting] = useActionState<PostState, FormData>(reportPostOrComment, {});
  if (delState.ok) return null;
  return (
    <li className="flex gap-3">
      <Link href={`/u/${c.author_nickname}`} className="shrink-0">
        <Avatar userId={c.author_id} avatarId={c.author_avatar_id} nickname={c.author_nickname} size="xs" />
      </Link>
      <div className="min-w-0 flex-1 text-sm">
        <p className="whitespace-pre-line break-words">
          <Link href={`/u/${c.author_nickname}`} className="mr-1.5 font-semibold">{c.author_nickname}</Link>
          {c.body}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-cream/50">
          <time dateTime={c.created_at}>{format.relativeTime(new Date(c.created_at), now)}</time>
          {c.can_delete && (
            <form action={delAction}>
              <input type="hidden" name="commentId" value={c.id} />
              <input type="hidden" name="postId" value={postId} />
              <button type="submit" disabled={deleting} className="hover:text-danger">{t("deleteComment")}</button>
            </form>
          )}
          {loggedIn && !c.can_delete && (
            repState.ok ? (
              <span className="text-ok">{t("reportSent")}</span>
            ) : (
              <form action={repAction}>
                <input type="hidden" name="target" value="comment" />
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="reason" value="offensive" />
                <button type="submit" disabled={reporting} className="hover:text-danger">{t("reportComment")}</button>
              </form>
            )
          )}
        </div>
        <FormError code={delState.error ?? repState.error} />
      </div>
    </li>
  );
}

export function Comments({ postId, comments, loggedIn }: { postId: string; comments: PostComment[]; loggedIn: boolean }) {
  const t = useTranslations("Feed");
  const [state, action, pending] = useActionState<PostState, FormData>(addComment, {});
  const [text, setText] = useState("");
  const [seen, setSeen] = useState(state);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Nach erfolgreichem Senden Feld leeren (ohne Effekt mit setState)
  if (seen !== state) {
    setSeen(state);
    if (state.ok) setText("");
  }
  useEffect(() => {
    if (window.location.hash === "#kommentare") inputRef.current?.focus();
  }, []);

  return (
    <section id="kommentare" className="space-y-4 px-3 sm:px-0">
      <h2 className="font-display text-lg font-semibold">{t("commentsTitle", { count: comments.length })}</h2>
      {comments.length === 0 ? (
        <p className="text-sm text-cream/60">{t("noComments")}</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((c) => <CommentRow key={c.id} c={c} postId={postId} loggedIn={loggedIn} />)}
        </ul>
      )}
      {loggedIn ? (
        <form action={action} className="sticky bottom-[calc(env(safe-area-inset-bottom)+3.5rem)] flex items-end gap-2 border-t border-line bg-night py-3 sm:bottom-0">
          <input type="hidden" name="postId" value={postId} />
          <label htmlFor="comment" className="sr-only">{t("addComment")}</label>
          <textarea
            ref={inputRef}
            id="comment"
            name="body"
            rows={1}
            maxLength={COMMENT_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("addComment")}
            className="input resize-none"
          />
          <button type="submit" disabled={pending || !text.trim()} className="shrink-0 px-2 py-2 font-semibold text-brand disabled:opacity-40">
            {t("post")}
          </button>
        </form>
      ) : (
        <Link href="/anmelden" className="btn-ghost">{t("loginToComment")}</Link>
      )}
      <FormError code={state.error} />
    </section>
  );
}
