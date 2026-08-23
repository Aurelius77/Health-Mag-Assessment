/** Format an ISO date (YYYY-MM-DD) as e.g. "10 May 2025". Returns null for
 *  missing/invalid input so callers can omit the date cleanly. UTC-pinned so
 *  server and client agree (no hydration mismatch). */
export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}
