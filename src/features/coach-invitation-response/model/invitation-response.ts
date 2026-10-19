import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { myCoachesRootKey } from "@/entities/my-coach";
import { callWithSession } from "@/entities/session";
import {
  acceptCoachInvitation,
  declineCoachInvitation,
  previewCoachInvitation,
} from "@/shared/api/generated/endpoints/coaching/coaching";
import type {
  CoachInvitationAcceptRequestDocumentLanguage,
  CoachInvitationAcceptResponse,
  CoachInvitationPreview,
} from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";

/**
 * Answering a coach invitation (SF-57) with the token of the E08 link. The
 * backend owns every rule: whether the token is current, who may answer
 * (a verified email identity of the invited address), the prerequisites
 * (account registration, a completed fighter profile), the disclosure
 * version and its language, the fighter's age (18+, SF-72) and the
 * relationship it activates in one transaction. This client only previews
 * (asking for the disclosure text in the page language), submits the
 * fighter's explicit choice with the exact version and language shown, and
 * reports the answer. The token travels only in request bodies.
 */
export type InvitationPreview = CoachInvitationPreview;

/**
 * The outcome of a failed request, from the status and code only. Every
 * token that is not a current pending one answers the same `410`, and a
 * switched-off feature `404`: both are one "not available" outcome, so the
 * page never reveals more than the API does.
 */
export type ResponseProblem =
  "unavailable" | "mismatch" | "profile" | "tooYoung" | "stale" | "language" | "limited" | "failed";

export function responseProblem(error: unknown): ResponseProblem {
  if (!isApiError(error)) return "failed";
  if (error.status === 404 || error.status === 410) return "unavailable";
  if (error.status === 403 && error.code === "invitation_recipient_mismatch") return "mismatch";
  if (error.status === 409 && error.details["disclosure_version"] === "stale") return "stale";
  if (error.status === 409 && error.details["document_language"] === "unavailable") {
    return "language";
  }
  if (error.status === 422) {
    const codes = error.fieldCodes;
    if (codes["account_registration"] || codes["fighter_profile"]) return "profile";
    if (codes["coaching_age"]?.includes("too_young")) return "tooYoung";
  }
  if (error.status === 429) return "limited";
  return "failed";
}

/**
 * `POST /api/v1/coach-invitations/preview`: anonymous, read once per page and
 * language. The query key never contains the token.
 */
export function useInvitationPreview(token: string | undefined, language: string) {
  return useQuery({
    queryKey: ["coach-invitation-preview", language],
    queryFn: ({ signal }) => previewCoachInvitation({ token: token ?? "", language }, { signal }),
    enabled: token !== undefined,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

/**
 * Accept and decline. Nothing is shown as done before the backend answers;
 * the page records the outcome and then drops the token
 * (`pendingCoachInvitation.clear`), in that order.
 */
export function useInvitationResponse(token: string | undefined) {
  const client = useQueryClient();

  const accept = useMutation({
    mutationFn: ({
      version,
      language,
    }: {
      version: string;
      language: CoachInvitationAcceptRequestDocumentLanguage;
    }): Promise<CoachInvitationAcceptResponse> =>
      callWithSession((init) =>
        acceptCoachInvitation(
          { token: token ?? "", disclosure_version: version, document_language: language },
          init,
        ),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: myCoachesRootKey }),
  });

  const decline = useMutation({
    mutationFn: () =>
      callWithSession((init) => declineCoachInvitation({ token: token ?? "" }, init)),
  });

  return { accept, decline };
}
