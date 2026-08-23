import Link from "next/link";
import { getRequestedLang } from "@/lib/lang";
import { getTopics, listArticles } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { AskBox } from "./components/AskBox";
import type { Article, LanguageCode } from "@/lib/types";

const COPY = {
  en: {
    heroTitle: "Health information you can trust",
    heroSubtitle:
      "Simple, practical guidance for staying healthy — and an AI companion that answers using only these articles.",
    browse: "Browse by topic",
    all: "All",
    fallbackBadge: "In English",
    empty: "No articles here yet. Try another topic.",
    articlesFor: (t: string) => `Articles · ${t}`,
    allArticles: "Latest articles",
  },
  pcm: {
    
    heroTitle: "Health info wey you fit trust",
    heroSubtitle:
      "Simple, practical guide to stay healthy — plus AI companion wey dey answer with only these articles.",
    browse: "Check by topic",
    all: "All",
    fallbackBadge: "Na English",
    empty: "No article dey here yet. Try another topic.",
    articlesFor: (t: string) => `Articles · ${t}`,
    allArticles: "Latest articles",
  },
} as const;

function copyFor(lang: LanguageCode) {
  return lang === "pcm" ? COPY.pcm : COPY.en;
}

export default async function Home(props: PageProps<"/">) {
  const sp = await props.searchParams;
  const topic = typeof sp.topic === "string" ? sp.topic : undefined;

  const lang = await getRequestedLang();
  const [topics, articles] = await Promise.all([
    getTopics(lang),
    listArticles({ lang, topic }),
  ]);
  const copy = copyFor(lang);
  const activeTopic = topics.find((t) => t.slug === topic);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {copy.heroTitle}
          </h1>
          <p className="mt-2 max-w-2xl text-muted">{copy.heroSubtitle}</p>
        </div>
        <AskBox lang={lang} />
      </section>

      <section aria-label={copy.browse} className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{copy.browse}</h2>
        <div className="flex flex-wrap gap-2">
          <TopicChip href="/" label={copy.all} active={!topic} />
          {topics.map((t) => (
            <TopicChip
              key={t.slug}
              href={`/?topic=${encodeURIComponent(t.slug)}`}
              label={t.label}
              active={t.slug === topic}
            />
          ))}
        </div>
      </section>

      <section aria-label={copy.allArticles} className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          {activeTopic ? copy.articlesFor(activeTopic.label) : copy.allArticles}
        </h2>
        {articles.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-6 text-center text-muted">
            {copy.empty}
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((a) => (
              <li key={a.id} className="contents">
                <ArticleCard article={a} fallbackLabel={copy.fallbackBadge} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TopicChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-brand bg-brand text-brand-contrast"
          : "border-border bg-surface text-muted hover:border-brand hover:text-foreground",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function ArticleCard({ article, fallbackLabel }: { article: Article; fallbackLabel: string }) {
  const date = formatDate(article.source_updated_at);
  return (
    <Link
      href={`/articles/${article.slug}`}
      className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-brand-strong">
          {article.topic_label}
        </span>
        {article.is_fallback && (
          <span className="rounded-full border border-warning-border bg-warning-bg px-2 py-0.5 text-xs text-warning">
            {fallbackLabel}
          </span>
        )}
      </div>
      <h3 className="mt-2 font-semibold leading-snug text-foreground group-hover:text-brand-strong">
        {article.title}
      </h3>
      {article.summary && (
        <p className="mt-1 line-clamp-3 text-sm text-muted">{article.summary}</p>
      )}
      {(date || article.author) && (
        <div className="mt-auto pt-3 text-xs text-muted">
          {date}
          {date && article.author ? " · " : ""}
          {article.author}
        </div>
      )}
    </Link>
  );
}
