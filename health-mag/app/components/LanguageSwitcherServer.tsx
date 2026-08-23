import { getActiveLanguages } from "@/lib/content";
import { getRequestedLang } from "@/lib/lang";
import { LanguageSwitcher } from "./LanguageSwitcher";

/**
 * Server wrapper that loads the active languages and current choice, then hands
 * them to the client switcher. Isolated in its own component with a try/catch
 * so a database hiccup can't crash the root layout — it just hides the switch,
 * while the page's own error boundary explains any real data problem.
 */
export async function LanguageSwitcherServer() {
  try {
    const [languages, current] = await Promise.all([getActiveLanguages(), getRequestedLang()]);
    if (languages.length <= 1) return null;
    return <LanguageSwitcher languages={languages} current={current} />;
  } catch {
    return null;
  }
}
