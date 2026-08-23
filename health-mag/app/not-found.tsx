import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-strong">404</p>
      <h1 className="mt-2 text-xl font-semibold text-foreground">Page not found</h1>
      <p className="mt-2 text-sm text-muted">
        The article you&apos;re looking for may have been moved or is not published.
      </p>
      <Link
        href="/"
        className="mt-5 rounded-xl bg-brand px-5 py-2 font-semibold text-brand-contrast transition-colors hover:bg-brand-strong"
      >
        Back to home
      </Link>
    </div>
  );
}
