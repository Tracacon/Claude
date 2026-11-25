"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { updateProfile, type FormState } from "@/lib/actions/profile";

type Values = { city: string; bio: string; website: string; instagram: string; locale: string };

export function ProfileForm({ initial }: { initial: Values }) {
  const t = useTranslations("Profile");
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfile, { values: initial });
  const v = (state.values ?? initial) as Values;

  return (
    <form action={action} className="card space-y-4" noValidate>
      <div>
        <label htmlFor="city" className="label">{t("city")}</label>
        <input id="city" name="city" maxLength={80} autoComplete="address-level2" defaultValue={v.city} className="input" />
        <FormError code={state.errors?.city} />
      </div>
      <div>
        <label htmlFor="bio" className="label">{t("bio")}</label>
        <textarea id="bio" name="bio" rows={4} maxLength={500} defaultValue={v.bio} className="input" aria-describedby="bio-hint" />
        <p id="bio-hint" className="hint">{t("bioHint")}</p>
        <FormError code={state.errors?.bio} />
      </div>
      <div>
        <label htmlFor="instagram" className="label">{t("instagram")}</label>
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cream/50">@</span>
          <input
            id="instagram"
            name="instagram"
            maxLength={200}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t("instagramPlaceholder")}
            defaultValue={v.instagram}
            className="input pl-8"
            aria-describedby="instagram-hint"
          />
        </div>
        <p id="instagram-hint" className="hint">{t("instagramHint")}</p>
        <FormError code={state.errors?.instagram} />
      </div>
      <div>
        <label htmlFor="website" className="label">{t("website")}</label>
        <input
          id="website"
          name="website"
          type="url"
          inputMode="url"
          maxLength={200}
          placeholder="https://"
          defaultValue={v.website}
          className="input"
          aria-describedby="website-hint"
        />
        <p id="website-hint" className="hint">{t("websiteHint")}</p>
        <FormError code={state.errors?.website} />
      </div>
      <div>
        <label htmlFor="locale" className="label">{t("locale")}</label>
        <select id="locale" name="locale" defaultValue={v.locale} className="input">
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      </div>
      <FormError code={state.errors?._form} />
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </button>
        {state.ok && !pending && <span role="status" className="text-sm text-ok">{t("saved")}</span>}
      </div>
    </form>
  );
}
