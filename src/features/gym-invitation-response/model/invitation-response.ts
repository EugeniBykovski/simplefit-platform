import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { gymBookingKey } from "@/entities/gym-booking";
import { callWithSession } from "@/entities/session";
import {
  acceptGymInvitation,
  declineGymInvitation,
  previewGymInvitation,
  resolveGymInvitation,
} from "@/shared/api/generated/endpoints/gym-members/gym-members";
import type {
  GymInvitationAcceptResponse,
  GymInvitationPreviewResponsePreview,
  MyGymInvitation,
} from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";

/**
 * Answering a gym member invitation (SF-95) with the token of the E07 link.
 * The backend owns every rule: whether the token is current, who may answer
 * (a verified email identity of the invited address), the prerequisites
 * (account registration), and the membership it creates in one transaction.
 * This client previews, reads the recipient's own view, submits the explicit
 * choice and reports the answer. The token travels only in request bodies and
 * is never part of a query key.
 */
export type GymInvitationPreviewView = GymInvitationPreviewResponsePreview;
export type GymInvitationView = MyGymInvitation;

/**
 * The outcome of a failed request, from the status and code only:
 *
 * - `unavailable` (410): no usable invitation for this viewer; every unusable
 *   token of someone else answers the same.
 * - `mismatch` (403): a current invitation of another address.
 * - `registration` (422): account registration comes first.
 * - `alreadyMember` (409): the viewer is already an active member of this gym.
 * - `limited` (429), `session` (401).
 * - `failed`: the connection dropped or the server failed. An answer may or may
 *   not have been applied, so the page reads the invitation again.
 */
export type GymInvitationProblem =
  "unavailable" | "mismatch" | "registration" | "alreadyMember" | "limited" | "session" | "failed";

export function gymInvitationProblem(error: unknown): GymInvitationProblem {
  if (!isApiError(error)) return "failed";
  if (error.status === 410 || error.status === 404) return "unavailable";
  if (error.status === 403 && error.code === "invitation_recipient_mismatch") return "mismatch";
  if (error.status === 422 && error.fieldCodes["account_registration"]) return "registration";
  if (error.status === 409 && error.details["gym_member"] === "already_active") {
    return "alreadyMember";
  }
  if (error.status === 429) return "limited";
  if (error.status === 401) return "session";
  return "failed";
}

const KEY = "gym-invitation";

/** `previewGymInvitation`: anonymous, read once per page. It changes nothing. */
export function useGymInvitationPreview(token: string, { enabled = true } = {}) {
  return useQuery({
    queryKey: [KEY, "preview"],
    queryFn: ({ signal }) => previewGymInvitation({ token }, { signal }),
    select: (answer) => answer.preview,
    enabled,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

/**
 * `resolveGymInvitation`: the signed-in recipient's own view, in any status,
 * read again on focus (revoked or expired meanwhile). It changes nothing.
 */
export function useGymInvitationRecipient(token: string, viewer: string, { enabled = true } = {}) {
  return useQuery({
    // Named by the viewer: another account never sees this answer.
    queryKey: [KEY, "recipient", viewer],
    queryFn: ({ signal }) =>
      callWithSession((init) => resolveGymInvitation({ token }, { ...init, signal })),
    select: (answer) => answer.invitation,
    enabled,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });
}

/**
 * Accept and decline. Nothing is shown as done before the backend answers. An
 * answer refreshes the viewer's memberships and classes before the page leaves,
 * so they read the new state.
 */
export function useGymInvitationAnswer(token: string) {
  const client = useQueryClient();

  const accept = useMutation({
    mutationFn: (): Promise<GymInvitationAcceptResponse> =>
      callWithSession((init) => acceptGymInvitation({ token }, init)),
    onSuccess: () => client.invalidateQueries({ queryKey: gymBookingKey }),
    gcTime: 0,
  });

  const decline = useMutation({
    mutationFn: () => callWithSession((init) => declineGymInvitation({ token }, init)),
    onSuccess: () => client.invalidateQueries({ queryKey: gymBookingKey }),
    gcTime: 0,
  });

  return { accept, decline };
}
