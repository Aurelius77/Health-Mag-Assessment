"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Language, LanguageCode } from "@/lib/types";
import { LANG_COOKIE } from "@/lib/lang-shared";

/**
 * Language switch. Writes the reader's choice to the `lang` cookie (a UI
 * preference, not a secret) and calls router.refresh() so the Server
 * Components re-render the page in the chosen language.
 */
export function LanguageSwitcher({
  languages,
  current,
}: {
  languages: Language[];
  current: LanguageCode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(code: LanguageCode) {
    if (code === current) return;
    document.cookie = `${LANG_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="group"
      aria-label="Choose language"
      className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5 shadow-sm"
    >
      {languages.map((l) => {
        const active = l.code === current;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => choose(l.code)}
            aria-pressed={active}
            title={l.name}
            disabled={pending}
            className={[
              "rounded-full px-3 py-1 text-sm font-medium transition-colors disabled:opacity-60",
              active
                ? "bg-brand text-brand-contrast"
                : "text-muted hover:text-foreground hover:bg-surface-2",
            ].join(" ")}
          >
            {l.native_name || l.name}
          </button>
        );
      })}
    </div>
  );
}
