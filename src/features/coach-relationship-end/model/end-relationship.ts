"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { coachRelationshipsRootKey } from "@/entities/coach-relationship";
import { callWithSession } from "@/entities/session";
import {
  endMyCoachFighterRelationship,
  getGetMyCoachFighterQueryKey,
} from "@/shared/api/generated/endpoints/coaching/coaching";
import { isApiError } from "@/shared/api/http/api-error";

/**
 * What the backend answered to ending a relationship (`POST …/end`, SF-56):
 * `ended` is its `204`, the confirmation that the relationship is ended.
 * `unavailable` is its `404`: the relationship is not one this coach can
 * reach any more (already ended, by either side, or never theirs). It proves
 * nothing about this request, so it is never reported as "ended".
 */
export type EndOutcome = "ended" | "unavailable";

/**
 * Ends one of the coach's relationships. Either answer means the coach must
 * no longer see the fighter: only after the backend has answered is the
 * cached detail (the fighter's disclosed fields) dropped and every roster
 * list refetched. Nothing is removed or shown as ended before that.
 */
export function useEndCoachRelationship() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (relationshipId: string): Promise<EndOutcome> => {
      try {
        await callWithSession((init) => endMyCoachFighterRelationship(relationshipId, init));
        return "ended";
      } catch (error) {
        if (isApiError(error) && error.status === 404) return "unavailable";
        throw error;
      }
    },
    onSuccess: async (_outcome, relationshipId) => {
      client.removeQueries({ queryKey: getGetMyCoachFighterQueryKey(relationshipId) });
      await client.invalidateQueries({ queryKey: coachRelationshipsRootKey });
    },
  });
}
