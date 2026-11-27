"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { startDirectConversation } from "@/lib/actions/chat";
import type { ChatActionState } from "@/lib/actions/chat";

/** Knopf "Nachricht" im Profil: öffnet bzw. startet die Unterhaltung mit dieser Person */
export function MessageButton({ userId }: { userId: string }) {
  const t = useTranslations("Social");
  const [state, action, pending] = useActionState<ChatActionState, FormData>(startDirectConversation, {});
  return (
    <form action={action} className="flex-1">
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" disabled={pending} className="btn-ghost w-full">
        {t("message")}
      </button>
      <FormError code={state.error} />
    </form>
  );
}
