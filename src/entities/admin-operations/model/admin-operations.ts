import { useQuery } from "@tanstack/react-query";

import { callWithSession } from "@/entities/session";
import {
  getAdminJob,
  getAdminOperationsHealth,
  getGetAdminJobQueryKey,
  getGetAdminOperationsHealthQueryKey,
  getListAdminJobsQueryKey,
  listAdminJobs,
} from "@/shared/api/generated/endpoints/platform-operators/platform-operators";
import {
  ListAdminJobsState,
  ListAdminJobsWorker,
  type AdminJob,
  type AdminOperationsCheck,
  type AdminOperationsHealthResponseHealth,
  type ListAdminJobsParams,
} from "@/shared/api/generated/model";

/**
 * Operator operations (SF-126; simplefit-api `/api/v1/admin/operations`). Read only:
 * the backend measures every check and says when; nothing is inferred here. Health is
 * re-read every minute while the page is visible (TanStack Query pauses polling in the
 * background) and on demand; job queries are keyed by their exact filters and cursor.
 * Nothing is kept outside the query cache, which is dropped at every session boundary.
 */
export type OperationsHealth = AdminOperationsHealthResponseHealth;
export type OperationsCheck = AdminOperationsCheck;
export type OperationsJob = AdminJob;
export type JobFilters = Pick<ListAdminJobsParams, "state" | "queue" | "worker">;

export const JOB_STATES: readonly ListAdminJobsState[] = Object.values(ListAdminJobsState);
export const JOB_WORKERS: readonly ListAdminJobsWorker[] = Object.values(ListAdminJobsWorker);
export const JOB_PAGE_SIZE = 25;
export const HEALTH_POLL_MS = 60_000;

export function useOperationsHealth() {
  return useQuery({
    queryKey: getGetAdminOperationsHealthQueryKey(),
    queryFn: ({ signal }) =>
      callWithSession((init) => getAdminOperationsHealth({ ...init, signal })).then(
        (answer) => answer.health,
      ),
    retry: false,
    staleTime: 0,
    refetchInterval: HEALTH_POLL_MS,
    refetchOnWindowFocus: true,
  });
}

export function useJobs(filters: JobFilters, cursor: string | undefined, enabled: boolean) {
  const params: ListAdminJobsParams = { ...filters, limit: JOB_PAGE_SIZE, cursor };
  return useQuery({
    queryKey: getListAdminJobsQueryKey(params),
    queryFn: ({ signal }) => callWithSession((init) => listAdminJobs(params, { ...init, signal })),
    enabled,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useJob(id: number | null) {
  return useQuery({
    queryKey: getGetAdminJobQueryKey(id ?? 0),
    queryFn: ({ signal }) =>
      callWithSession((init) => getAdminJob(id ?? 0, { ...init, signal })).then(
        (answer) => answer.job,
      ),
    enabled: id !== null,
    retry: false,
    staleTime: 0,
  });
}
