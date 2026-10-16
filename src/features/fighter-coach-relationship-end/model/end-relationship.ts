import { useMutation, useQueryClient } from "@tanstack/react-query";

import { myCoachesRootKey } from "@/entities/my-coach";
import { callWithSession } from "@/entities/session";
import { endMyCoachRelationship } from "@/shared/api/generated/endpoints/coaching/coaching";
import { isApiError } from "@/shared/api/http/api-error";

/**
 * What the backend answered to ending a relationship (`POST
 * /api/v1/me/coaches/{id}/end`, SF-56). `ended` is its `204` (idempotent: an
 * already ended one of the viewer's answers `204` too). `unavailable` is its
 * `404`: not a relationship this fighter can reach; it proves nothing about
 * this request and is never reported as "ended".
 */
export type EndOutcome = "ended" | "unavailable";

/**
 * Ends one of the fighter's relationships: only this id is sent, so other
 * coaches are untouched. Nothing is removed or shown as ended before the
 * backend answers; either answer then refetches every list.
 */
export function useEndMyCoach() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (relationshipId: string): Promise<EndOutcome> => {
      try {
        await callWithSession((init) => endMyCoachRelationship(relationshipId, init));
        return "ended";
      } catch (error) {
        if (isApiError(error) && error.status === 404) return "unavailable";
        throw error;
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: myCoachesRootKey }),
  });
}
