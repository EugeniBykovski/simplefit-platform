import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { callWithSession } from "@/entities/session";
import {
  completeGymFirstRun,
  dismissGymFirstRun,
  getGetGymFirstRunQueryKey,
  getGymFirstRun,
  startGymFirstRun,
} from "@/shared/api/generated/endpoints/gyms/gyms";
import type {
  GymChecklistItem as GymChecklistItemModel,
  GymChecklistItemKey,
  GymChecklistItemStatus,
  GymFirstRun as GymFirstRunModel,
  GymFirstRunStatus,
} from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";

/**
 * The owner's first run at one gym and the gym's setup checklist (SF-90;
 * simplefit-api ADR 0026, SF-90 amendment): `GET /api/v1/gyms/{gym_id}/first-run`.
 *
 * - One state per gym and owner, the same on every client: a tour started on
 *   the phone is "in progress" here. The cache only ever holds the backend's
 *   latest answer for that gym (one query key per gym id), nothing is kept in
 *   browser storage, and nothing is written optimistically.
 * - `completed` and `dismissed` are final; the backend never reopens them.
 * - The checklist is the backend's projection of the gym's own records: the
 *   client renders it and never sets it. Finishing or skipping the
 *   introduction changes no item.
 * - Owner only (`manage_first_run`): callers ask for it only when the viewer's
 *   permission projection holds it; other staff get 403 and never call.
 */
export type GymFirstRun = GymFirstRunModel;
export type GymFirstRunState = GymFirstRunStatus;
export type GymChecklistItem = GymChecklistItemModel;
export type GymChecklistKey = GymChecklistItemKey;
export type GymChecklistState = GymChecklistItemStatus;
export type GymFirstRunAction = "start" | "complete" | "dismiss";

/** The permission that opens the first run (owner only, SF-90). */
export const FIRST_RUN_PERMISSION = "manage_first_run";

/** The canonical checklist keys, in display order (SF-82 C7). */
export const CHECKLIST_KEYS: readonly GymChecklistKey[] = [
  "create_gym",
  "add_class",
  "invite_staff",
  "invite_members",
  "first_check_in",
];

export const gymFirstRunQueryKey = (gymId: string) => getGetGymFirstRunQueryKey(gymId);

/** `GET /api/v1/gyms/{gym_id}/first-run`. */
export async function fetchGymFirstRun(gymId: string, signal?: AbortSignal): Promise<GymFirstRun> {
  const { first_run } = await callWithSession((init) => getGymFirstRun(gymId, { ...init, signal }));
  return first_run;
}

/**
 * The first run of one gym, for its owner (`enabled` only with the
 * permission). Re-read when the window regains focus, so an introduction
 * started, finished or skipped on another device or tab is picked up.
 */
export function useGymFirstRun(gymId: string, enabled: boolean) {
  return useQuery({
    queryKey: gymFirstRunQueryKey(gymId),
    queryFn: ({ signal }) => fetchGymFirstRun(gymId, signal),
    enabled,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

const CALLS = {
  start: startGymFirstRun,
  complete: completeGymFirstRun,
  dismiss: dismissGymFirstRun,
} as const;

/** The other outcome is already kept (`409 conflict`, `details.first_run`). */
export function isFirstRunConflict(error: unknown): boolean {
  return isApiError(error) && error.status === 409 && "first_run" in error.details;
}

/**
 * Explicit transitions (`POST …/first-run/start|complete|dismiss`, empty
 * body). Each resolves with the backend's kept state, which becomes the cache
 * entry of that gym; repeating one is safe (the backend returns the same
 * state). A `409` (the other outcome was kept elsewhere) re-reads the state
 * and rejects, so the caller shows what the server kept, never a guess.
 */
export function useGymFirstRunActions(gymId: string) {
  const client = useQueryClient();
  return useCallback(
    async (action: GymFirstRunAction): Promise<GymFirstRun> => {
      try {
        const { first_run } = await callWithSession((init) => CALLS[action](gymId, {}, init));
        if (first_run.gym_id === gymId) client.setQueryData(gymFirstRunQueryKey(gymId), first_run);
        return first_run;
      } catch (error) {
        if (isFirstRunConflict(error)) {
          await client.invalidateQueries({ queryKey: gymFirstRunQueryKey(gymId) });
        }
        throw error;
      }
    },
    [client, gymId],
  );
}
