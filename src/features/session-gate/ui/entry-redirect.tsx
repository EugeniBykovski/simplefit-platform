"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useId, useMemo, type ReactNode } from "react";

import { getResolveMyEntryQueryKey } from "@/shared/api/generated/endpoints/entry/entry";
import { useRouter } from "@/shared/i18n/navigation";
import { continuationOf, type Continuation } from "@/shared/routes/continuation";

import { entryHref, entryParams, fetchEntry, isKnownEntry, type Entry } from "../model/entry";

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

/**
 * The continuation (`returnTo`, `intent`) of the current URL. Read from the
 * router, not `window.location`: a client-side navigation renders the new
 * page before the browser's URL changes, so `/app?intent=fighter` reached by
 * a link would otherwise resolve with the previous page's query.
 */
export function useUrlContinuation(): Continuation {
  const search = useSearchParams().toString();
  return useMemo(() => continuationOf(search), [search]);
}

/**
 * The entry of the signed-in user for `continuation` (`GET /api/v1/me/entry`).
 * Never shared between mounts: each mount resolves anew under its own key, so
 * a page never acts on another page's earlier answer for the same intent (the
 * onboarding gate's "onboarding" read before completion, say, reaching `/app`
 * after it). Invalidating the operation's key prefix still refreshes every
 * mounted resolution.
 */
export function useEntry(continuation: Continuation) {
  const mount = useId();
  return useQuery<Entry>({
    queryKey: [...getResolveMyEntryQueryKey(entryParams(continuation)), mount],
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
  // A destination this client does not map (a newer API) is a failure, never guessed.
  const unknown = query.data !== undefined && !isKnownEntry(query.data);
  const href =
    query.data !== undefined && isKnownEntry(query.data)
      ? entryHref(query.data, continuation)
      : undefined;

  useEffect(() => {
    if (href !== undefined) router.replace(href);
  }, [href, router]);

  if (query.isError || unknown) {
    return (
      <EntryFailureBoundary
        error={query.error ?? new Error("Unknown entry destination")}
        retry={() => void query.refetch()}
        failure={failure}
      />
    );
  }
  return pending;
}
