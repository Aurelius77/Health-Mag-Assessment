import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getRequestedLang } from "@/lib/lang";
import { LanguageSwitcherServer } from "./components/LanguageSwitcherServer";

export const metadata: Metadata = {
  title: {
    default: "Health Companion — trustworthy health guidance",
    template: "%s · Health Companion",
  },
  description:
    "Simple, practical health information in English and Nigerian Pidgin, with an AI companion that answers from vetted articles.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  let lang = "en";
  try {
    lang = await getRequestedLang();
  } catch {
    // fall back to English if the language list can't be loaded
  }

  return (
    <html lang={lang} className="h-full">
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-surface/85 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-lg font-bold text-brand-contrast">
                ＋
              </span>
              <span className="text-base font-semibold tracking-tight text-foreground">
                Health Companion
              </span>
            </Link>
            <LanguageSwitcherServer />
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">{children}</main>

        <footer className="border-t border-border bg-surface">
          <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted">
            <p className="font-medium text-foreground">Health Companion</p>
            <p className="mt-1 max-w-2xl">
              General health information for education only — not a substitute for professional
              medical advice, diagnosis, or treatment. In an emergency, go to the nearest clinic or
              hospital immediately.
            </p>
            <p className="mt-3">
              <Link href="/admin" className="underline decoration-border underline-offset-4 hover:text-foreground">
                Content admin
              </Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
