"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { syncInstagramNow, type InstagramState } from "@/lib/actions/events";

export function InstagramButton() {
  const t = useTranslations("Instagram");
  const [state, action, pending] = useActionState<InstagramState, FormData>(() => syncInstagramNow(), {});
  return (
    <form action={action} className="space-y-2">
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? t("syncing") : t("syncNow")}
      </button>
      {state.ok && (
        <p role="status" className="text-sm text-ok">
          {t("imported", { count: state.imported ?? 0 })}
          {state.pending ? ` ${t("pending", { count: state.pending })}` : ""}
        </p>
      )}
      <FormError code={state.error} />
    </form>
  );
}
