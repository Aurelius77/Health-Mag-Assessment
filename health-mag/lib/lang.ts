import "server-only";

import { cookies } from "next/headers";
import { getActiveLanguages } from "@/lib/content";
import { LANG_COOKIE } from "@/lib/lang-shared";
import type { LanguageCode } from "@/lib/types";

/**
 * The language to render for this request: the `lang` cookie if it names an
 * active language, otherwise English. Reading the cookie opts the route into
 * dynamic rendering, so content is always fresh after a language switch.
 */
export async function getRequestedLang(): Promise<LanguageCode> {
  const store = await cookies();
  const raw = store.get(LANG_COOKIE)?.value?.trim();
  if (!raw) return "en";
  const langs = await getActiveLanguages();
  return langs.some((l) => l.code === raw) ? raw : "en";
}
