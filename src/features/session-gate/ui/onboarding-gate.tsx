"use client";

import { useEffect, type ReactNode } from "react";

import { usePathname, useRouter } from "@/shared/i18n/navigation";
import { matchWebRoute } from "@/shared/routes/routes";

import { destinationRoute, entryHref, knowsDestination } from "../model/entry";
import { EntryFailureBoundary, useEntry, useUrlContinuation } from "./entry-redirect";

const ACCOUNT_REGISTRATION = destinationRoute("account_registration");
const ROLE_SELECTION = destinationRoute("role_selection");

/**
 * Keeps the onboarding routes in the backend's order (SF-45): account
 * registration comes first. A role onboarding page opened before it is
 * complete goes to account registration with the page's continuation; the
 * account registration page, once registration is complete (here or in
 * another tab), continues to the resolved entry. Role selection (WA6) shows
 * only when the resolver answers `role_selection`; any other answer (an
 * intent in the URL, an existing Fighter) continues to that destination, so
 * nothing bounces between the two. Nothing else is decided here: the role
 * pages keep their own state, and the API authorizes.
 */
export function OnboardingGate({
  pending,
  failure,
  children,
}: {
  pending: ReactNode;
  failure: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const continuation = useUrlContinuation();
  const query = useEntry(continuation);

  // A destination this client does not map (a newer API) is a failure, never guessed.
  const unknown = query.data !== undefined && !knowsDestination(query.data.destination);
  const entry = unknown ? undefined : query.data;
  const routeId = matchWebRoute(pathname)?.id;
  const onAccountRegistration = routeId === ACCOUNT_REGISTRATION;
  const gated = entry?.destination === "account_registration";
  const misplaced =
    entry !== undefined &&
    (gated !== onAccountRegistration ||
      (routeId === ROLE_SELECTION && entry.destination !== "role_selection"));
  const redirect = misplaced ? entryHref(entry, continuation) : undefined;

  useEffect(() => {
    if (redirect !== undefined) router.replace(redirect);
  }, [redirect, router]);

  if (query.isError || unknown) {
    return (
      <EntryFailureBoundary
        error={query.error ?? new Error("Unknown entry destination")}
        retry={() => void query.refetch()}
        failure={failure}
      />
    );
  }
  if (entry === undefined || redirect !== undefined) return pending;
  return children;
}
