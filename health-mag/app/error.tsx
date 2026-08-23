"use client";

// Route error boundary. Next.js 16 passes `retry` (stable since 16.3.0); we
// also accept `reset` defensively so this works regardless of version.
export default function Error({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  retry?: () => void;
}) {
  const tryAgain = retry ?? reset;
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning-bg text-warning">
        <span className="text-2xl">!</span>
      </div>
      <h1 className="mt-4 text-xl font-semibold text-foreground">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">
        We couldn&apos;t load this content just now. This can happen if the content service is
        unavailable. Please try again in a moment.
      </p>
      {tryAgain && (
        <button
          type="button"
          onClick={() => tryAgain()}
          className="mt-5 rounded-xl bg-brand px-5 py-2 font-semibold text-brand-contrast transition-colors hover:bg-brand-strong"
        >
          Try again
        </button>
      )}
    </div>
  );
}
