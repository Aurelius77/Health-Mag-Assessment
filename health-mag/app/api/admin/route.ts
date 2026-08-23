import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import {
  canonicalTopic,
  cleanText,
  normalizeStatus,
  parseFlexibleDate,
  slugify,
} from "@/scripts/clean";
import type { SupabaseClient } from "@supabase/supabase-js";

// Service-role writes + Node crypto → Node runtime.
export const runtime = "nodejs";

// ---- auth -----------------------------------------------------------------
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Gate every admin call on a shared secret. Fails closed if ADMIN_TOKEN is
 *  not configured. The token never ships to the public bundle — it is sent
 *  from the admin UI in a header and only ever compared here on the server. */
function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const got = req.headers.get("x-admin-token") ?? "";
  return safeEqual(got, expected);
}

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

// ---- helpers --------------------------------------------------------------
/** Make sure a language row exists so translation FKs hold. Optionally flip an
 *  existing (pre-seeded but inactive) language to active — this is how the team
 *  brings e.g. Igbo online just by adding data. */
async function ensureLanguage(db: SupabaseClient, code: string, activate?: boolean) {
  const { data: existing } = await db
    .from("languages")
    .select("code, is_active")
    .eq("code", code)
    .maybeSingle();

  if (!existing) {
    await db.from("languages").insert({
      code,
      name: code.toUpperCase(),
      native_name: code.toUpperCase(),
      is_active: activate ?? code === "en",
      is_default: code === "en",
      fallback_code: code === "en" ? null : "en",
      sort_order: 100,
    });
    return;
  }
  if (activate && !existing.is_active) {
    await db.from("languages").update({ is_active: true }).eq("code", code);
  }
}

// ---- GET: data to populate the admin form dropdowns -----------------------
export async function GET(req: Request) {
  if (!authorized(req)) return unauthorized();
  const db = supabaseAdmin();

  const [arts, langs, tops] = await Promise.all([
    db.from("articles").select("id, slug, status, article_translations(language_code, title)").order("id"),
    db.from("languages").select("code, name, native_name, is_active, sort_order").order("sort_order"),
    db.from("topics").select("slug, topic_translations(language_code, label)").order("sort_order"),
  ]);

  if (arts.error || langs.error || tops.error) {
    const msg = arts.error?.message || langs.error?.message || tops.error?.message || "Load failed";
    if (/does not exist|schema cache/i.test(msg)) {
      return Response.json({ error: "Tables missing — run schema.sql in Supabase first." }, { status: 500 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }

  type TransRow = { language_code: string; title: string };
  const articles = (arts.data ?? []).map((a) => {
    const trans = (a.article_translations ?? []) as TransRow[];
    const title = trans.find((t) => t.language_code === "en")?.title ?? trans[0]?.title ?? `#${a.id}`;
    const langsWith = trans.map((t) => t.language_code);
    return { id: a.id, slug: a.slug, status: a.status, title, languages: langsWith };
  });

  type TopTransRow = { language_code: string; label: string };
  const topics = (tops.data ?? []).map((t) => {
    const labels = (t.topic_translations ?? []) as TopTransRow[];
    return { slug: t.slug, label: labels.find((x) => x.language_code === "en")?.label ?? t.slug };
  });

  return Response.json({ articles, languages: langs.data ?? [], topics });
}

// ---- POST: create/update an article, or add a translation -----------------
export async function POST(req: Request) {
  if (!authorized(req)) return unauthorized();

  let body: { action?: string; article?: Record<string, unknown>; translation?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const db = supabaseAdmin();
  if (body.action === "article") return handleArticle(db, body.article ?? {});
  if (body.action === "translation") return handleTranslation(db, body.translation ?? {});
  return Response.json({ error: "Unknown action." }, { status: 400 });
}

async function handleArticle(db: SupabaseClient, input: Record<string, unknown>) {
  const title = cleanText(input.title as string);
  const body = cleanText(input.body as string);
  if (!title || !body) {
    return Response.json({ error: "Title and body are required." }, { status: 422 });
  }

  const language =
    typeof input.language === "string" && input.language.trim() ? input.language.trim() : "en";
  const { slug: topicSlug, label: topicLabel } = canonicalTopic(input.topic as string);
  const status = normalizeStatus(input.status as string);
  const author = cleanText(input.author as string) || null;
  const summary = cleanText(input.summary as string) || null;
  const sourceUpdatedAt = parseFlexibleDate(input.lastUpdated as string);

  // Same normalization as the seed → admin input is a first-class citizen.
  await db.from("topics").upsert({ slug: topicSlug }, { onConflict: "slug", ignoreDuplicates: true });
  await db
    .from("topic_translations")
    .upsert(
      { topic_slug: topicSlug, language_code: "en", label: topicLabel },
      { onConflict: "topic_slug,language_code", ignoreDuplicates: true },
    );
  await ensureLanguage(db, language);

  // Decide id: edit when a valid id is supplied, else mint one above the source
  // CSV range (1..24) so re-running the seed never collides with admin content.
  let id = Number(input.id);
  const isEdit = Number.isFinite(id) && id > 0;
  if (!isEdit) {
    const { data: maxRow } = await db
      .from("articles")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    id = Math.max((maxRow?.id ?? 0) + 1, 1001);
  }

  let slug = slugify(title) || `${topicSlug}-${id}`;
  const { data: clash } = await db.from("articles").select("id").eq("slug", slug).maybeSingle();
  if (clash && clash.id !== id) slug = `${slug}-${id}`;

  const now = new Date().toISOString();
  let res = await db
    .from("articles")
    .upsert(
      { id, slug, topic_slug: topicSlug, status, author, source_updated_at: sourceUpdatedAt, updated_at: now },
      { onConflict: "id" },
    );
  if (res.error) return Response.json({ error: res.error.message }, { status: 500 });

  res = await db
    .from("article_translations")
    .upsert({ article_id: id, language_code: language, title, summary, body }, { onConflict: "article_id,language_code" });
  if (res.error) return Response.json({ error: res.error.message }, { status: 500 });

  return Response.json({
    ok: true,
    id,
    slug,
    status,
    action: isEdit ? "updated" : "created",
  });
}

async function handleTranslation(db: SupabaseClient, input: Record<string, unknown>) {
  const articleId = Number(input.articleId);
  const language =
    typeof input.language === "string" && input.language.trim() ? input.language.trim() : "";
  const title = cleanText(input.title as string);
  const body = cleanText(input.body as string);
  const summary = cleanText(input.summary as string) || null;
  const activate = input.activate === true;

  if (!Number.isFinite(articleId) || !language || !title || !body) {
    return Response.json({ error: "Article, language, title and body are required." }, { status: 422 });
  }

  const { data: art } = await db.from("articles").select("id, slug").eq("id", articleId).maybeSingle();
  if (!art) return Response.json({ error: "That article does not exist." }, { status: 404 });

  await ensureLanguage(db, language, activate);

  const res = await db
    .from("article_translations")
    .upsert({ article_id: articleId, language_code: language, title, summary, body }, { onConflict: "article_id,language_code" });
  if (res.error) return Response.json({ error: res.error.message }, { status: 500 });

  return Response.json({ ok: true, articleId, slug: art.slug, language, activated: activate });
}
