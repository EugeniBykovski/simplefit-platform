"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { callWithSession } from "@/entities/session";
import {
  getGetMyCoachFighterQueryKey,
  getListMyCoachFightersQueryKey,
  getMyCoachFighter,
  listMyCoachFighters,
} from "@/shared/api/generated/endpoints/coaching/coaching";
import type {
  CoachFighterRelationship,
  ListMyCoachFightersStatus,
} from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";

/**
 * A coach's Coach–Fighter relationship as the backend projects it for the
 * coach (SF-56, ADR 0021 in simplefit-api): while `active`, only the fighter
 * fields of the disclosure the fighter accepted (C1 identity, C2 basic boxing
 * information; anything not disclosed is `null`); once `ended`, a stub with
 * the dates and the fighter's name at the end. The backend owns every status
 * and permission; nothing here derives one.
 */
export type CoachRelationship = CoachFighterRelationship;
export type CoachRelationshipStatus = ListMyCoachFightersStatus;

const PAGE_SIZE = 50;

/** The prefix of every roster list and relationship detail query (for invalidation). */
export const coachRelationshipsRootKey = getListMyCoachFightersQueryKey().slice(0, 1);
export const coachRelationshipRootKey = getGetMyCoachFighterQueryKey("").slice(0, 1);

/** The key of one roster list (`active` or `ended`), paged by cursor. */
export const coachRelationshipsKey = (status: CoachRelationshipStatus) =>
  [...getListMyCoachFightersQueryKey({ status }), "pages"] as const;

/**
 * The coach's relationships with `status`, newest first, one cursor page at a
 * time (`fetchNextPage` for the next one). Never retried on a client error:
 * `404` means Coach–Fighter sharing is not available (see `isUnavailable`).
 */
export function useCoachRelationships(status: CoachRelationshipStatus) {
  return useInfiniteQuery({
    queryKey: coachRelationshipsKey(status),
    queryFn: ({ pageParam, signal }) =>
      callWithSession((init) =>
        listMyCoachFighters(
          { status, limit: PAGE_SIZE, ...(pageParam === null ? {} : { cursor: pageParam }) },
          { ...init, signal },
        ),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/**
 * One active relationship of the coach. `404` covers an ended, unknown or
 * someone else's relationship alike (no existence oracle), and sharing being
 * unavailable.
 */
export function useCoachRelationship(relationshipId: string) {
  return useQuery({
    queryKey: getGetMyCoachFighterQueryKey(relationshipId),
    queryFn: ({ signal }) =>
      callWithSession((init) => getMyCoachFighter(relationshipId, { ...init, signal })).then(
        (response) => response.relationship,
      ),
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/** Whether the backend refused a coaching read as not available (`404 not_found`). */
export function isUnavailable(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}
