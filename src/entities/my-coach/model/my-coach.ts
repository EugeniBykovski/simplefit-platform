import { useInfiniteQuery } from "@tanstack/react-query";

import { callWithSession } from "@/entities/session";
import {
  getListMyCoachesQueryKey,
  listMyCoaches,
} from "@/shared/api/generated/endpoints/coaching/coaching";
import type { MyCoachRelationship } from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";

/**
 * The signed-in fighter's coaching relationships (SF-56; simplefit-api ADR
 * 0021), seen from the fighter's side: each active coach's public identity
 * and the fields of the fighter's profile disclosed to them; for an ended one
 * only the coach's name at the end, the dates and who ended it. The backend
 * owns every relationship: nothing is kept in the browser, the list is read
 * fresh on every visit and when the window regains focus (an end on another
 * device is reconciled), and the cache is cleared at every session boundary
 * (SF-28).
 */
export type MyCoach = MyCoachRelationship;
export type MyCoachStatus = "active" | "ended";

const PAGE_SIZE = 50;

/** Every query of this entity: invalidated after an acceptance or an end. */
export const myCoachesRootKey = getListMyCoachesQueryKey().slice(0, 1);
export const myCoachesKey = (status: MyCoachStatus) =>
  [...getListMyCoachesQueryKey({ status }), "pages"] as const;

/** `404` from these endpoints: the viewer has no completed fighter profile. */
export const isUnavailable = (error: unknown) => isApiError(error) && error.status === 404;

/** `GET /api/v1/me/coaches?status=…`, page by page (`next_cursor`). */
export function useMyCoaches(status: MyCoachStatus) {
  return useInfiniteQuery({
    queryKey: myCoachesKey(status),
    queryFn: ({ pageParam, signal }) =>
      callWithSession((init) =>
        listMyCoaches(
          { status, limit: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) },
          { ...init, signal },
        ),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/** The coach's name as the fighter sees it: display name, else brand. */
export function coachName(coach: MyCoach["coach"]): string | null {
  return coach?.display_name ?? coach?.brand_name ?? null;
}
