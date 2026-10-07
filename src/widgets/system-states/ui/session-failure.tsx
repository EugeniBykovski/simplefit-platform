"use client";

import { restoreSession, useSession } from "@/entities/session";

import { FailureView } from "./failure-view";

/**
 * What a session gate shows while the session cannot be confirmed because of
 * a network or server failure (SF-24): the production failure state for that
 * error (offline, unavailable, unexpected) with "Try again", which retries the
 * restore. The credentials are kept meanwhile; this is never a sign-out.
 */
export function SessionFailure() {
  const { error } = useSession();
  return (
    <div className="flex min-h-dvh flex-col">
      <FailureView error={error} onRetry={() => void restoreSession()} />
    </div>
  );
}
