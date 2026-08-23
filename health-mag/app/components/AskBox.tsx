"use client";

import { useState } from "react";
import Link from "next/link";
import type { AskResult, LanguageCode } from "@/lib/types";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "result"; result: AskResult };

const COPY = {
  en: {
    label: "Ask the Health Companion",
    placeholder: "Ask a health question, e.g. “How can I prevent malaria?”",
    button: "Ask",
    asking: "Asking…",
    hint: "Answers come only from the articles on this site. This is general information, not a diagnosis — for anything urgent, see a clinic.",
    error: "Something went wrong. Please try again.",
    sources: "Sources",
  },
  pcm: {
    label: "Ask the Health Companion",
    placeholder: "Ask health question, e.g. “How I fit prevent malaria?”",
    button: "Ask",
    asking: "Dey ask…",
    hint: "Answer dey come only from the articles wey dey this site. Na general info, no be diagnosis — if e urgent, go clinic.",
    error: "Something no work. Abeg try again.",
    sources: "Where e come from",
  },
} as const;

export function AskBox({ lang }: { lang: LanguageCode }) {
  const copy = lang === "pcm" ? COPY.pcm : COPY.en;
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (q.length < 3) return;
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, lang }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: (data && data.error) || copy.error });
        return;
      }
      setState({ kind: "result", result: data as AskResult });
    } catch {
      setState({ kind: "error", message: copy.error });
    }
  }

  const loading = state.kind === "loading";

  return (
    <section
      aria-label={copy.label}
      className="rounded-2xl border border-accent-border bg-accent p-4 sm:p-5"
    >
      <form onSubmit={submit}>
        <label htmlFor="ask" className="block text-sm font-semibold text-foreground">
          {copy.label}
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <textarea
            id="ask"
            name="question"
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(e as unknown as React.FormEvent);
              }
            }}
            placeholder={copy.placeholder}
            maxLength={1000}
            className="min-h-[46px] flex-1 resize-y rounded-xl border border-border bg-surface px-3 py-2 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <button
            type="submit"
            disabled={loading || question.trim().length < 3}
            className="h-[46px] shrink-0 rounded-xl bg-brand px-5 font-semibold text-brand-contrast transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? copy.asking : copy.button}
          </button>
        </div>
      </form>

      <p className="mt-2 text-xs text-muted">{copy.hint}</p>

      <div aria-live="polite" className="mt-3">
        {loading && <AnswerSkeleton />}
        {state.kind === "error" && (
          <div className="rounded-xl border border-warning-border bg-warning-bg p-3 text-sm text-warning">
            {state.message}
          </div>
        )}
        {state.kind === "result" && <Answer result={state.result} sourcesLabel={copy.sources} />}
      </div>
    </section>
  );
}

function AnswerSkeleton() {
  return (
    <div className="animate-pulse space-y-2 rounded-xl border border-border bg-surface p-3">
      <div className="h-3 w-3/4 rounded bg-surface-2" />
      <div className="h-3 w-full rounded bg-surface-2" />
      <div className="h-3 w-2/3 rounded bg-surface-2" />
    </div>
  );
}

function Answer({ result, sourcesLabel }: { result: AskResult; sourcesLabel: string }) {
  const tone =
    result.status === "answered"
      ? "border-brand/40 bg-surface"
      : result.status === "refused"
        ? "border-warning-border bg-warning-bg"
        : "border-border bg-surface";

  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground">{result.answer}</p>
      {result.citations.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{sourcesLabel}</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {result.citations.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/articles/${c.slug}`}
                  className="inline-block rounded-full border border-border bg-surface-2 px-3 py-1 text-sm text-brand-strong hover:border-brand"
                >
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
