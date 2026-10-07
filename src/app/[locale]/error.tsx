"use client";

import { SiteHeader } from "@/widgets/site-header";
import { FailureView } from "@/widgets/system-states";

/**
 * Error boundary of every locale route (SF-34): an unexpected, offline,
 * forbidden or unavailable failure state below the public header, with
 * "Try again" (`reset`) where retrying can help. The error's message, digest
 * and stack are never rendered; a 401 returns to sign-in instead.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <FailureView error={error} onRetry={reset} />
      </main>
    </div>
  );
}
