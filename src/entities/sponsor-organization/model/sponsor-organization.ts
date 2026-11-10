import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { callWithSession } from "@/entities/session";
import {
  getGetSponsorOrganizationQueryKey,
  getListSponsorContactsQueryKey,
  getListSponsorMembersQueryKey,
  getSponsorOrganization,
  listSponsorContacts,
  listSponsorMembers,
} from "@/shared/api/generated/endpoints/sponsors/sponsors";
import type {
  SponsorContact,
  SponsorMember,
  SponsorMemberListResponse,
  SponsorOrganizationResponse,
  SponsorViewerMembershipPermissionsItem,
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
export type SponsorPermission = SponsorViewerMembershipPermissionsItem;
export type { SponsorContact, SponsorMember };

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

/** A page of members: the API pages them (1..100, default 50). */
const MEMBERS_PAGE = 50;

/**
 * The organization's current members (active and suspended), oldest first, page by
 * page (SF-112 `GET …/members`, every role may read them). Names are the short
 * account names; never an email. Keyed by the organization, so another
 * organization's list can't land here.
 */
export function useSponsorMembers(sponsorId: string) {
  return useInfiniteQuery({
    queryKey: [...getListSponsorMembersQueryKey(sponsorId), "pages"],
    queryFn: ({ pageParam, signal }) =>
      callWithSession((init) =>
        listSponsorMembers(
          sponsorId,
          { limit: MEMBERS_PAGE, ...(pageParam === null ? {} : { cursor: pageParam }) },
          { ...init, signal },
        ),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last: SponsorMemberListResponse) => last.next_cursor,
    staleTime: 0,
  });
}

/**
 * The organization's business contacts (SF-112 `GET …/contacts`), for owners and
 * managers only (`view_contacts`). Requested only while `enabled`, i.e. when the
 * viewer's membership reports that permission; the backend checks it again and
 * answers 403 otherwise. A contact is not an account or a member.
 */
export function useSponsorContacts(sponsorId: string, enabled: boolean) {
  return useQuery({
    queryKey: getListSponsorContactsQueryKey(sponsorId),
    queryFn: async ({ signal }) =>
      (await callWithSession((init) => listSponsorContacts(sponsorId, { ...init, signal })))
        .contacts,
    enabled,
    staleTime: 0,
  });
}
