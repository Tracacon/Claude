"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { syncEventsNow, type SyncState } from "@/lib/actions/events";

export function SyncButton() {
  const t = useTranslations("Events");
  const [state, action, pending] = useActionState<SyncState, FormData>(() => syncEventsNow(), {});
  return (
    <form action={action} className="space-y-2">
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? t("syncing") : t("syncNow")}
      </button>
      {state.ok && <p role="status" className="text-sm text-ok">{t("syncDone", { count: state.count ?? 0 })}</p>}
      <FormError code={state.error} />
    </form>
  );
}
