"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { getResolveMyEntryQueryKey } from "@/shared/api/generated/endpoints/entry/entry";
import { useRouter } from "@/shared/i18n/navigation";
import { continuationOf, type Continuation } from "@/shared/routes/continuation";

import { entryHref, entryParams, fetchEntry, type Entry } from "../model/entry";

type EntryFailureState = { error: unknown; retry: () => void };

const EntryFailureContext = createContext<EntryFailureState | undefined>(undefined);

/**
 * The failure of the entry resolution being rendered, for the `failure`
 * element of `EntryRedirect`, `GuestOnly` and `OnboardingGate`.
 */
export function useEntryFailure(): EntryFailureState {
  const state = useContext(EntryFailureContext);
  if (state === undefined) throw new Error("useEntryFailure outside an entry gate's failure");
  return state;
}

/** The continuation (`returnTo`, `intent`) of the current URL, read once in the browser. */
export function useUrlContinuation(): Continuation {
  const [continuation] = useState(() =>
    typeof window === "undefined" ? {} : continuationOf(window.location.search),
  );
  return continuation;
}

/**
 * The entry of the signed-in user for `continuation` (`GET /api/v1/me/entry`).
 * Never cached between mounts: each resolution reflects current state.
 */
export function useEntry(continuation: Continuation) {
  return useQuery<Entry>({
    queryKey: getResolveMyEntryQueryKey(entryParams(continuation)),
    queryFn: ({ signal }) => fetchEntry(continuation, signal),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}

/** Renders `failure` with the resolution's error and a retry. */
export function EntryFailureBoundary({
  error,
  retry,
  failure,
}: EntryFailureState & { failure: ReactNode }) {
  return <EntryFailureContext value={{ error, retry }}>{failure}</EntryFailureContext>;
}

/**
 * Resolves the entry and replaces the current page with its destination
 * (SF-45), carrying the URL's continuation. While it runs, `pending`
 * renders; a failure renders `failure` (which reads `useEntryFailure`), and a
 * transient failure never navigates.
 */
export function EntryRedirect({ pending, failure }: { pending: ReactNode; failure: ReactNode }) {
  const router = useRouter();
  const continuation = useUrlContinuation();
  const query = useEntry(continuation);
  const href = query.data === undefined ? undefined : entryHref(query.data, continuation);

  useEffect(() => {
    if (href !== undefined) router.replace(href);
  }, [href, router]);

  if (query.isError) {
    return (
      <EntryFailureBoundary
        error={query.error}
        retry={() => void query.refetch()}
        failure={failure}
      />
    );
  }
  return pending;
}
