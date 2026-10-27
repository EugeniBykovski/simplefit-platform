import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { callWithSession } from "@/entities/session";
import {
  getGetGymQueryKey,
  getGym,
  getListMyGymsQueryKey,
  listMyGyms,
} from "@/shared/api/generated/endpoints/gyms/gyms";
import type {
  Gym as GymModel,
  GymList,
  GymLocation,
  GymSummary as GymSummaryModel,
  GymViewerRole,
} from "@/shared/api/generated/model";

/**
 * A gym workspace as one of its active staff sees it (SF-83
 * `GET /api/v1/gyms/{gym_id}`): the gym, its locations and the viewer's own
 * staff membership there (role and a read-only permission projection). The
 * gym id is only the lookup key: the backend authorizes every read for that
 * gym, so an unknown, foreign or revoked gym answers 404 and nothing of it
 * reaches the cache. Nothing is kept in browser storage; the session
 * boundary clears the cache.
 */
export type Gym = GymModel;
export type GymSummary = GymSummaryModel;
export type GymRole = GymViewerRole;
export type { GymLocation };

/** The cache key of one gym: always the gym named by the caller, never "the current gym". */
export const gymQueryKey = (gymId: string) => getGetGymQueryKey(gymId);

/** `GET /api/v1/gyms/{gym_id}`. */
export async function fetchGym(gymId: string, signal?: AbortSignal): Promise<Gym> {
  const { gym } = await callWithSession((init) => getGym(gymId, { ...init, signal }));
  return gym;
}

/**
 * One gym, read for the console of that gym. Re-read whenever the page
 * regains focus, so a membership revoked meanwhile shows as not found
 * instead of stale content. A query per gym id: switching to another gym
 * never shows the previous gym's data while the next one loads, and a late
 * answer for one gym can only land under its own key.
 */
export function useGym(gymId: string) {
  return useQuery({
    queryKey: gymQueryKey(gymId),
    queryFn: ({ signal }) => fetchGym(gymId, signal),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/** The primary location: the API lists non-archived locations, primary first. */
export function primaryLocation(gym: Pick<Gym, "locations">): GymLocation | null {
  return gym.locations.find((location) => location.is_primary) ?? null;
}

/** A page of the chooser's extra gyms: the entry lists 25, `listMyGyms` the rest. */
const PAGE = 50;

/**
 * Every gym workspace of the viewer, page by page (SF-83
 * `GET /api/v1/me/gyms`, newest membership first), for a chooser whose entry
 * reported more workspaces than it lists. Only while `enabled`.
 */
export function useMyGymPages(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...getListMyGymsQueryKey(), "pages"],
    queryFn: ({ pageParam, signal }) =>
      callWithSession((init) =>
        listMyGyms(
          { limit: PAGE, ...(pageParam === null ? {} : { cursor: pageParam }) },
          { ...init, signal },
        ),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last: GymList) => last.next_cursor,
    enabled,
    staleTime: 0,
  });
}
