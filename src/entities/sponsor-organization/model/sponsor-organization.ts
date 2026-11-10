import { useQuery } from "@tanstack/react-query";

import { callWithSession } from "@/entities/session";
import {
  getGetSponsorOrganizationQueryKey,
  getSponsorOrganization,
} from "@/shared/api/generated/endpoints/sponsors/sponsors";
import type {
  SponsorOrganizationResponse,
  SponsorViewerMembershipRole,
} from "@/shared/api/generated/model";

/**
 * A sponsor organization as one of its active members sees it (SF-112
 * `GET /api/v1/sponsor-organizations/{sponsor_id}`): the organization and the
 * viewer's own membership (role and a read-only permission projection). The id
 * is only the lookup key (D-SA26): the backend authorizes every read for that
 * organization against current rows, so an unknown, foreign, malformed or
 * revoked one answers 404 and nothing of it reaches the cache. A suspended
 * organization stays readable, as suspended. Nothing is kept in browser
 * storage; the session boundary clears the cache.
 */
export type SponsorOrganizationAccess = SponsorOrganizationResponse;
export type SponsorRole = SponsorViewerMembershipRole;

/** The cache key of one organization: always the one named by the caller, never "the current one". */
export const sponsorOrganizationQueryKey = (sponsorId: string) =>
  getGetSponsorOrganizationQueryKey(sponsorId);

/** `GET /api/v1/sponsor-organizations/{sponsor_id}`. */
export async function fetchSponsorOrganization(
  sponsorId: string,
  signal?: AbortSignal,
): Promise<SponsorOrganizationAccess> {
  return callWithSession((init) => getSponsorOrganization(sponsorId, { ...init, signal }));
}

/**
 * One organization, read for the portal of that organization. Re-read whenever
 * the page regains focus, so a revocation or suspension committed meanwhile
 * shows on the next read instead of stale content. A query per id: switching
 * organizations never shows the previous one's data while the next loads, and
 * a late answer for one can only land under its own key.
 */
export function useSponsorOrganization(sponsorId: string) {
  return useQuery({
    queryKey: sponsorOrganizationQueryKey(sponsorId),
    queryFn: ({ signal }) => fetchSponsorOrganization(sponsorId, signal),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
