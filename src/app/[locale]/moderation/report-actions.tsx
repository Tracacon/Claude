"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { closeReport, moderateListing, type ModerationState } from "@/lib/actions/moderation";

export function ReportActions({ reportId, listingId }: { reportId: string; listingId: string | null }) {
  const t = useTranslations("Moderation");
  const [removeState, removeAction, removing] = useActionState<ModerationState, FormData>(moderateListing, {});
  const [closeState, closeAction, closing] = useActionState<ModerationState, FormData>(closeReport, {});

  if (removeState.ok || closeState.ok) return <p role="status" className="text-sm text-ok">{t("done")}</p>;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {listingId && (
        <form action={removeAction} className="space-y-2" noValidate>
          <input type="hidden" name="listingId" value={listingId} />
          <input type="hidden" name="action" value="remove" />
          <label htmlFor={`reason-${reportId}`} className="label">{t("reason")}</label>
          <textarea id={`reason-${reportId}`} name="reason" rows={2} maxLength={1000} className="input" />
          <FormError code={removeState.error} />
          <button type="submit" className="btn-danger" disabled={removing}>{t("remove")}</button>
        </form>
      )}
      <form action={closeAction} className="space-y-2" noValidate>
        <input type="hidden" name="reportId" value={reportId} />
        <label htmlFor={`note-${reportId}`} className="label">{t("note")}</label>
        <textarea id={`note-${reportId}`} name="note" rows={2} maxLength={1000} className="input" />
        <FormError code={closeState.error} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="status" value="dismissed" className="btn-ghost" disabled={closing}>{t("dismiss")}</button>
          <button type="submit" name="status" value="resolved" className="btn-ghost" disabled={closing}>{t("resolve")}</button>
        </div>
      </form>
    </div>
  );
}
