"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { coachInvitationsKey } from "@/entities/coach-invitation";
import { callWithSession } from "@/entities/session";
import {
  cancelMyCoachInvitation,
  resendMyCoachInvitation,
} from "@/shared/api/generated/endpoints/coaching/coaching";
import { isApiError } from "@/shared/api/http/api-error";

/** Why an invitation action did not happen, as the coach should be told. */
export type ActionProblem =
  | { kind: "cooldown"; seconds: number }
  | { kind: "noResends" }
  | { kind: "notPending" }
  | { kind: "failed" };

/** The backend's answer to a refused resend or cancel, in the coach's terms. */
export function actionProblem(error: unknown): ActionProblem {
  if (!isApiError(error)) return { kind: "failed" };
  if (error.code === "rate_limited") {
    return { kind: "cooldown", seconds: Math.max(1, error.retryAfterSeconds ?? 60) };
  }
  if (error.code === "conflict" && error.details["resends"] === "limit_reached") {
    return { kind: "noResends" };
  }
  // Answered, expired or gone meanwhile (another session, the fighter).
  if (error.code === "conflict" || error.status === 404) return { kind: "notPending" };
  return { kind: "failed" };
}

/**
 * Resend (new link, new expiry; the old link stops working) and cancel
 * (SF-57). The backend owns the lifecycle, the cooldown and the resend
 * limit; after any answer, success or refusal, the invitation list is
 * refetched so the coach sees the backend's state, never a guess.
 */
export function useInvitationActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: coachInvitationsKey });

  const resend = useMutation({
    mutationFn: (invitationId: string) =>
      callWithSession((init) => resendMyCoachInvitation(invitationId, init)),
    onSettled: refresh,
  });

  const cancel = useMutation({
    mutationFn: (invitationId: string) =>
      callWithSession((init) => cancelMyCoachInvitation(invitationId, init)),
    onSettled: refresh,
  });

  return { resend, cancel };
}
