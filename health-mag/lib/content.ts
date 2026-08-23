import "server-only";

import { cache } from "react";
import { supabaseAnon } from "@/lib/supabase";
import type { Article, ArticleStatus, Language, LanguageCode, Topic } from "@/lib/types";

// The site's base language and ultimate fallback. Matches the `is_default`
// language seeded in schema.sql.
const DEFAULT_LANG: LanguageCode = "en";

// ---- internal row shapes (embedded selects) -------------------------------
interface TranslationRow {
  language_code: string;
  title: string;
  summary: string | null;
  body: string;
}
interface TopicEmbed {
  topic_translations: { language_code: string; label: string }[] | null;
}
interface ArticleRow {
  id: number;
  slug: string;
  topic_slug: string;
  status: ArticleStatus;
  author: string | null;
  source_updated_at: string | null;
  topics: TopicEmbed | null;
  article_translations: TranslationRow[] | null;
}

const ARTICLE_SELECT = `
  id, slug, topic_slug, status, author, source_updated_at,
  topics ( topic_translations ( language_code, label ) ),
  article_translations ( language_code, title, summary, body )
`;

// ---- helpers --------------------------------------------------------------
function humanizeSlug(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pick the first row whose language matches the fallback chain, reporting
 *  whether we had to fall back past the requested language. */
function pickByChain<T extends { language_code: string }>(
  rows: T[],
  chain: LanguageCode[],
): { row: T; isFallback: boolean } | null {
  for (let i = 0; i < chain.length; i++) {
    const found = rows.find((r) => r.language_code === chain[i]);
    if (found) return { row: found, isFallback: i > 0 };
  }
  return null;
}

/** Build the resolution order for a language, e.g. pcm → [pcm, en].
 *  Follows each language's `fallback_code` and always ends at the default. */
function buildChain(langs: Language[], requested: LanguageCode): LanguageCode[] {
  const byCode = new Map(langs.map((l) => [l.code, l]));
  const chain: LanguageCode[] = [];
  const seen = new Set<string>();
  let cur: LanguageCode | null = requested;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    cur = byCode.get(cur)?.fallback_code ?? null;
  }
  if (!seen.has(DEFAULT_LANG)) chain.push(DEFAULT_LANG);
  return chain;
}

function resolveArticle(row: ArticleRow, requested: LanguageCode, chain: LanguageCode[]): Article | null {
  const picked = pickByChain(row.article_translations ?? [], chain);
  if (!picked) return null; // no usable translation (shouldn't happen for published)

  const topicPick = pickByChain(row.topics?.topic_translations ?? [], chain);
  const topicLabel = topicPick?.row.label ?? humanizeSlug(row.topic_slug);

  return {
    id: row.id,
    slug: row.slug,
    topic_slug: row.topic_slug,
    topic_label: topicLabel,
    status: row.status,
    author: row.author,
    source_updated_at: row.source_updated_at,
    title: picked.row.title,
    summary: picked.row.summary,
    body: picked.row.body,
    language: picked.row.language_code,
    requested_language: requested,
    is_fallback: picked.isFallback,
  };
}

// ---- public data layer ----------------------------------------------------

/** Active languages for the switcher (RLS already limits anon to is_active).
 *  Wrapped in React `cache()` so the many callers in one request share a query. */
export const getActiveLanguages = cache(async (): Promise<Language[]> => {
  const { data, error } = await supabaseAnon()
    .from("languages")
    .select("code, name, native_name, is_active, is_default, fallback_code, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(`getActiveLanguages: ${error.message}`);
  return (data ?? []) as Language[];
});

/** All topics with labels resolved for `lang` (falling back to English). */
export async function getTopics(lang: LanguageCode): Promise<Topic[]> {
  const langs = await getActiveLanguages();
  const chain = buildChain(langs, lang);
  const { data, error } = await supabaseAnon()
    .from("topics")
    .select("slug, sort_order, topic_translations ( language_code, label )")
    .order("sort_order");
  if (error) throw new Error(`getTopics: ${error.message}`);

  const rows = (data ?? []) as {
    slug: string;
    sort_order: number;
    topic_translations: { language_code: string; label: string }[] | null;
  }[];
  return rows.map((t) => {
    const picked = pickByChain(t.topic_translations ?? [], chain);
    return { slug: t.slug, label: picked?.row.label ?? humanizeSlug(t.slug), sort_order: t.sort_order };
  });
}

/** Published articles for a language, newest first, optionally by topic. */
export async function listArticles(opts: { lang: LanguageCode; topic?: string }): Promise<Article[]> {
  const langs = await getActiveLanguages();
  const chain = buildChain(langs, opts.lang);

  let query = supabaseAnon().from("articles").select(ARTICLE_SELECT).eq("status", "published");
  if (opts.topic) query = query.eq("topic_slug", opts.topic);
  query = query
    .order("source_updated_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`listArticles: ${error.message}`);

  // PostgREST returns the many-to-one `topics` embed as a single object; the
  // supabase-js type parser widens it to an array without generated DB types,
  // so we assert the real runtime shape here.
  return ((data ?? []) as unknown as ArticleRow[])
    .map((row) => resolveArticle(row, opts.lang, chain))
    .filter((a): a is Article => a !== null);
}

/** A single published article by slug, resolved for `lang`, or null.
 *  Cached per-request so generateMetadata and the page share one query. */
export const getArticleBySlug = cache(
  async (slug: string, lang: LanguageCode): Promise<Article | null> => {
    const langs = await getActiveLanguages();
    const chain = buildChain(langs, lang);

    const { data, error } = await supabaseAnon()
      .from("articles")
      .select(ARTICLE_SELECT)
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error(`getArticleBySlug: ${error.message}`);
    if (!data) return null;

    return resolveArticle(data as unknown as ArticleRow, lang, chain);
  },
);

/** The published English corpus, flattened for grounding the AI feature.
 *  Small enough (~20 short articles) to pass whole — no vector search needed. */
export async function getCorpusForAI(): Promise<
  { slug: string; topic: string; title: string; summary: string | null; body: string }[]
> {
  const { data, error } = await supabaseAnon()
    .from("articles")
    .select("slug, topic_slug, article_translations ( language_code, title, summary, body )")
    .eq("status", "published");
  if (error) throw new Error(`getCorpusForAI: ${error.message}`);

  const rows = (data ?? []) as {
    slug: string;
    topic_slug: string;
    article_translations: TranslationRow[] | null;
  }[];
  return rows
    .map((row) => {
      const en = (row.article_translations ?? []).find((t) => t.language_code === DEFAULT_LANG);
      if (!en) return null;
      return { slug: row.slug, topic: row.topic_slug, title: en.title, summary: en.summary, body: en.body };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);
}
