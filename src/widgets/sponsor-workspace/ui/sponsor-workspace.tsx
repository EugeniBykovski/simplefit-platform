"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { createContext, useContext, useEffect, type ReactNode } from "react";

import {
  useSponsorOrganization,
  type SponsorOrganizationAccess,
} from "@/entities/sponsor-organization";
import { ContextSwitcher } from "@/features/session-gate";
import { getResolveMyEntryQueryKey } from "@/shared/api/generated/endpoints/entry/entry";
import { isApiError } from "@/shared/api/http/api-error";
import { ApplicationSkeleton, FailureView } from "@/widgets/system-states";
import { WorkspaceShell } from "@/widgets/workspace-shell";

import { SponsorNotAvailable } from "./sponsor-states";

const SponsorWorkspaceContext = createContext<SponsorOrganizationAccess | undefined>(undefined);

/**
 * The organization the enclosing portal shows, with the viewer's membership:
 * the backend's answer for the organization in the path, read and authorized
 * for that id. Pages inside the portal render only once it exists, so nothing
 * of another organization can ever be on screen.
 */
export function useSponsorWorkspace(): SponsorOrganizationAccess {
  const access = useContext(SponsorWorkspaceContext);
  if (access === undefined) throw new Error("useSponsorWorkspace outside a partner portal");
  return access;
}

const statusOf = (error: unknown) => (isApiError(error) ? error.status : undefined);

/**
 * The partner portal (`web.sponsor` shell, `/sponsor/:sponsorId/**`; SF-117,
 * D-SA26) for the organization named in the path. The id is only a lookup
 * key: `GET /api/v1/sponsor-organizations/{sponsor_id}` answers only for an
 * active member of that organization while it isn't closed, read on every
 * request, and the portal renders its pages only with that answer.
 *
 * - **Not available** (404: unknown, foreign, malformed, closed or revoked):
 *   one state inside the shell that never says which. A re-read that turns
 *   into 404 (a membership revoked while the page is open) replaces whatever
 *   was shown, and the entry is resolved again, so the switcher drops the
 *   organization and the gate sends a viewer with no portal left where the
 *   entry says.
 * - **Suspended**: readable, said to be suspended (ADR 0030, ADR 0033); the
 *   overview shows the notice. Entry no longer offers it.
 * - **Failure** (offline, 5xx): a retry; a failed background re-read keeps the
 *   organization already shown, since nothing says it changed.
 * - **401**: the session layer refreshes once, then ends the session, and the
 *   session gate signs in again.
 *
 * Switching organizations changes the path: the next portal loads under its
 * own key with a skeleton (never the previous organization's content), is
 * announced, and focus moves to the page. What a browser already received
 * isn't recalled by a revocation; it is dropped from the screen on the next
 * denial and from the cache at the session boundary.
 */
export function SponsorWorkspace({
  sponsorId,
  children,
}: {
  sponsorId: string;
  children: ReactNode;
}) {
  const t = useTranslations("sponsorPortal");
  const client = useQueryClient();
  const query = useSponsorOrganization(sponsorId);
  // Only the answer for this very id is ever shown.
  const access = query.data?.organization.sponsor_id === sponsorId ? query.data : undefined;
  const status = query.isError ? statusOf(query.error) : undefined;
  const refused = status === 404 || status === 403;

  useEffect(() => {
    // Access changed under the viewer: the entry (and so the switcher and the
    // gate's capability) is resolved again from current state.
    if (refused) void client.invalidateQueries({ queryKey: getResolveMyEntryQueryKey() });
  }, [refused, client]);

  const announced = access !== undefined && !refused ? access : undefined;
  const shownId = announced?.organization.sponsor_id;
  useEffect(() => {
    if (shownId !== undefined && document.activeElement === document.body) {
      document.getElementById("main")?.focus();
    }
  }, [shownId]);

  let content: ReactNode;
  if (refused) content = <SponsorNotAvailable />;
  else if (access === undefined) {
    content =
      query.isError && status !== 401 ? (
        <FailureView error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <ApplicationSkeleton />
      );
  } else content = <SponsorWorkspaceContext value={access}>{children}</SponsorWorkspaceContext>;

  return (
    <WorkspaceShell
      shell="web.sponsor"
      params={{ sponsorId }}
      identity={
        announced === undefined ? undefined : (
          <ContextSwitcher
            sponsor={{
              id: announced.organization.sponsor_id,
              name: announced.organization.display_name,
              role: announced.membership.role,
              status: announced.organization.status,
            }}
          />
        )
      }
    >
      <p role="status" aria-live="polite" className="sr-only" data-sponsor-announcement>
        {announced === undefined
          ? ""
          : t("announcement", { name: announced.organization.display_name })}
      </p>
      {content}
    </WorkspaceShell>
  );
}
