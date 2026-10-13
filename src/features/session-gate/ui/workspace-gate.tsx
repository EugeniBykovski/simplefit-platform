"use client";

import { useEffect, type ReactNode } from "react";

import { usePathname, useRouter } from "@/shared/i18n/navigation";

import { entryHref, holds, isKnownEntry, type Capability } from "../model/entry";
import { EntryFailureBoundary, useEntry } from "./entry-redirect";

type GateProps = { pending: ReactNode; failure: ReactNode; children: ReactNode };

/**
 * A profile workspace's gate: its pages (phase ACTIVE) render only for a
 * user whose resolved entry reports the workspace's capability (a completed
 * Fighter or Coach profile, SF-51). Anyone else goes where the resolver
 * says, with the page as `returnTo`: account registration first, then an
 * unfinished onboarding, or the role choice for a user who has not started
 * one. No intent is sent, so opening a workspace page never starts a journey
 * on its own. A user with both profiles opens either workspace, whatever the
 * last chosen context: the choice only decides where `/app` lands. A
 * destination this client does not map is a failure, never guessed. Nothing
 * else is decided here: the API authorizes every request.
 */
function WorkspaceGate({
  capability,
  pending,
  failure,
  children,
}: GateProps & { capability: Capability }) {
  const router = useRouter();
  const pathname = usePathname();
  const query = useEntry({});

  const unknown = query.data !== undefined && !isKnownEntry(query.data);
  const entry = query.data !== undefined && isKnownEntry(query.data) ? query.data : undefined;
  const redirect =
    entry !== undefined && !holds(entry, capability)
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

/** The Fighter area (`web.app.fighter`, capability FIGHTER; SF-40). */
export function FighterGate(props: GateProps) {
  return <WorkspaceGate capability="FIGHTER" {...props} />;
}

/** The Coach area (`web.app.coach`, capability COACH; SF-52). */
export function CoachGate(props: GateProps) {
  return <WorkspaceGate capability="COACH" {...props} />;
}
