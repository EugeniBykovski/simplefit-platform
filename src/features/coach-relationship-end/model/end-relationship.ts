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
 * Ends one of the coach's relationships (`POST …/end`, SF-56). The backend
 * is idempotent; a relationship already ended or no longer the coach's
 * (`404`) counts as ended too, so the coach never keeps seeing it. Only after
 * the backend has answered is the cached detail (the fighter's disclosed
 * fields) dropped and every roster list refetched: nothing is removed or
 * shown as ended before that.
 */
export function useEndCoachRelationship() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (relationshipId: string) => {
      try {
        await callWithSession((init) => endMyCoachFighterRelationship(relationshipId, init));
      } catch (error) {
        if (!(isApiError(error) && error.status === 404)) throw error;
      }
      return relationshipId;
    },
    onSuccess: async (relationshipId) => {
      client.removeQueries({ queryKey: getGetMyCoachFighterQueryKey(relationshipId) });
      await client.invalidateQueries({ queryKey: coachRelationshipsRootKey });
    },
  });
}
