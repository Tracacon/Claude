"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { SearchIcon } from "@/components/icons";

/**
 * Suchfeld, das schon beim Tippen sucht (wie bei Instagram) –
 * kein Enter nötig. Die Ergebnisse rendert die Seite selbst.
 */
export function SearchBox({ initial, label, placeholder }: { initial: string; label: string; placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const go = (v: string) => {
    const q = v.trim();
    startTransition(() => {
      router.replace(q ? { pathname: pathname as "/suche", query: { q } } : (pathname as "/suche"), { scroll: false });
    });
  };

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        go(value);
        (document.activeElement as HTMLElement | null)?.blur();
      }}
    >
      <label htmlFor="q" className="sr-only">{label}</label>
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-cream/50" />
      <input
        id="q"
        name="q"
        type="search"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => go(v), 300);
        }}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
        className="input pl-10"
      />
      {pending && (
        <span aria-hidden className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-cream/30 border-t-brand" />
      )}
    </form>
  );
}
