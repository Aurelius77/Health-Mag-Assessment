/** Name of the cookie that stores the reader's language choice.
 *  It holds only a UI preference (e.g. "pcm") — no secret — so the client
 *  LanguageSwitcher may set it directly via document.cookie.
 *
 *  This lives in its own tiny module (no server-only imports) so both the
 *  client switcher and the server-only lib/lang.ts can share it without pulling
 *  server code into the browser bundle. */
export const LANG_COOKIE = "lang";
