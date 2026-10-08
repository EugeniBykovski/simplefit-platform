"use client";

import { useEffect, type ReactNode } from "react";

import { usePathname, useRouter } from "@/shared/i18n/navigation";
import { matchWebRoute } from "@/shared/routes/routes";

import { destinationRoute, entryHref } from "../model/entry";
import { EntryFailureBoundary, useEntry, useUrlContinuation } from "./entry-redirect";

const ACCOUNT_REGISTRATION = destinationRoute("account_registration");

/**
 * Keeps the onboarding routes in the backend's order (SF-45): account
 * registration comes first. A role onboarding page opened before it is
 * complete goes to account registration with the page's continuation; the
 * account registration page, once registration is complete (here or in
 * another tab), continues to the resolved entry. Nothing else is decided
 * here: the role pages keep their own state, and the API authorizes.
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

  const entry = query.data;
  const onAccountRegistration = matchWebRoute(pathname)?.id === ACCOUNT_REGISTRATION;
  const gated = entry?.destination === "account_registration";
  const redirect =
    entry !== undefined && gated !== onAccountRegistration
      ? entryHref(entry, continuation)
      : undefined;

  useEffect(() => {
    if (redirect !== undefined) router.replace(redirect);
  }, [redirect, router]);

  if (query.isError) {
    return (
      <EntryFailureBoundary
        error={query.error}
        retry={() => void query.refetch()}
        failure={failure}
      />
    );
  }
  if (entry === undefined || redirect !== undefined) return pending;
  return children;
}
