"use client";

import { FormError } from "@/components/form-error";

/** Eingabefeld für den sechsstelligen Code aus der E-Mail. */
export function CodeInput({ label, error }: { label: string; error?: string }) {
  return (
    <div>
      <label htmlFor="token" className="label">{label}</label>
      <input
        id="token"
        name="token"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={12}
        required
        autoFocus
        aria-invalid={Boolean(error)}
        aria-describedby="token-error"
        className="input text-center font-mono text-2xl tracking-[0.4em]"
      />
      <FormError id="token-error" code={error} />
    </div>
  );
}
