import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getArticleBySlug } from "@/lib/content";
import { getRequestedLang } from "@/lib/lang";
import { formatDate } from "@/lib/format";
import { AskBox } from "@/app/components/AskBox";

export async function generateMetadata(
  props: PageProps<"/articles/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const lang = await getRequestedLang();
  const article = await getArticleBySlug(slug, lang);
  if (!article) return { title: "Article not found" };
  return {
    title: article.title,
    description: article.summary ?? article.body.slice(0, 155),
  };
}

const NOTICE = {
  en: "This article isn't available in your language yet — showing the English version.",
  pcm: "This article never dey for Pidgin yet — na the English version we dey show.",
};

export default async function ArticlePage(props: PageProps<"/articles/[slug]">) {
  const { slug } = await props.params;
  const lang = await getRequestedLang();
  const article = await getArticleBySlug(slug, lang);
  if (!article) notFound();

  const date = formatDate(article.source_updated_at);
  const notice = lang === "pcm" ? NOTICE.pcm : NOTICE.en;

  return (
    <article className="mx-auto max-w-2xl">
      <Link href="/" className="text-sm text-brand-strong hover:underline">
        ← Back to all articles
      </Link>

      <div className="mt-4">
        <Link
          href={`/?topic=${encodeURIComponent(article.topic_slug)}`}
          className="inline-block rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-brand-strong hover:bg-accent"
        >
          {article.topic_label}
        </Link>
      </div>

      <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {article.title}
      </h1>

      {(article.author || date) && (
        <p className="mt-2 text-sm text-muted">
          {article.author}
          {article.author && date ? " · " : ""}
          {date}
        </p>
      )}

      {article.is_fallback && (
        <p className="mt-4 rounded-xl border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning">
          {notice}
        </p>
      )}

      <div className="mt-5 whitespace-pre-line text-[17px] leading-relaxed text-foreground">
        {article.body}
      </div>

      <hr className="my-8 border-border" />

      <AskBox lang={lang} />
    </article>
  );
}
