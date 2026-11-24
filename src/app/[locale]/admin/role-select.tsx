"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { changeRole, type RoleState } from "@/lib/actions/admin";
import type { AppRole } from "@/lib/auth";

const ROLES: AppRole[] = ["member", "team", "admin"];

export function RoleSelect({ userId, role, isSelf }: { userId: string; role: AppRole; isSelf: boolean }) {
  const t = useTranslations("Admin");
  const tr = useTranslations("Roles");
  const [state, action, pending] = useActionState<RoleState, FormData>(changeRole, {});

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex gap-2">
        <label htmlFor={`role-${userId}`} className="sr-only">{t("colRole")}</label>
        <select id={`role-${userId}`} name="role" defaultValue={role} className="input w-auto py-1.5 text-sm">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {tr(r)}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-ghost py-1.5" disabled={pending}>
          {t("change")}
        </button>
      </div>
      {isSelf && <span className="text-xs text-cream/50">{t("you")}</span>}
      {state.ok && !pending && <span role="status" className="text-xs text-ok">{t("changed")}</span>}
      <FormError code={state.error} />
    </form>
  );
}
