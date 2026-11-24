"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { updatePrivacy, type SocialState } from "@/lib/actions/social";

export function PrivacyForm({ visibility, approval }: { visibility: "public" | "followers"; approval: boolean }) {
  const t = useTranslations("Settings");
  const [state, action, pending] = useActionState<SocialState, FormData>(updatePrivacy, {});

  return (
    <form action={action} className="card space-y-4">
      <div>
        <h2 className="font-semibold">{t("privacy")}</h2>
        <p className="text-sm text-cream/70">{t("privacyIntro")}</p>
      </div>
      <fieldset className="space-y-2">
        <legend className="label">{t("whoSees")}</legend>
        <label className="flex items-start gap-3 rounded-xl border border-white/10 p-3">
          <input type="radio" name="visibility" value="public" defaultChecked={visibility === "public"} className="mt-1 size-5 accent-amber" />
          <span>
            <span className="block font-semibold">{t("public")}</span>
            <span className="text-sm text-cream/70">{t("publicText")}</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-white/10 p-3">
          <input type="radio" name="visibility" value="followers" defaultChecked={visibility === "followers"} className="mt-1 size-5 accent-amber" />
          <span>
            <span className="block font-semibold">🔒 {t("followersOnly")}</span>
            <span className="text-sm text-cream/70">{t("followersOnlyText")}</span>
          </span>
        </label>
      </fieldset>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="approval" defaultChecked={approval} className="mt-1 size-5 accent-amber" />
        <span>
          <span className="block font-semibold">{t("approval")}</span>
          <span className="text-sm text-cream/70">{t("approvalText")}</span>
        </span>
      </label>
      <p className="text-xs text-cream/60">{t("marketNote")}</p>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>{t("save")}</button>
        {state.ok && !pending && <span role="status" className="text-sm text-ok">{t("saved")}</span>}
      </div>
      <FormError code={state.error} />
    </form>
  );
}
