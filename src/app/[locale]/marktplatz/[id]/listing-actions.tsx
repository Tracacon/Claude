"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError } from "@/components/form-error";
import { deleteListing, reportContent, setListingStatus, type SimpleState } from "@/lib/actions/listings";
import { startConversation, type ChatActionState } from "@/lib/actions/chat";
import { moderateListing, type ModerationState } from "@/lib/actions/moderation";
import { REMOVAL_REASONS, REPORT_REASONS, type ListingStatus } from "@/lib/marketplace";

export function StatusSwitch({ id, status }: { id: string; status: ListingStatus }) {
  const t = useTranslations("Listing");
  const tStatus = useTranslations("Status");
  const [state, action, pending] = useActionState<SimpleState, FormData>(setListingStatus, {});

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <p className="label">{t("changeStatus")}</p>
      <div className="flex flex-wrap gap-2">
        {(["collection", "active", "reserved", "done"] as const).map((s) => (
          <button
            key={s}
            type="submit"
            name="status"
            value={s}
            disabled={pending || s === status}
            aria-pressed={s === status}
            className={`btn border ${s === status ? "border-brand bg-brand/15 text-brand" : "border-line hover:bg-white/5"}`}
          >
            {tStatus(s)}
          </button>
        ))}
      </div>
      {state.ok && !pending && <p role="status" className="text-sm text-ok">{t("statusSaved")}</p>}
      <FormError code={state.error} />
    </form>
  );
}

export function DeleteListing({ id }: { id: string }) {
  const t = useTranslations("Listing");
  const [state, action, pending] = useActionState<SimpleState, FormData>(deleteListing, {});
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-sm text-danger hover:underline">
        {t("delete")}
      </button>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-xl border border-danger/40 p-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm">{t("deleteConfirm")}</p>
      <fieldset>
        <legend className="label">{t("removalReason")}</legend>
        <div className="flex flex-wrap gap-2">
          {REMOVAL_REASONS.map((r) => (
            <label key={r} className="btn cursor-pointer border border-line has-[:checked]:border-brand has-[:checked]:bg-brand/15 has-[:checked]:text-brand">
              <input type="radio" name="reason" value={r} required className="sr-only" />
              {t(`removal_${r}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex gap-2">
        <button type="submit" className="btn-danger" disabled={pending}>{t("deleteYes")}</button>
        <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>{t("cancel")}</button>
      </div>
      <FormError code={state.error} />
    </form>
  );
}

export function ReportForm({ listingId, profileId, label }: { listingId?: string; profileId?: string; label: string }) {
  const t = useTranslations("Listing");
  const tReason = useTranslations("ReportReason");
  const [state, action, pending] = useActionState<SimpleState, FormData>(reportContent, {});

  if (state.ok) return <p role="status" className="card text-sm text-ok">{t("reportSent")}</p>;
  return (
    <details className="card">
      <summary className="cursor-pointer text-sm text-cream/70">⚑ {label}</summary>
      <form action={action} className="mt-3 space-y-3" noValidate>
        {listingId && <input type="hidden" name="listingId" value={listingId} />}
        {profileId && <input type="hidden" name="profileId" value={profileId} />}
        <div>
          <label htmlFor="reason" className="label">{t("reportReason")}</label>
          <select id="reason" name="reason" required defaultValue="" className="input">
            <option value="" disabled>{t("choose")}</option>
            {REPORT_REASONS.map((r) => <option key={r} value={r}>{tReason(r)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="details" className="label">{t("reportDetails")}</label>
          <textarea id="details" name="details" rows={3} maxLength={1000} className="input" />
        </div>
        <FormError code={state.error} />
        <button type="submit" className="btn-ghost" disabled={pending}>{t("reportSend")}</button>
      </form>
    </details>
  );
}

export function ModerateListing({ id, removed }: { id: string; removed: boolean }) {
  const t = useTranslations("Listing");
  const [state, action, pending] = useActionState<ModerationState, FormData>(moderateListing, {});

  return (
    <section className="card space-y-3 border-brand/40">
      <h2 className="font-semibold text-brand">{t("moderate")}</h2>
      <form action={action} className="space-y-3" noValidate>
        <input type="hidden" name="listingId" value={id} />
        {removed ? (
          <button type="submit" name="action" value="restore" className="btn-ghost" disabled={pending}>
            {t("moderateRestore")}
          </button>
        ) : (
          <>
            <div>
              <label htmlFor="mod-reason" className="label">{t("moderateReason")}</label>
              <textarea id="mod-reason" name="reason" rows={2} maxLength={1000} className="input" />
            </div>
            <button type="submit" name="action" value="remove" className="btn-danger" disabled={pending}>
              {t("moderateRemove")}
            </button>
          </>
        )}
        {state.ok && !pending && <p role="status" className="text-sm text-ok">{t("moderated")}</p>}
        <FormError code={state.error} />
      </form>
    </section>
  );
}

export function StartConversation({ listingId, label }: { listingId: string; label: string }) {
  const [state, action, pending] = useActionState<ChatActionState, FormData>(startConversation, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="listingId" value={listingId} />
      <button type="submit" className="btn-primary w-full" disabled={pending}>✉ {label}</button>
      <FormError code={state.error} />
    </form>
  );
}
