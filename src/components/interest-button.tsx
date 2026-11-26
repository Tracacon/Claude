"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { toggleInterest, type InterestActionState } from "@/lib/actions/interests";

/** „Tauschinteresse“ an einem Inserat – ein Tipp schaltet um. Sitzt unten rechts auf dem Inseratbild. */
export function InterestButton({ listingId, ownerId, initial }: { listingId: string; ownerId: string; initial: boolean }) {
  const t = useTranslations("Interest");
  const [state, action, pending] = useActionState<InterestActionState, FormData>(toggleInterest, {});
  const mine = state.ok ? Boolean(state.mine) : initial;
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="ownerId" value={ownerId} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={mine}
        title={mine ? t("activeHint") : t("hint")}
        className={`rounded-full px-4 py-2.5 text-sm font-bold shadow-lg backdrop-blur transition ${
          mine ? "bg-brand text-night" : "border border-white/25 bg-night/80 text-cream hover:bg-night"
        }`}
      >
        {mine ? `✓ ${t("active")}` : `🔁 ${t("button")}`}
      </button>
      {state.error && (
        <span className="rounded-lg bg-night/90 px-2 py-1">
          <FormError code={state.error} />
        </span>
      )}
    </form>
  );
}
