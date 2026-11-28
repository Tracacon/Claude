"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError } from "@/components/form-error";
import { MoreIcon } from "@/components/icons";
import { deletePost, highlightPost, reportPostOrComment, type PostState } from "@/lib/actions/posts";
import { REPORT_REASONS } from "@/lib/marketplace";

/** Drei Punkte am Beitrag: Melden, Löschen (eigener), Hervorheben (Team) */
export function PostMenu({
  postId,
  isMine,
  isTeam,
  highlighted,
  loggedIn,
}: {
  postId: string;
  isMine: boolean;
  isTeam: boolean;
  highlighted: boolean;
  loggedIn: boolean;
}) {
  const t = useTranslations("Feed");
  const tReason = useTranslations("ReportReason");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "report" | "delete">("menu");
  const [reportState, reportAction, reporting] = useActionState<PostState, FormData>(reportPostOrComment, {});
  const [delState, delAction, deleting] = useActionState<PostState, FormData>(deletePost, {});
  const [hlState, hlAction, hlPending] = useActionState<PostState, FormData>(highlightPost, {});

  const close = () => {
    setOpen(false);
    setMode("menu");
  };
  const row = "flex w-full items-center justify-center border-b border-line px-4 py-3.5 text-center last:border-b-0 hover:bg-tint/5";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("more")} className="rounded-full p-1.5 text-cream/80 hover:text-cream">
        <MoreIcon className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={t("more")}>
          <button type="button" aria-label={t("close")} className="absolute inset-0 bg-night/75" onClick={close} />
          <div className="relative w-full max-w-sm overflow-hidden rounded-t-3xl border border-line bg-night-2 pb-[env(safe-area-inset-bottom)] sm:rounded-3xl">
            {mode === "menu" && (
              <div>
                {loggedIn && !isMine && (
                  <button type="button" className={`${row} font-semibold text-danger`} onClick={() => setMode("report")}>{t("report")}</button>
                )}
                {isMine && (
                  <button type="button" className={`${row} font-semibold text-danger`} onClick={() => setMode("delete")}>{t("delete")}</button>
                )}
                {isTeam && (
                  <form action={hlAction}>
                    <input type="hidden" name="postId" value={postId} />
                    <input type="hidden" name="on" value={highlighted ? "0" : "1"} />
                    <button type="submit" className={row} disabled={hlPending}>
                      {hlState.ok ? t("saved") : highlighted ? t("unhighlight") : t("highlight")}
                    </button>
                  </form>
                )}
                <button
                  type="button"
                  className={row}
                  onClick={() => {
                    void navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname.split("/").slice(0, 2).join("/")}/p/${postId}`);
                    close();
                  }}
                >
                  {t("copyLink")}
                </button>
                <button type="button" className={row} onClick={close}>{t("cancel")}</button>
              </div>
            )}
            {mode === "report" &&
              (reportState.ok ? (
                <div className="space-y-3 p-5 text-center">
                  <p role="status" className="font-semibold text-ok">{t("reportSent")}</p>
                  <button type="button" className="btn-ghost" onClick={close}>{t("close")}</button>
                </div>
              ) : (
                <form action={reportAction} className="space-y-3 p-5" noValidate>
                  <p className="font-display font-semibold">{t("reportTitle")}</p>
                  <input type="hidden" name="target" value="post" />
                  <input type="hidden" name="id" value={postId} />
                  <fieldset className="space-y-1">
                    <legend className="label">{t("reportWhy")}</legend>
                    {REPORT_REASONS.map((r) => (
                      <label key={r} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-tint/5">
                        <input type="radio" name="reason" value={r} className="accent-brand" />
                        {tReason(r)}
                      </label>
                    ))}
                  </fieldset>
                  <label htmlFor={`d-${postId}`} className="label">{t("reportDetails")}</label>
                  <textarea id={`d-${postId}`} name="details" rows={2} maxLength={1000} className="input" />
                  <FormError code={reportState.error} />
                  <div className="flex gap-2">
                    <button type="submit" className="btn-danger" disabled={reporting}>{t("reportSend")}</button>
                    <button type="button" className="btn-ghost" onClick={close}>{t("cancel")}</button>
                  </div>
                </form>
              ))}
            {mode === "delete" && (
              <form action={delAction} className="space-y-3 p-5 text-center">
                <input type="hidden" name="postId" value={postId} />
                <p className="font-display text-lg font-semibold">{t("deleteTitle")}</p>
                <p className="text-sm text-cream/70">{t("deleteText")}</p>
                <FormError code={delState.error} />
                <div className="flex justify-center gap-2">
                  <button type="submit" className="btn-danger" disabled={deleting}>{t("delete")}</button>
                  <button type="button" className="btn-ghost" onClick={close}>{t("cancel")}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
