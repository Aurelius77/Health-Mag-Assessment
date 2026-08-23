// Shared domain types for the Health Information Companion.
// These mirror the Postgres schema in supabase/schema.sql.

/** A language code such as 'en', 'pcm', 'ibo'. Kept as a string so new
 *  languages are pure data — no union type to edit when one is added. */
export type LanguageCode = string;

export type ArticleStatus = "published" | "draft";

/** Row of the `languages` table. */
export interface Language {
  code: LanguageCode;
  name: string;
  native_name: string | null;
  is_active: boolean;
  is_default: boolean;
  fallback_code: LanguageCode | null;
  sort_order: number;
}

/** A topic with its label already resolved for the requested language
 *  (falling back to English when a localized label is missing). */
export interface Topic {
  slug: string;
  label: string;
  sort_order: number;
}

/**
 * An article fully resolved for a given language: the correct translation has
 * been applied, with graceful fallback to the site's default language.
 * `is_fallback` lets the UI show a "displayed in English" notice.
 */
export interface Article {
  id: number;
  slug: string;
  topic_slug: string;
  topic_label: string;
  status: ArticleStatus;
  author: string | null;
  /** ISO 8601 date (YYYY-MM-DD) or null when the source had no usable date. */
  source_updated_at: string | null;
  title: string;
  summary: string | null;
  body: string;
  /** The language actually shown (may differ from what was requested). */
  language: LanguageCode;
  /** The language the reader asked for. */
  requested_language: LanguageCode;
  /** True when we fell back because no translation existed for the request. */
  is_fallback: boolean;
}

/** The outcome of a grounded Q&A request. */
export type AskStatus = "answered" | "no_match" | "refused";

export interface AskCitation {
  slug: string;
  title: string;
}

export interface AskResult {
  status: AskStatus;
  answer: string;
  citations: AskCitation[];
}
