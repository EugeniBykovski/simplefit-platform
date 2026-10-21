"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { callWithSession, SessionChangedError } from "@/entities/session";
import {
  myTrainingSessionKey,
  myTrainingSessionsRootKey,
  type MyTrainingSession,
} from "@/entities/training-session";
import { completeMyTrainingSession } from "@/shared/api/generated/endpoints/training/training";
import { isApiError } from "@/shared/api/http/api-error";

/**
 * What the backend answered to the fighter's completion (SF-63,
 * `POST /api/v1/me/training-sessions/{id}/complete`, no body: the server
 * sets `completed_at`):
 * - `completed`: its `200` with the completed session. A repeat (the answer
 *   to an earlier request was lost) returns the same session with its
 *   original `completed_at`: no second result, no conflict.
 * - `notStarted`: `409 starts_at: not_started`. The backend's clock decides,
 *   never the browser's.
 * - `cancelled`: `409 status: cancelled` (cancelled meanwhile).
 * - `unavailable`: `404` (not the fighter's, unknown, or no fighter profile).
 * Anything else (offline, a lost answer, a server error) is thrown: the
 * outcome is unknown and only the backend's state is shown afterwards.
 */
export type CompleteOutcome =
  | { kind: "completed"; session: MyTrainingSession }
  | { kind: "notStarted" }
  | { kind: "cancelled" }
  | { kind: "unavailable" };

/** Whether a failed completion may have been stored anyway (no answer, or a server error). */
const uncertain = (error: unknown) =>
  !(error instanceof SessionChangedError) && (!isApiError(error) || error.status >= 500);

export function useCompleteTrainingSession(sessionId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<CompleteOutcome> => {
      try {
        const response = await callWithSession((init) =>
          completeMyTrainingSession(sessionId, init),
        );
        return { kind: "completed", session: response.training_session };
      } catch (error) {
        if (isApiError(error) && error.status === 404) return { kind: "unavailable" };
        if (isApiError(error) && error.status === 409) {
          if (error.details["starts_at"] !== undefined) return { kind: "notStarted" };
          if (error.details["status"] !== undefined) return { kind: "cancelled" };
        }
        throw error;
      }
    },
    onSuccess: async (outcome) => {
      if (outcome.kind === "completed")
        client.setQueryData(myTrainingSessionKey(sessionId), outcome.session);
      // The session changed or is gone: read it again from the backend.
      else await client.invalidateQueries({ queryKey: myTrainingSessionKey(sessionId) });
      await client.invalidateQueries({ queryKey: myTrainingSessionsRootKey });
    },
    onError: async (error) => {
      // It may have been stored: the cached session and lists are marked stale
      // and read again on the next focus, visit or retry. Not at once: while
      // the connection is down that read fails too, and the dialog's "may
      // already be saved" must stay on screen over the session it describes.
      if (!uncertain(error)) return;
      await client.invalidateQueries({
        queryKey: myTrainingSessionKey(sessionId),
        refetchType: "none",
      });
      await client.invalidateQueries({ queryKey: myTrainingSessionsRootKey, refetchType: "none" });
    },
  });
}
