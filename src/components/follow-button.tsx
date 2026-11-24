"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { toggleFollow, type SocialState } from "@/lib/actions/social";
import type { FollowState } from "@/lib/social";

/** Folgen / Angefragt / Folge ich – ein Tipp schaltet um. */
export function FollowButton({ userId, initial, compact = false }: { userId: string; initial: FollowState; compact?: boolean }) {
  const t = useTranslations("Social");
  const [state, action, pending] = useActionState<SocialState, FormData>(toggleFollow, {});
  const current = (state.ok ? state.status : initial) as FollowState;
  const intent = current === "none" ? "follow" : "unfollow";
  const label = current === "accepted" ? t("following") : current === "pending" ? t("requested") : t("follow");
  const style = current === "none" ? "btn-primary" : "btn-ghost";

  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="intent" value={intent} />
      <button
        type="submit"
        disabled={pending}
        className={`${style} ${compact ? "px-3 py-1.5" : "min-w-28"}`}
        title={current === "none" ? undefined : t("unfollowHint")}
      >
        {label}
      </button>
      <FormError code={state.error} />
    </form>
  );
}
