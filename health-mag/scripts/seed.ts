// Seed pipeline — loads the messy source CSVs, cleans + de-duplicates them with
// scripts/clean.ts, and writes the result into Supabase.
//
// Two modes (same cleaning logic, one source of truth):
//
//   npx tsx scripts/seed.ts          → upsert directly into Supabase (needs
//                                       network + SUPABASE_URL / SERVICE_ROLE_KEY).
//   npx tsx scripts/seed.ts --sql    → emit supabase/seed.sql (no network); paste
//                                       it into the Supabase SQL editor after
//                                       schema.sql. Handy when the machine can't
//                                       reach Supabase directly.
//
// Both are idempotent. This script builds its own Supabase client rather than
// importing lib/supabase.ts, because that module is `server-only` (which throws
// when imported outside the Next.js RSC bundler — e.g. here under tsx).

import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import {
  CANONICAL_OF,
  canonicalTopic,
  cleanText,
  isAbsorbed,
  normalizeStatus,
  parseFlexibleDate,
  slugify,
} from "./clean";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const docsDir = join(scriptDir, "..", "docs");
const seedSqlPath = join(scriptDir, "..", "supabase", "seed.sql");

// ---- raw CSV row shapes ---------------------------------------------------
interface ContentRow {
  id: string;
  title: string;
  topic: string;
  summary: string;
  body: string;
  last_updated: string;
  author: string;
  status: string;
}
interface PidginRow {
  article_id: string;
  language: string;
  title: string;
  body: string;
}

interface ArticleRow {
  id: number;
  slug: string;
  topic_slug: string;
  status: "published" | "draft";
  author: string | null;
  source_updated_at: string | null;
}
interface TranslationRow {
  article_id: number;
  language_code: string;
  title: string;
  summary: string | null;
  body: string;
}
interface SeedData {
  topics: Map<string, string>; // slug -> English label
  articles: ArticleRow[];
  translations: TranslationRow[];
  pcmCount: number;
}

function readCsv<T>(file: string): T[] {
  const raw = readFileSync(join(docsDir, file), "utf8");
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  }) as T[];
}

// ---- pure build step (no I/O beyond reading the CSVs) ---------------------
function buildData(): SeedData {
  const contentRows = readCsv<ContentRow>("health-content.csv");
  const pidginRows = readCsv<PidginRow>("pidgin-translations.csv");

  const usedSlugs = new Set<string>();
  const topics = new Map<string, string>();
  const articles: ArticleRow[] = [];
  const translations: TranslationRow[] = [];

  for (const row of contentRows) {
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;
    if (isAbsorbed(id)) continue; // near-duplicate merged into its canonical row

    const { slug: topicSlug, label: topicLabel } = canonicalTopic(row.topic);
    topics.set(topicSlug, topicLabel);

    const title = cleanText(row.title);
    const summary = cleanText(row.summary) || null;
    const body = cleanText(row.body);
    const author = cleanText(row.author) || null;
    const status = normalizeStatus(row.status);
    const sourceUpdatedAt = parseFlexibleDate(row.last_updated);

    // Some rows have no title (e.g. draft id 7). Fall back to the summary, then
    // a topic-based placeholder, so the NOT NULL title holds and the slug stays
    // meaningful.
    const effectiveTitle = title || summary || `${topicLabel} (untitled #${id})`;
    let slug = slugify(effectiveTitle) || `${topicSlug}-${id}`;
    if (usedSlugs.has(slug)) slug = `${slug}-${id}`; // collision guard
    usedSlugs.add(slug);

    articles.push({ id, slug, topic_slug: topicSlug, status, author, source_updated_at: sourceUpdatedAt });
    translations.push({ article_id: id, language_code: "en", title: effectiveTitle, summary, body });
  }

  const keptIds = new Set(articles.map((a) => a.id));

  let pcmCount = 0;
  for (const row of pidginRows) {
    const rawId = Number(row.article_id);
    if (!Number.isFinite(rawId)) continue;
    const id = CANONICAL_OF[rawId] ?? rawId; // remap if it targets an absorbed dup
    if (!keptIds.has(id)) continue; // never orphan a translation

    const lang = /pcm|pidgin|naij/i.test(row.language) ? "pcm" : row.language.trim().toLowerCase();
    const title = cleanText(row.title);
    const body = cleanText(row.body);
    if (!title || !body) continue;

    translations.push({ article_id: id, language_code: lang, title, summary: null, body });
    if (lang === "pcm") pcmCount++;
  }

  return { topics, articles, translations, pcmCount };
}

// ---- mode A: write to Supabase over the network ---------------------------
async function writeToSupabase(data: SeedData) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("✖ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
    console.error("  Tip: run `npx tsx scripts/seed.ts --sql` to emit SQL you can paste in the dashboard.");
    process.exit(1);
  }
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const fail = (where: string, error: { message: string }): never => {
    console.error(`✖ Failed while writing ${where}: ${error.message}`);
    if (/does not exist|schema cache/i.test(error.message)) {
      console.error("  → Tables missing. Run supabase/schema.sql in the Supabase SQL editor first.");
    }
    if (/fetch failed/i.test(error.message)) {
      console.error("  → Could not reach Supabase from this machine. Use `--sql` mode and paste in the dashboard.");
    }
    process.exit(1);
  };

  const topicRows = [...data.topics.keys()].map((slug) => ({ slug }));
  const topicLabelRows = [...data.topics.entries()].map(([slug, label]) => ({
    topic_slug: slug,
    language_code: "en",
    label,
  }));

  let res = await db.from("topics").upsert(topicRows, { onConflict: "slug", ignoreDuplicates: true });
  if (res.error) fail("topics", res.error);

  res = await db
    .from("topic_translations")
    .upsert(topicLabelRows, { onConflict: "topic_slug,language_code", ignoreDuplicates: true });
  if (res.error) fail("topic_translations", res.error);

  const now = new Date().toISOString();
  res = await db.from("articles").upsert(
    data.articles.map((a) => ({ ...a, updated_at: now })),
    { onConflict: "id" },
  );
  if (res.error) fail("articles", res.error);

  res = await db
    .from("article_translations")
    .upsert(data.translations, { onConflict: "article_id,language_code" });
  if (res.error) fail("article_translations", res.error);

  summarize(data, "Supabase");
}

// ---- mode B: emit SQL (no network) ----------------------------------------
function sqlStr(v: string | null): string {
  return v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`;
}
function sqlDate(v: string | null): string {
  return v === null ? "NULL" : `'${v}'::date`;
}

function emitSql(data: SeedData): string {
  const topicValues = [...data.topics.keys()].map((slug) => `  (${sqlStr(slug)})`).join(",\n");
  const topicLabelValues = [...data.topics.entries()]
    .map(([slug, label]) => `  (${sqlStr(slug)}, 'en', ${sqlStr(label)})`)
    .join(",\n");
  const articleValues = data.articles
    .map(
      (a) =>
        `  (${a.id}, ${sqlStr(a.slug)}, ${sqlStr(a.topic_slug)}, ${sqlStr(a.status)}, ${sqlStr(a.author)}, ${sqlDate(a.source_updated_at)})`,
    )
    .join(",\n");
  const translationValues = data.translations
    .map(
      (t) =>
        `  (${t.article_id}, ${sqlStr(t.language_code)}, ${sqlStr(t.title)}, ${sqlStr(t.summary)}, ${sqlStr(t.body)})`,
    )
    .join(",\n");

  return `-- Health Information Companion — seed data (GENERATED by scripts/seed.ts --sql).
-- Do not edit by hand; re-generate. Run AFTER schema.sql. Idempotent (safe to re-run).
-- This is the cleaned + de-duplicated content: 24 source rows → ${data.articles.length} articles.

begin;

-- Topics found in the data (English labels). schema.sql already seeds these;
-- included for resilience if the content team introduces a new topic.
insert into topics (slug) values
${topicValues}
on conflict (slug) do nothing;

insert into topic_translations (topic_slug, language_code, label) values
${topicLabelValues}
on conflict (topic_slug, language_code) do nothing;

-- Articles (language-neutral rows).
insert into articles (id, slug, topic_slug, status, author, source_updated_at) values
${articleValues}
on conflict (id) do update set
  slug = excluded.slug,
  topic_slug = excluded.topic_slug,
  status = excluded.status,
  author = excluded.author,
  source_updated_at = excluded.source_updated_at,
  updated_at = now();

-- Translations (English from health-content.csv, Pidgin from pidgin-translations.csv).
insert into article_translations (article_id, language_code, title, summary, body) values
${translationValues}
on conflict (article_id, language_code) do update set
  title = excluded.title,
  summary = excluded.summary,
  body = excluded.body;

commit;
`;
}

// ---- shared summary -------------------------------------------------------
function summarize(data: SeedData, target: string) {
  const published = data.articles.filter((a) => a.status === "published").length;
  const enCount = data.translations.filter((t) => t.language_code === "en").length;
  console.log(`✔ Seed → ${target}`);
  console.log(`  articles:             ${data.articles.length} (${published} published, ${data.articles.length - published} draft)`);
  console.log(`  english translations: ${enCount}`);
  console.log(`  pidgin translations:  ${data.pcmCount}`);
  console.log(`  topics:               ${data.topics.size} — ${[...data.topics.keys()].join(", ")}`);
}

async function main() {
  const data = buildData();
  if (process.argv.includes("--sql")) {
    writeFileSync(seedSqlPath, emitSql(data), "utf8");
    summarize(data, "supabase/seed.sql");
    console.log(`\n  Wrote ${seedSqlPath}`);
    console.log("  → Paste it into the Supabase SQL editor after schema.sql.");
    return;
  }
  await writeToSupabase(data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
