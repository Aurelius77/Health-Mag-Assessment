-- Health Information Companion — Postgres schema (Supabase)
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query → paste → Run),
-- or via psql. Idempotent: safe to re-run.
--
-- Design: content is language-neutral (`articles`) with one row per language
-- (`article_translations`). English is just another language. So:
--   • Add a new language  = INSERT a row in `languages` (+ translation rows). No schema change.
--   • Add a new article   = INSERT into `articles` (+ `article_translations`). No schema change.
--   • Add an admin later   = it writes these same tables. No rework.
--
-- Article *content* is loaded from the CSVs by scripts/seed.ts. This file creates
-- the structure, security policies, and the small amount of reference data
-- (languages + topics + English topic labels).

-- ===========================================================================
-- Reference: languages
-- ===========================================================================
create table if not exists languages (
  code          text primary key,                       -- ISO code: 'en', 'pcm', 'ibo', 'yor', 'hau'
  name          text not null,                           -- English name, e.g. 'Nigerian Pidgin'
  native_name   text,                                    -- endonym, e.g. 'Naijá'
  is_active     boolean not null default true,           -- shown in the language switcher
  is_default    boolean not null default false,          -- the base language / ultimate fallback
  fallback_code text references languages(code),         -- shown when a translation is missing
  sort_order    int     not null default 100
);

-- ===========================================================================
-- Reference: topics (+ translatable labels, same pattern as articles)
-- ===========================================================================
create table if not exists topics (
  slug        text primary key,                          -- 'malaria', 'maternal-health', ...
  sort_order  int not null default 100
);

create table if not exists topic_translations (
  topic_slug     text not null references topics(slug) on delete cascade,
  language_code  text not null references languages(code) on delete cascade,
  label          text not null,
  primary key (topic_slug, language_code)
);

-- ===========================================================================
-- Content: articles (language-neutral) + translations (per language)
-- ===========================================================================
create table if not exists articles (
  id                int  primary key,                    -- canonical id, kept from the source CSV
  slug              text unique not null,                -- stable URL key derived from the English title
  topic_slug        text not null references topics(slug),
  status            text not null default 'draft' check (status in ('published','draft')),
  author            text,                                -- nullable (many source rows have none)
  source_updated_at date,                                -- normalized from the messy CSV dates (nullable)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists articles_topic_idx  on articles(topic_slug);
create index if not exists articles_status_idx on articles(status);

create table if not exists article_translations (
  article_id     int  not null references articles(id) on delete cascade,
  language_code  text not null references languages(code) on delete cascade,
  title          text not null,
  summary        text,                                   -- optional (many source rows have none)
  body           text not null,
  primary key (article_id, language_code)
);

-- ===========================================================================
-- Row Level Security: the public (anon key) may read only PUBLISHED content.
-- The service-role key (server-only, used by the seed script and the bonus
-- admin endpoint) bypasses RLS entirely for writes.
-- ===========================================================================
alter table languages            enable row level security;
alter table topics               enable row level security;
alter table topic_translations   enable row level security;
alter table articles             enable row level security;
alter table article_translations enable row level security;

drop policy if exists "anon read active languages" on languages;
create policy "anon read active languages" on languages
  for select to anon, authenticated using (is_active);

drop policy if exists "anon read topics" on topics;
create policy "anon read topics" on topics
  for select to anon, authenticated using (true);

drop policy if exists "anon read topic labels" on topic_translations;
create policy "anon read topic labels" on topic_translations
  for select to anon, authenticated using (true);

drop policy if exists "anon read published articles" on articles;
create policy "anon read published articles" on articles
  for select to anon, authenticated using (status = 'published');

drop policy if exists "anon read published translations" on article_translations;
create policy "anon read published translations" on article_translations
  for select to anon, authenticated using (
    exists (select 1 from articles a where a.id = article_id and a.status = 'published')
  );

-- ===========================================================================
-- Reference data
-- ===========================================================================
-- Active languages (have content today):
insert into languages (code, name, native_name, is_active, is_default, fallback_code, sort_order) values
  ('en',  'English',         'English', true, true,  null, 1),
  ('pcm', 'Nigerian Pidgin', 'Naijá',   true, false, 'en', 2)
on conflict (code) do nothing;

-- Languages the charity plans to add. Left INACTIVE so they don't appear in the
-- switcher until someone adds translation rows and flips is_active = true.
-- This is the whole "add a language without a developer" story in two INSERTs.
insert into languages (code, name, native_name, is_active, is_default, fallback_code, sort_order) values
  ('ibo', 'Igbo',   'Igbo',   false, false, 'en', 3),
  ('yor', 'Yoruba', 'Yorùbá', false, false, 'en', 4),
  ('hau', 'Hausa',  'Hausa',  false, false, 'en', 5)
on conflict (code) do nothing;

insert into topics (slug, sort_order) values
  ('malaria',          1),
  ('maternal-health',  2),
  ('nutrition',        3),
  ('hygiene',          4),
  ('clean-water',      5),
  ('first-aid',        6),
  ('immunisation',     7),
  ('family-planning',  8)
on conflict (slug) do nothing;

-- English topic labels. Other languages fall back to English until labels are
-- added (the app resolves topic labels with the same fallback logic as articles).
insert into topic_translations (topic_slug, language_code, label) values
  ('malaria',         'en', 'Malaria'),
  ('maternal-health', 'en', 'Maternal Health'),
  ('nutrition',       'en', 'Nutrition'),
  ('hygiene',         'en', 'Hygiene'),
  ('clean-water',     'en', 'Clean Water'),
  ('first-aid',       'en', 'First Aid'),
  ('immunisation',    'en', 'Immunisation'),
  ('family-planning', 'en', 'Family Planning')
on conflict (topic_slug, language_code) do nothing;
