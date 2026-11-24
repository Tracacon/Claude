"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { removeFollower, respondFollowRequest, type SocialState } from "@/lib/actions/social";

export function RemoveFollowerButton({ userId }: { userId: string }) {
  const t = useTranslations("Social");
  const [state, action, pending] = useActionState<SocialState, FormData>(removeFollower, {});
  if (state.ok) return <span className="text-xs text-cream/60">{t("removed")}</span>;
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" className="btn-ghost px-3 py-1.5" disabled={pending}>{t("remove")}</button>
      <FormError code={state.error} />
    </form>
  );
}

export function RequestButtons({ userId }: { userId: string }) {
  const t = useTranslations("Social");
  const [state, action, pending] = useActionState<SocialState, FormData>(respondFollowRequest, {});
  if (state.ok) return <span className="text-xs text-ok">{t("done")}</span>;
  return (
    <form action={action} className="flex gap-2">
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" name="accept" value="1" className="btn-primary px-3 py-1.5" disabled={pending}>{t("accept")}</button>
      <button type="submit" name="accept" value="0" className="btn-ghost px-3 py-1.5" disabled={pending}>{t("decline")}</button>
      <FormError code={state.error} />
    </form>
  );
}
