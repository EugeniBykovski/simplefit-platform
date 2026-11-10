import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { callWithSession } from "@/entities/session";
import {
  completeSponsorFirstRun,
  dismissSponsorFirstRun,
  getGetSponsorFirstRunQueryKey,
  getSponsorFirstRun,
  startSponsorFirstRun,
} from "@/shared/api/generated/endpoints/sponsors/sponsors";
import type {
  SponsorFirstRun as SponsorFirstRunModel,
  SponsorFirstRunStatus,
} from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";

/**
 * The viewer's partner portal first run in one organization (SF-119; simplefit-api
 * ADR 0030, SF-119 amendment): `GET /api/v1/sponsor-organizations/{sponsor_id}/first-run`.
 *
 * - One state per organization and member, the same on every client and after any
 *   sign-in: a tour started on another device is "in progress" here. The cache only
 *   holds the backend's latest answer for that organization (one key per id),
 *   nothing is kept in browser storage, and nothing is written optimistically.
 * - `completed` and `dismissed` are final; the backend never reopens them.
 * - `unavailable` while the organization is suspended. Presentation only: it grants
 *   nothing, and every portal request is authorized on its own.
 */
export type SponsorFirstRun = SponsorFirstRunModel;
export type SponsorFirstRunState = SponsorFirstRunStatus;
export type SponsorFirstRunAction = "start" | "complete" | "dismiss";

export const sponsorFirstRunQueryKey = (sponsorId: string) =>
  getGetSponsorFirstRunQueryKey(sponsorId);

/** `GET /api/v1/sponsor-organizations/{sponsor_id}/first-run`. */
export async function fetchSponsorFirstRun(
  sponsorId: string,
  signal?: AbortSignal,
): Promise<SponsorFirstRun> {
  const { first_run } = await callWithSession((init) =>
    getSponsorFirstRun(sponsorId, { ...init, signal }),
  );
  return first_run;
}

/**
 * The first run of one organization for the viewer. Re-read when the window regains
 * focus, so an introduction started, finished or skipped on another device or tab is
 * picked up.
 */
export function useSponsorFirstRun(sponsorId: string) {
  return useQuery({
    queryKey: sponsorFirstRunQueryKey(sponsorId),
    queryFn: ({ signal }) => fetchSponsorFirstRun(sponsorId, signal),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

const CALLS = {
  start: startSponsorFirstRun,
  complete: completeSponsorFirstRun,
  dismiss: dismissSponsorFirstRun,
} as const;

/** The other outcome is already kept (`409 conflict`, `details.first_run`). */
export function isSponsorFirstRunConflict(error: unknown): boolean {
  return isApiError(error) && error.status === 409 && "first_run" in error.details;
}

/**
 * Explicit transitions (`POST …/first-run/start|complete|dismiss`, empty body) for the
 * organization `sponsorId`, bound when the caller renders: a call started for one
 * organization can only ever write that organization, whatever the viewer opened
 * since. Each resolves with the backend's kept state, which becomes that
 * organization's cache entry; repeating one is safe. A `409` re-reads the state and
 * rejects, so the caller shows what the server kept, never a guess.
 */
export function useSponsorFirstRunActions(sponsorId: string) {
  const client = useQueryClient();
  return useCallback(
    async (action: SponsorFirstRunAction): Promise<SponsorFirstRun> => {
      try {
        const { first_run } = await callWithSession((init) => CALLS[action](sponsorId, {}, init));
        if (first_run.sponsor_id === sponsorId) {
          client.setQueryData(sponsorFirstRunQueryKey(sponsorId), first_run);
        }
        return first_run;
      } catch (error) {
        if (isApiError(error) && (error.status === 409 || error.status === 404)) {
          await client.invalidateQueries({ queryKey: sponsorFirstRunQueryKey(sponsorId) });
        }
        throw error;
      }
    },
    [client, sponsorId],
  );
}
