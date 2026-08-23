Ready for review
Select text to add comments on the plan
Health Information Companion — Completion Plan
Context
This is the Kokoodi weekend assessment: build and deploy a small full-stack "Health Information Companion" for a Nigerian health charity, reading messy CSV content from an external store, serving it cleanly in English + Nigerian Pidgin (with graceful fallback and room for Igbo/Yoruba/Hausa later), plus one genuinely useful AI feature — all behind a backend so no keys reach the browser. Deliverables: live public URL, public GitHub repo, and a Decision Document. Due Mon 24 Aug 2026, 12:00 WAT (today is Sun 23 Aug).

The foundation is already built and is good — I will reuse it, not rebuild it:

scripts/clean.ts — pure cleaning fns: slugify, cleanText (strips HTML/entities), canonicalTopic (fixes casing/Nutriton typo/MALARIA PREVENTION), normalizeStatus, parseFlexibleDate (6 date formats), and the dedup map CANONICAL_OF (5→4, 9→8, 24→8, 15→14).
lib/types.ts — domain types incl. the AI AskResult (answered/no_match/refused + citations).
supabase/schema.sql — growth-ready schema: languages / topics / topic_translations / articles / article_translations, RLS (anon reads published only), and reference data (en+pcm active; ibo/yor/hau pre-seeded inactive; 8 topics + English labels).
Confirmed with user: they will provide Supabase + Gemini keys in a local .env (I seed + verify locally); deploy target is Vercel.

Data reality (verified from the CSVs)
docs/health-content.csv: 24 rows → 20 canonical articles after dedup. Contains every mess the brief promised: blank title (id 7, draft), blank summaries/authors, HTML (<p>, <strong>, &amp;), 6 date formats + 1 blank, status values published/Published/TRUE/yes/draft.
docs/pidgin-translations.csv: 10 rows (ids 1,4,6,8,10,12,14,17,18,20) — all map onto kept canonical ids, so no translation is orphaned by the dedup. → 10 of 20 articles have Pidgin.
Architecture (the "backend sits between frontend and store/AI" boundary)
Next.js 16 App Router on Vercel. Server Components render all content server-side → the Supabase client + keys live only on the server; the browser bundle contains no DB/AI keys.
Supabase (Postgres) is the external content store a non-technical team can edit; app reads at runtime. Reads use the anon key server-side (RLS = defense in depth). Service-role key used only by the seed script (and the optional admin endpoint).
No NEXT*PUBLIC* Supabase vars — nothing Supabase reaches the client. The only browser→server call is fetch('/api/ask') for the AI feature.
AI = Google Gemini via @google/genai, server-side, in a POST route handler.
Language selection = lang cookie (clean URLs, SSR-friendly, shareable). A tiny client switcher sets the cookie and refreshes; Server Components read the cookie and resolve content with fallback, exposing is_fallback so the UI can show a "shown in English" notice.
Topic filter = ?topic= search param (shareable, server-rendered).
Browser (RSC HTML + tiny client bits: lang switch, ask box)
│ page requests │ POST /api/ask
▼ ▼
Next.js server (Server Components + route handler) ← keys live here
│ read (anon, server-side) │ read corpus + call Gemini
▼ ▼
Supabase Postgres (RLS: published only) Google Gemini (@google/genai)
Env vars (local .env, and Vercel dashboard)
SUPABASE_URL — project URL (server-only usage)
SUPABASE_ANON_KEY — anon key (server-side reads; RLS-limited to published)
SUPABASE_SERVICE_ROLE_KEY — server-only; seed + optional admin writes (bypasses RLS)
GEMINI_API_KEY — server-only; the AI feature
Work plan / files

1. Supabase client — lib/supabase.ts (server-only)

supabaseAnon() (reads) and supabaseAdmin() (service role) factories, persistSession:false.
Mark module server-only so it can never be imported into a client component. 2. Seed script — scripts/seed.ts (referenced by clean.ts but missing)

Load .env (dotenv), parse both CSVs (csv-parse), apply clean.ts fns.
Drop absorbed dup rows (isAbsorbed); keep canonical. Derive slug from English title (slugify), with a fallback for the blank-title draft (id 7): summary/topic+id.
Upsert topics found in data (+ English label) before inserting articles, so unknown/new topics from canonicalTopic never break the articles.topic_slug FK (keeps pipeline resilient).
Upsert articles + English article_translations (from health-content) + Pidgin article_translations (from pidgin file, ids remapped through CANONICAL_OF defensively).
Uses supabaseAdmin(). Idempotent (upsert on conflict). Prints a summary (n articles, n pcm). 3. Server data layer — lib/content.ts (server-only). Reuses types from lib/types.ts.

getActiveLanguages(), getTopics(lang), listArticles({lang, topic?}), getArticleBySlug(slug, lang), getCorpusForAI() (slug/title/body for grounding).
Fallback logic in TS after an embedded select (articles + article_translations + topic labels): pick requested lang, else default en, set is_fallback. 4. AI feature — app/api/ask/route.ts (POST) + lib/ai.ts

Input { question, lang? }. Pre-checks: empty/too-short/too-long → early no_match/400.
Corpus-stuffing, not RAG: only ~20 short articles, so pass the whole published corpus in the prompt — no vector DB needed (documented scoping decision).
System instruction: answer ONLY from provided articles; if absent → no_match; refuse diagnosis/dosing and anything outside the content; for red-flag/emergency symptoms advise seeing a clinic; never invent facts; return citations (article titles/slugs).
Structured JSON out matching AskResult (via genai structured-output; robust JSON-parse fallback).
Key server-side only. (Light input cap now; rate-limiting noted as future work.) 5. Frontend (Tailwind v4 already configured; light/dark in globals.css)

app/layout.tsx — real metadata; header (app name + LanguageSwitcher); footer disclaimer; <html lang> reflects selection.
app/page.tsx — hero + AskBox (client) near top; topic filter chips (?topic=); article cards (title, summary, topic, date, Pidgin/fallback badge).
app/articles/[slug]/page.tsx — detail view; generateMetadata; fallback notice; not-found.
app/components/LanguageSwitcher.tsx (client) — sets lang cookie + refresh.
app/components/AskBox.tsx (client) — POSTs /api/ask; renders answer + citation links; handles loading/error/no_match/refused/empty states.
app/error.tsx + app/not-found.tsx. 6. Decision Document — rewrite README.md covering all six required points: interpretation & scope; data cleaning/merge/drop (the 24→20 story); storage model + "add a language/article = INSERTs, no schema change"; architecture & trade-offs; how AI was used + one thing it got wrong; next-week roadmap. Plus run/setup instructions.

7. Deploy: public GitHub repo → Vercel import → env vars → run schema.sql in Supabase → seed against Supabase → verify live URL.

8. (Optional, only if core is solid) app/api/admin/articles/route.ts — token-guarded, service-role write to add an article/translation without hand-editing data (the brief's bonus).

Confirmed library APIs (read from node_modules, not memory)
@google/genai v2.18.0: import { GoogleGenAI, Type } from '@google/genai'; new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); await ai.models.generateContent({ model: 'gemini-2.5-flash', contents, config }). Put systemInstruction/temperature/maxOutputTokens in config. Structured output: config.responseMimeType:'application/json' + config.responseSchema (built with Type.OBJECT/STRING/ARRAY) to force the AskResult shape. Read text via response.text (getter — no parens), then JSON.parse with a guard.
@supabase/supabase-js v2.112.3: createClient(url, key, { auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false } }). Embedded reads: .select('_, article_translations(_)') (or !inner); chain .eq/.in/.order(col,{ascending,referencedTable})/.limit/.maybeSingle. Returns { data, error } (not thrown) — check error explicitly.
Next.js 16 specifics (confirmed from bundled docs — these differ from older Next.js)
params/searchParams are async (Promise) — must await. Page: export default async function Page(props: PageProps<'/articles/[slug]'>) { const { slug } = await props.params }. Reading searchParams (topic filter) opts the page into dynamic rendering.
PageProps<'/route'> / LayoutProps<'/route'> are GLOBAL generated types (no import), created by next dev/next build/next typegen. (Existing layout.tsx already uses LayoutProps<"/">.)
Route handlers use Web Request/Response: export async function POST(request: Request), const body = await request.json(), return Response.json(data, { status }). Optional helpers via NextRequest/NextResponse from next/server. Not cached by default (good for /api/ask).
error.tsx must be 'use client'; props { error: Error & { digest?: string }, retry: () => void } — use retry (stable since v16.3.0), NOT the old reset. not-found.tsx + notFound() from next/navigation.
cookies()/headers() are async (await cookies()); reading them → dynamic render, so Supabase reads are always fresh. No cacheComponents flag set → default caching; DB reads aren't fetch-cached (no staleness).
generateMetadata for the article title: export async function generateMetadata(props: PageProps<'/articles/[slug]'>): Promise<Metadata>.
Language switcher (client) sets a plain lang cookie via document.cookie then router.refresh() (UI preference only — not httpOnly, no secret). Server Components read it via await cookies().
Verification (end-to-end, locally, before deploy)
npm run build — typecheck + lint clean.
Put user keys in .env; run supabase/schema.sql in the Supabase SQL editor.
npx tsx scripts/seed.ts → expect 20 articles, 10 pcm translations, topics upserted.
npm run dev, then exercise:
Browse topics; open an article; verify cleaned text (no raw HTML), normalized dates.
Switch to Pidgin: translated where it exists (e.g. id 1/8), English + fallback notice where not.
Ask an on-topic question → answered + citations link to real articles.
Ask off-topic (e.g. "who won the match?") → refused/no_match politely.
Ask a health question not in the content → no_match.
Confirm no secrets in the client bundle (no GEMINI/service-role strings under .next/static).
Deploy to Vercel; repeat the smoke test against the live URL; paste URL + repo into the README.
