"use client";

import { useEffect, type ReactNode } from "react";

import { usePathname, useRouter } from "@/shared/i18n/navigation";

import { entryHref, knowsDestination } from "../model/entry";
import { EntryFailureBoundary, useEntry } from "./entry-redirect";

/**
 * The Fighter area's gate (SF-40): its pages (`web.app.fighter`, capability
 * FIGHTER, phase ACTIVE) render only for a user the entry resolver (SF-45)
 * sends to `fighter_home`. Anyone else goes where the resolver says, with the
 * page as `returnTo`: account registration first, then an unfinished Fighter
 * onboarding, or the role choice for a user who has not started one. No
 * intent is sent, so opening a Fighter page never starts a Fighter journey on
 * its own. A destination this client does not map is a failure, never
 * guessed. Nothing else is decided here: the API authorizes every request.
 */
export function FighterGate({
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
  const query = useEntry({});

  const unknown = query.data !== undefined && !knowsDestination(query.data.destination);
  const entry = unknown ? undefined : query.data;
  const redirect =
    entry !== undefined && entry.destination !== "fighter_home"
      ? entryHref(entry, { returnTo: pathname })
      : undefined;

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
