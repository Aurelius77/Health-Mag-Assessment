// Pure data-cleaning functions for the messy source CSVs.
// Kept side-effect free (no I/O) so the logic is easy to reason about and test.

/** Lowercase, strip accents/punctuation, hyphenate — for stable URL slugs. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // drop combining marks left by NFKD (accents)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * This used to clean text fields up from html tags and entities
 */
export function cleanText(raw: string | undefined | null): string {
  if (!raw) return "";
  let text = raw.replace(/<[^>]*>/g, " "); // strip tags
  for (const [entity, char] of Object.entries(ENTITIES)) {
    text = text.split(entity).join(char);
  }
  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  return text.replace(/\s+/g, " ").trim();
}

/** Canonical topic slugs and their English display labels. */
export const TOPIC_LABELS: Record<string, string> = {
  malaria: "Malaria",
  "maternal-health": "Maternal Health",
  nutrition: "Nutrition",
  hygiene: "Hygiene",
  "clean-water": "Clean Water",
  "first-aid": "First Aid",
  immunisation: "Immunisation",
  "family-planning": "Family Planning",
};

/**
 * Map a messy topic value to a canonical slug. Handles mixed casing, trailing
 * spaces, the "Nutriton" typo, and values like "MALARIA PREVENTION".
 * Returns { slug, label }. Unknown topics are slugified and title-cased so the
 * pipeline stays resilient if the content team introduces a new topic.
 */
export function canonicalTopic(raw: string | undefined | null): { slug: string; label: string } {
  const norm = (raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const match = (needle: string) => norm.includes(needle);

  let slug: string | null = null;
  if (match("malaria")) slug = "malaria";
  else if (match("maternal")) slug = "maternal-health";
  else if (match("nutrit")) slug = "nutrition"; // catches "nutrition" and the "nutriton" typo
  else if (match("hygiene")) slug = "hygiene";
  else if (match("water")) slug = "clean-water";
  else if (match("first aid")) slug = "first-aid";
  else if (match("immun")) slug = "immunisation";
  else if (match("family")) slug = "family-planning";

  if (slug) return { slug, label: TOPIC_LABELS[slug] };

  // Unknown topic: derive one rather than dropping the article.
  const derived = slugify(norm || "general");
  const label = derived.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { slug: derived, label };
}

/**
 * Normalize the status free-for-all. The source uses "published", "Published",
 * "TRUE", "yes" (all mean published) and "draft". Anything unrecognized is
 * treated as draft (safe default: not shown to the public).
 */
export function normalizeStatus(raw: string | undefined | null): "published" | "draft" {
  const v = (raw ?? "").toLowerCase().trim();
  if (["published", "true", "yes", "1", "live"].includes(v)) return "published";
  return "draft";
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Parse the ~6 date formats seen in the source into an ISO date (YYYY-MM-DD),
 * or null when the field is blank/unparseable.
 *
 * Handled: 2025-01-04 · 2024-11-30T00:00:00 · 04/01/2025 (DD/MM — Nigerian
 * convention) · 2025/04/21 (YYYY/MM/DD) · "Jan 2025" (month precision → 1st) ·
 * "2nd April 2025".
 *
 * NOTE: slash dates like 04/01/2025 are read as DD/MM/YYYY. That is the
 * Nigerian/British convention and every slash date in this dataset is
 * unambiguous under it (e.g. 30/11 has no valid MM/DD reading).
 */
export function parseFlexibleDate(raw: string | undefined | null): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  // ISO date, optionally with a time component.
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  // YYYY/MM/DD (year first).
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  // DD/MM/YYYY (day first — Nigerian convention).
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return iso(+m[3], +m[2], +m[1]);

  // "2nd April 2025" — ordinal day, month name, year.
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon) return iso(+m[3], mon, +m[1]);
  }

  // "Jan 2025" — month + year only. Month precision → we pin to the 1st and
  // document that these are approximate.
  m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mon) return iso(+m[2], mon, 1);
  }

  return null; // unknown format — better null than a wrong date
}

/**
 * De-duplication map: absorbed source id → canonical id it merges into.
 *
 * Three near-duplicate groups exist. In each we keep the canonical entry that
 * ALSO carries the Nigerian Pidgin translation, so no translation is orphaned:
 *   • Handwashing:  8 keeps; 9, 24 drop
 *   • Antenatal:    4 keeps; 5 drops
 *   • Immunisation: 14 keeps; 15 drops
 * Rule: the canonical row's content is authoritative; absorbed rows are dropped.
 */
export const CANONICAL_OF: Record<number, number> = {
  5: 4,
  9: 8,
  24: 8,
  15: 14,
};

/** True when this source id is a duplicate that merges into another. */
export function isAbsorbed(id: number): boolean {
  return id in CANONICAL_OF;
}
