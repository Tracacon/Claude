"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { updatePresenceSettings, type PresenceState } from "@/lib/actions/presence";

export function PresenceForm({ showOnline, showSignup }: { showOnline: boolean; showSignup: boolean }) {
  const t = useTranslations("Settings");
  const [state, action, pending] = useActionState<PresenceState, FormData>(updatePresenceSettings, {});

  return (
    <form action={action} className="card space-y-4">
      <div>
        <h2 className="font-semibold">{t("presence")}</h2>
        <p className="text-sm text-cream/70">{t("presenceIntro")}</p>
      </div>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="show_online" defaultChecked={showOnline} className="mt-1 size-5 accent-brand" />
        <span>
          <span className="block font-semibold">{t("showOnline")}</span>
          <span className="text-sm text-cream/70">{t("showOnlineText")}</span>
        </span>
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="show_signup" defaultChecked={showSignup} className="mt-1 size-5 accent-brand" />
        <span>
          <span className="block font-semibold">{t("showSignup")}</span>
          <span className="text-sm text-cream/70">{t("showSignupText")}</span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>{t("save")}</button>
        {state.ok && !pending && <span role="status" className="text-sm text-ok">{t("saved")}</span>}
      </div>
      <FormError code={state.error} />
    </form>
  );
}
