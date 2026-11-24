"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { renewCheckinCode, type CodeState } from "@/lib/actions/events";

export function PosterActions({ eventId }: { eventId: string }) {
  const t = useTranslations("Events");
  const [state, action, pending] = useActionState<CodeState, FormData>(renewCheckinCode, {});
  return (
    <div className="flex flex-wrap items-start gap-3 print:hidden">
      <button type="button" className="btn-primary" onClick={() => window.print()}>
        🖨️ {t("print")}
      </button>
      <form
        action={action}
        onSubmit={(e) => {
          if (!confirm(t("renewConfirm"))) e.preventDefault();
        }}
      >
        <input type="hidden" name="eventId" value={eventId} />
        <button type="submit" className="btn-ghost" disabled={pending}>
          {t("renew")}
        </button>
      </form>
      {state.ok && <p role="status" className="text-sm text-ok">{t("renewed")}</p>}
      <FormError code={state.error} />
    </div>
  );
}
