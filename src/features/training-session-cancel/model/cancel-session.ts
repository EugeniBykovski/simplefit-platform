"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { callWithSession } from "@/entities/session";
import {
  coachTrainingSessionKey,
  coachTrainingSessionsRootKey,
  type CoachTrainingSession,
} from "@/entities/training-session";
import { cancelMyCoachTrainingSession } from "@/shared/api/generated/endpoints/training/training";
import { isApiError } from "@/shared/api/http/api-error";

/**
 * What the backend answered to cancelling a session (SF-62):
 * `cancelled` is its `200` with the cancelled session (a repeat returns it
 * unchanged). `changed` is its `409`: the fighter completed it meanwhile, so
 * it can no longer be cancelled. `unavailable` is its `404`: the session is
 * not one this coach can reach any more. Only `cancelled` is reported as
 * cancelled.
 */
export type CancelOutcome =
  | { kind: "cancelled"; session: CoachTrainingSession }
  | { kind: "changed" }
  | { kind: "unavailable" };

/**
 * Cancels one planned session. Whatever the backend answered, the cached
 * session and every list are refreshed from it; nothing is shown as
 * cancelled before the answer.
 */
export function useCancelTrainingSession(sessionId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<CancelOutcome> => {
      try {
        const response = await callWithSession((init) =>
          cancelMyCoachTrainingSession(sessionId, init),
        );
        return { kind: "cancelled", session: response.training_session };
      } catch (error) {
        if (isApiError(error) && error.status === 409) return { kind: "changed" };
        if (isApiError(error) && error.status === 404) return { kind: "unavailable" };
        throw error;
      }
    },
    onSuccess: async (outcome) => {
      if (outcome.kind === "cancelled")
        client.setQueryData(coachTrainingSessionKey(sessionId), outcome.session);
      else await client.invalidateQueries({ queryKey: coachTrainingSessionKey(sessionId) });
      await client.invalidateQueries({ queryKey: coachTrainingSessionsRootKey });
    },
  });
}
