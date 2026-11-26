"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { toggleInterest, type InterestActionState } from "@/lib/actions/interests";

/** „Tauschinteresse“ an einem Inserat – ein Tipp schaltet um. */
export function InterestButton({ listingId, ownerId, initial }: { listingId: string; ownerId: string; initial: boolean }) {
  const t = useTranslations("Interest");
  const [state, action, pending] = useActionState<InterestActionState, FormData>(toggleInterest, {});
  const mine = state.ok ? Boolean(state.mine) : initial;
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="ownerId" value={ownerId} />
      <button type="submit" disabled={pending} aria-pressed={mine} className={`${mine ? "btn-primary" : "btn-ghost"} w-full`}>
        {mine ? `✓ ${t("active")}` : `🔁 ${t("button")}`}
      </button>
      <p className="text-xs text-cream/60">{mine ? t("activeHint") : t("hint")}</p>
      <FormError code={state.error} />
    </form>
  );
}
