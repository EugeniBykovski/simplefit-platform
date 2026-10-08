"use client";

import { useEntryFailure } from "@/features/session-gate";

import { FailureView } from "./failure-view";

/**
 * The failure state of the entry resolution (SF-45): the retryable failure
 * view, full height. Rendered by the entry gates as their `failure` element.
 */
export function EntryFailure() {
  const { error, retry } = useEntryFailure();
  return (
    <div className="flex min-h-dvh flex-col">
      <FailureView error={error} onRetry={retry} />
    </div>
  );
}
