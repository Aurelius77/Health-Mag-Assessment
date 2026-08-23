"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";

// The admin page talks ONLY to /api/admin, sending the shared token in a header.
// Nothing here imports the service-role key or any server module — writes happen
// on the server, gated by the token. The token is remembered in localStorage for
// convenience so a refresh keeps the team signed in on their own device.

const TOKEN_KEY = "hc_admin_token";

interface AdminArticle {
  id: number;
  slug: string;
  status: string;
  title: string;
  languages: string[];
}
interface AdminLanguage {
  code: string;
  name: string;
  native_name: string | null;
  is_active: boolean;
  sort_order: number;
}
interface AdminTopic {
  slug: string;
  label: string;
}
interface AdminData {
  articles: AdminArticle[];
  languages: AdminLanguage[];
  topics: AdminTopic[];
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-brand";
const labelCls = "block text-sm font-medium text-foreground";
const helpCls = "mt-1 text-xs text-muted";
const primaryBtn =
  "rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60";

function langLabel(l: AdminLanguage): string {
  const native = l.native_name && l.native_name !== l.name ? ` / ${l.native_name}` : "";
  return `${l.name}${native}${l.is_active ? "" : " (not yet live)"}`;
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [data, setData] = useState<AdminData | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tab, setTab] = useState<"article" | "translation">("article");

  const load = useCallback(async (tok: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/admin", { headers: { "x-admin-token": tok } });
      if (res.status === 401) {
        setAuthError("That access code was not accepted.");
        return false;
      }
      const json = await res.json();
      if (!res.ok) {
        setAuthError(json.error ?? "Could not load admin data.");
        return false;
      }
      setData(json as AdminData);
      setUnlocked(true);
      setAuthError(null);
      return true;
    } catch {
      setAuthError("Network error — could not reach the server.");
      return false;
    }
  }, []);

  // Auto-unlock from a remembered access code.
  useEffect(() => {
    let stored = "";
    try {
      stored = localStorage.getItem(TOKEN_KEY) ?? "";
    } catch {
      /* storage unavailable — fall through to the unlock form */
    }
    if (!stored) return;
    setToken(stored);
    setUnlocking(true);
    load(stored).finally(() => setUnlocking(false));
  }, [load]);

  const reload = useCallback(() => {
    if (token) void load(token);
  }, [token, load]);

  async function submitUnlock(e: FormEvent) {
    e.preventDefault();
    const tok = token.trim();
    if (!tok) return;
    setUnlocking(true);
    setAuthError(null);
    const ok = await load(tok);
    if (ok) {
      try {
        localStorage.setItem(TOKEN_KEY, tok);
      } catch {
        /* ignore */
      }
    }
    setUnlocking(false);
  }

  function lock() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    setUnlocked(false);
    setData(null);
    setToken("");
  }

  if (!unlocked || !data) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Content admin</h1>
        <p className="mt-2 text-sm text-muted">
          Enter your team access code to add and update health articles.
        </p>
        <form onSubmit={submitUnlock} className="mt-6 space-y-3 rounded-2xl border border-border bg-surface p-5">
          <div>
            <label htmlFor="token" className={labelCls}>
              Access code
            </label>
            <input
              id="token"
              type="password"
              autoComplete="current-password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className={`${inputCls} mt-1`}
              placeholder="Paste your access code"
            />
          </div>
          {authError && <p className="text-sm text-warning">{authError}</p>}
          <button type="submit" disabled={unlocking || !token.trim()} className={primaryBtn}>
            {unlocking ? "Checking…" : "Unlock"}
          </button>
        </form>
        <p className="mt-4 text-sm">
          <Link href="/" className="text-brand-strong hover:underline">
            ← Back to the site
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Content admin</h1>
        <button
          onClick={lock}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
        >
          Lock
        </button>
      </div>
      <p className="mt-2 text-sm text-muted">
        Add a new article or translate an existing one. Published articles appear on the site
        immediately; drafts stay hidden until you publish them.
      </p>

      <div className="mt-6 flex gap-1 rounded-xl border border-border bg-surface p-1">
        <TabButton active={tab === "article"} onClick={() => setTab("article")}>
          Add an article
        </TabButton>
        <TabButton active={tab === "translation"} onClick={() => setTab("translation")}>
          Add a translation
        </TabButton>
      </div>

      <div className="mt-5">
        {tab === "article" ? (
          <ArticleForm token={token} data={data} onSaved={reload} />
        ) : (
          <TranslationForm token={token} data={data} onSaved={reload} />
        )}
      </div>

      <p className="mt-6 text-sm">
        <Link href="/" className="text-brand-strong hover:underline">
          ← Back to the site
        </Link>
      </p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-brand text-brand-contrast" : "text-muted hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

type Notice = { ok: boolean; text: string } | null;

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p
      role="status"
      className={[
        "rounded-lg border px-3 py-2 text-sm",
        notice.ok
          ? "border-brand/40 bg-accent text-brand-strong"
          : "border-warning-border bg-warning-bg text-warning",
      ].join(" ")}
    >
      {notice.text}
    </p>
  );
}

const BLANK_ARTICLE = {
  title: "",
  topic: "",
  summary: "",
  body: "",
  author: "",
  lastUpdated: "",
  status: "published",
  language: "en",
};

function ArticleForm({
  token,
  data,
  onSaved,
}: {
  token: string;
  data: AdminData;
  onSaved: () => void;
}) {
  const defaultLang = data.languages.find((l) => l.code === "en") ? "en" : data.languages[0]?.code ?? "en";
  const [form, setForm] = useState({ ...BLANK_ARTICLE, language: defaultLang });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ action: "article", article: form }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ ok: false, text: json.error ?? "Could not save the article." });
        return;
      }
      setNotice({
        ok: true,
        text: `Saved “${form.title.trim()}” — ${
          json.status === "published" ? "it is live on the site now." : "kept as a draft (not shown yet)."
        }`,
      });
      setForm({ ...BLANK_ARTICLE, language: form.language, status: form.status });
      onSaved();
    } catch {
      setNotice({ ok: false, text: "Network error — please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <div>
        <label htmlFor="a-title" className={labelCls}>
          Title <span className="text-warning">*</span>
        </label>
        <input
          id="a-title"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          className={`${inputCls} mt-1`}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="a-topic" className={labelCls}>
            Topic
          </label>
          <input
            id="a-topic"
            list="topic-options"
            value={form.topic}
            onChange={(e) => set("topic", e.target.value)}
            className={`${inputCls} mt-1`}
            placeholder="e.g. Malaria"
          />
          <datalist id="topic-options">
            {data.topics.map((t) => (
              <option key={t.slug} value={t.label} />
            ))}
          </datalist>
          <p className={helpCls}>Pick an existing topic or type a new one.</p>
        </div>

        <div>
          <label htmlFor="a-language" className={labelCls}>
            Written in
          </label>
          <select
            id="a-language"
            value={form.language}
            onChange={(e) => set("language", e.target.value)}
            className={`${inputCls} mt-1`}
          >
            {data.languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="a-summary" className={labelCls}>
          Summary
        </label>
        <textarea
          id="a-summary"
          value={form.summary}
          onChange={(e) => set("summary", e.target.value)}
          className={`${inputCls} mt-1`}
          rows={2}
          placeholder="One or two sentences shown on cards and search results."
        />
      </div>

      <div>
        <label htmlFor="a-body" className={labelCls}>
          Article text <span className="text-warning">*</span>
        </label>
        <textarea
          id="a-body"
          value={form.body}
          onChange={(e) => set("body", e.target.value)}
          className={`${inputCls} mt-1`}
          rows={8}
          required
        />
        <p className={helpCls}>Plain text. Any stray HTML tags are removed automatically.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="a-author" className={labelCls}>
            Author
          </label>
          <input
            id="a-author"
            value={form.author}
            onChange={(e) => set("author", e.target.value)}
            className={`${inputCls} mt-1`}
          />
        </div>
        <div>
          <label htmlFor="a-date" className={labelCls}>
            Last updated
          </label>
          <input
            id="a-date"
            type="date"
            value={form.lastUpdated}
            onChange={(e) => set("lastUpdated", e.target.value)}
            className={`${inputCls} mt-1`}
          />
        </div>
        <div>
          <label htmlFor="a-status" className={labelCls}>
            Status
          </label>
          <select
            id="a-status"
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
            className={`${inputCls} mt-1`}
          >
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </div>
      </div>

      <NoticeBox notice={notice} />

      <button type="submit" disabled={busy} className={primaryBtn}>
        {busy ? "Saving…" : "Save article"}
      </button>
    </form>
  );
}

function TranslationForm({
  token,
  data,
  onSaved,
}: {
  token: string;
  data: AdminData;
  onSaved: () => void;
}) {
  const firstArticle = data.articles[0]?.id ?? 0;
  const [articleId, setArticleId] = useState<number>(firstArticle);
  const [language, setLanguage] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [activate, setActivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const selectedArticle = data.articles.find((a) => a.id === articleId);
  const selectedLang = data.languages.find((l) => l.code === language);
  const alreadyHas = selectedArticle?.languages.includes(language) ?? false;
  const isInactive = !!selectedLang && !selectedLang.is_active;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!articleId || !language) {
      setNotice({ ok: false, text: "Choose an article and a language first." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": token },
        body: JSON.stringify({
          action: "translation",
          translation: { articleId, language, title, summary, body, activate: isInactive && activate },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ ok: false, text: json.error ?? "Could not save the translation." });
        return;
      }
      const langName = selectedLang?.name ?? language;
      setNotice({
        ok: true,
        text: json.activated
          ? `Saved. ${langName} is now available on the site.`
          : `Saved the ${langName} translation.`,
      });
      setTitle("");
      setSummary("");
      setBody("");
      onSaved();
    } catch {
      setNotice({ ok: false, text: "Network error — please try again." });
    } finally {
      setBusy(false);
    }
  }

  if (data.articles.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
        There are no articles yet. Add an article first, then come back to translate it.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="t-article" className={labelCls}>
            Article <span className="text-warning">*</span>
          </label>
          <select
            id="t-article"
            value={articleId}
            onChange={(e) => setArticleId(Number(e.target.value))}
            className={`${inputCls} mt-1`}
          >
            {data.articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
                {a.status !== "published" ? " (draft)" : ""}
              </option>
            ))}
          </select>
          {selectedArticle && selectedArticle.languages.length > 0 && (
            <p className={helpCls}>Existing translations: {selectedArticle.languages.join(", ")}.</p>
          )}
        </div>

        <div>
          <label htmlFor="t-language" className={labelCls}>
            Language <span className="text-warning">*</span>
          </label>
          <select
            id="t-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className={`${inputCls} mt-1`}
            required
          >
            <option value="">Choose a language…</option>
            {data.languages.map((l) => (
              <option key={l.code} value={l.code}>
                {langLabel(l)}
              </option>
            ))}
          </select>
          {alreadyHas && (
            <p className={helpCls}>This will replace the existing translation for that language.</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="t-title" className={labelCls}>
          Title <span className="text-warning">*</span>
        </label>
        <input
          id="t-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`${inputCls} mt-1`}
          required
        />
      </div>

      <div>
        <label htmlFor="t-summary" className={labelCls}>
          Summary
        </label>
        <textarea
          id="t-summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className={`${inputCls} mt-1`}
          rows={2}
        />
      </div>

      <div>
        <label htmlFor="t-body" className={labelCls}>
          Article text <span className="text-warning">*</span>
        </label>
        <textarea
          id="t-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={`${inputCls} mt-1`}
          rows={8}
          required
        />
      </div>

      {isInactive && (
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={activate}
            onChange={(e) => setActivate(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border accent-brand"
          />
          <span>
            Make {selectedLang?.name} available on the site (adds it to the language switcher).
          </span>
        </label>
      )}

      <NoticeBox notice={notice} />

      <button type="submit" disabled={busy} className={primaryBtn}>
        {busy ? "Saving…" : "Save translation"}
      </button>
    </form>
  );
}
