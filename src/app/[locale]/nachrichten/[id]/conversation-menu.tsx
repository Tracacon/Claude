"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError } from "@/components/form-error";
import { blockUser, hideConversation, reportConversation, type ChatActionState } from "@/lib/actions/chat";
import { REPORT_REASONS } from "@/lib/marketplace";

/** Menü einer Unterhaltung: Melden, Blockieren, Ausblenden. */
export function ConversationMenu({
  conversationId,
  otherId,
  otherNickname,
  iBlocked,
}: {
  conversationId: string;
  otherId: string;
  otherNickname: string;
  iBlocked: boolean;
}) {
  const t = useTranslations("Chat");
  const tL = useTranslations("Listing");
  const tReason = useTranslations("ReportReason");
  const [open, setOpen] = useState<null | "menu" | "report" | "block">(null);
  const [reportState, reportAction, reporting] = useActionState<ChatActionState, FormData>(reportConversation, {});
  const [blockState, blockAction, blocking] = useActionState<ChatActionState, FormData>(blockUser, {});
  const [hideState, hideAction, hiding] = useActionState<ChatActionState, FormData>(hideConversation, {});

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open !== null}
        aria-haspopup="menu"
        onClick={() => setOpen(open ? null : "menu")}
        className="rounded-lg px-3 py-1.5 text-lg leading-none hover:bg-white/5"
        aria-label={t("options")}
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-72 space-y-3 rounded-2xl border border-white/15 bg-night-2 p-4 shadow-xl">
          {open === "menu" && (
            <div className="flex flex-col items-stretch gap-2">
              <button type="button" className="btn-ghost justify-start" onClick={() => setOpen("report")}>⚑ {t("report")}</button>
              <button type="button" className="btn-ghost justify-start" onClick={() => setOpen("block")}>
                ⦸ {iBlocked ? t("unblock") : t("block")}
              </button>
              <form action={hideAction}>
                <input type="hidden" name="conversationId" value={conversationId} />
                <button type="submit" className="btn-ghost w-full justify-start" disabled={hiding}>🗑 {t("hide")}</button>
                <p className="hint">{t("hideHint")}</p>
                <FormError code={hideState.error} />
              </form>
            </div>
          )}

          {open === "report" &&
            (reportState.ok ? (
              <p role="status" className="text-sm text-ok">{tL("reportSent")}</p>
            ) : (
              <form action={reportAction} className="space-y-3" noValidate>
                <p className="text-sm">{t("reportIntro")}</p>
                <input type="hidden" name="conversationId" value={conversationId} />
                <div>
                  <label htmlFor="chat-reason" className="label">{tL("reportReason")}</label>
                  <select id="chat-reason" name="reason" defaultValue="" className="input">
                    <option value="" disabled>{tL("choose")}</option>
                    {REPORT_REASONS.map((r) => <option key={r} value={r}>{tReason(r)}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="chat-details" className="label">{tL("reportDetails")}</label>
                  <textarea id="chat-details" name="details" rows={2} maxLength={1000} className="input" />
                </div>
                <FormError code={reportState.error} />
                <button type="submit" className="btn-primary" disabled={reporting}>{tL("reportSend")}</button>
              </form>
            ))}

          {open === "block" &&
            (blockState.ok ? (
              <p role="status" className="text-sm text-ok">{t("saved")}</p>
            ) : (
              <form action={blockAction} className="space-y-3">
                <input type="hidden" name="userId" value={otherId} />
                {iBlocked && <input type="hidden" name="unblock" value="1" />}
                <p className="text-sm">
                  {iBlocked ? t("unblockConfirm", { nickname: otherNickname }) : t("blockConfirm", { nickname: otherNickname })}
                </p>
                <FormError code={blockState.error} />
                <button type="submit" className={iBlocked ? "btn-ghost" : "btn-danger"} disabled={blocking}>
                  {iBlocked ? t("unblock") : t("block")}
                </button>
              </form>
            ))}

          <button type="button" className="link text-sm" onClick={() => setOpen(null)}>{t("close")}</button>
        </div>
      )}
    </div>
  );
}
