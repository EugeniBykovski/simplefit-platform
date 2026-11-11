import { useQuery } from "@tanstack/react-query";

import { callWithSession } from "@/entities/session";
import {
  getAdminCoach,
  getAdminFighter,
  getAdminGym,
  getGetAdminCoachQueryKey,
  getGetAdminFighterQueryKey,
  getGetAdminGymQueryKey,
  getListAdminGymsQueryKey,
  getSearchAdminCoachesQueryKey,
  getSearchAdminFightersQueryKey,
  listAdminGyms,
  searchAdminCoaches,
  searchAdminFighters,
} from "@/shared/api/generated/endpoints/platform-operators/platform-operators";
import {
  GetAdminGymReasonCode,
  ListAdminGymsLifecycle,
  ListAdminGymsVerification,
  type AdminCoach,
  type AdminCoachSummary,
  type AdminFighter,
  type AdminFighterSummary,
  type AdminGym,
  type AdminGymListResponse,
  type ListAdminGymsParams,
} from "@/shared/api/generated/model";

/**
 * Operator oversight of gyms, coaches and fighters (SF-123; simplefit-api
 * `/api/v1/admin/gyms|coaches|fighters`). Read-only: the backend decides who may read
 * which domain (`gyms.read`, `coaches.read`, `fighters.read`), what each projection
 * holds (counts, never member names, training, health or messages) and records every
 * read. Nothing is kept outside the query cache, which is dropped at every session
 * boundary (SF-28); every query is keyed by its exact filters, id and reason, so a
 * late answer to an older query never fills a newer one.
 */
export type OversightGym = AdminGym;
export type OversightGymPage = AdminGymListResponse;
export type OversightCoach = AdminCoach;
export type OversightCoachSummary = AdminCoachSummary;
export type OversightFighter = AdminFighter;
export type OversightFighterSummary = AdminFighterSummary;
export type OversightReason = GetAdminGymReasonCode;
export type ProfileKind = "coach" | "fighter";

/** The read reasons the backend accepts (the same list for every oversight read). */
export const OVERSIGHT_REASONS: readonly OversightReason[] = Object.values(GetAdminGymReasonCode);
export const GYM_LIFECYCLES: readonly ListAdminGymsLifecycle[] =
  Object.values(ListAdminGymsLifecycle);
export const GYM_VERIFICATIONS: readonly ListAdminGymsVerification[] =
  Object.values(ListAdminGymsVerification);

export type GymFilters = {
  query?: string;
  lifecycle?: ListAdminGymsLifecycle;
  verification?: ListAdminGymsVerification;
  country?: string;
};

export const GYM_PAGE_SIZE = 25;

const read = { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } as const;

/** One page of gyms for `filters`, after `cursor` (`undefined`: the first page). */
export function useGymPage(filters: GymFilters, cursor: string | undefined) {
  const params: ListAdminGymsParams = { ...filters, limit: GYM_PAGE_SIZE, cursor };
  return useQuery({
    queryKey: getListAdminGymsQueryKey(params),
    queryFn: ({ signal }) => callWithSession((init) => listAdminGyms(params, { ...init, signal })),
    ...read,
  });
}

/** One gym, read with `reason` (recorded by the backend each time it's read). */
export function useGym(id: string, reason: OversightReason | null) {
  return useQuery({
    queryKey: getGetAdminGymQueryKey(id, { reason_code: reason ?? "support_request" }),
    queryFn: ({ signal }) =>
      callWithSession((init) =>
        getAdminGym(id, { reason_code: reason ?? "support_request" }, { ...init, signal }),
      ).then((answer) => answer.gym),
    enabled: reason !== null,
    ...read,
  });
}

export type ProfileSearch = { query: string; reason: OversightReason };

/** Exact search for one coach or fighter. Runs only for a submitted query. */
export function useProfileSearch(kind: ProfileKind, search: ProfileSearch | null) {
  const params = {
    query: search?.query ?? "",
    reason_code: search?.reason ?? "support_request",
  } as const;
  return useQuery<OversightCoachSummary[] | OversightFighterSummary[]>({
    queryKey:
      kind === "coach"
        ? getSearchAdminCoachesQueryKey(params)
        : getSearchAdminFightersQueryKey(params),
    queryFn: ({ signal }) =>
      kind === "coach"
        ? callWithSession((init) => searchAdminCoaches(params, { ...init, signal })).then(
            (answer) => answer.coaches,
          )
        : callWithSession((init) => searchAdminFighters(params, { ...init, signal })).then(
            (answer) => answer.fighters,
          ),
    enabled: search !== null,
    ...read,
  });
}

/** One coach, read with `reason`; `null` waits. */
export function useCoach(id: string | null, reason: OversightReason) {
  return useQuery({
    queryKey: getGetAdminCoachQueryKey(id ?? "", { reason_code: reason }),
    queryFn: ({ signal }) =>
      callWithSession((init) =>
        getAdminCoach(id ?? "", { reason_code: reason }, { ...init, signal }),
      ).then((answer) => answer.coach),
    enabled: id !== null,
    ...read,
  });
}

/** One fighter, read with `reason`; `null` waits. */
export function useFighter(id: string | null, reason: OversightReason) {
  return useQuery({
    queryKey: getGetAdminFighterQueryKey(id ?? "", { reason_code: reason }),
    queryFn: ({ signal }) =>
      callWithSession((init) =>
        getAdminFighter(id ?? "", { reason_code: reason }, { ...init, signal }),
      ).then((answer) => answer.fighter),
    enabled: id !== null,
    ...read,
  });
}
