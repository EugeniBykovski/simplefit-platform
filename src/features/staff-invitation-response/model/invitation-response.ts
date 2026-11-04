import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { callWithSession } from "@/entities/session";
import { getResolveMyEntryQueryKey } from "@/shared/api/generated/endpoints/entry/entry";
import {
  acceptStaffInvitation,
  declineStaffInvitation,
  previewStaffInvitation,
  resolveStaffInvitation,
} from "@/shared/api/generated/endpoints/gym-staff/gym-staff";
import { getListMyGymsQueryKey } from "@/shared/api/generated/endpoints/gyms/gyms";
import type {
  MyStaffInvitation,
  StaffInvitationAcceptResponse,
  StaffInvitationPreview,
} from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";

/**
 * Answering a gym staff invitation (SF-93) with the token of the E06 link.
 * The backend owns every rule: whether the token is current, who may answer
 * (a verified email identity of the invited address), the prerequisites
 * (account registration), and the membership it creates in one transaction.
 * This client previews, reads the recipient's own view, submits the explicit
 * choice and reports the answer. The token travels only in request bodies and
 * is never part of a query key.
 */
export type StaffPreview = StaffInvitationPreview;
export type StaffRecipientView = MyStaffInvitation;

/**
 * The outcome of a failed request, from the status and code only:
 *
 * - `unavailable` (410): no usable invitation for this viewer; every unusable
 *   token of someone else answers the same.
 * - `mismatch` (403): a current invitation of another address.
 * - `registration` (422): account registration comes first.
 * - `alreadyStaff` (409): the viewer already works at this gym.
 * - `limited` (429), `session` (401).
 * - `failed`: the connection dropped or the server failed. An answer may or may
 *   not have been applied, so the page reads the invitation again.
 */
export type StaffInvitationProblem =
  "unavailable" | "mismatch" | "registration" | "alreadyStaff" | "limited" | "session" | "failed";

export function staffInvitationProblem(error: unknown): StaffInvitationProblem {
  if (!isApiError(error)) return "failed";
  if (error.status === 410 || error.status === 404) return "unavailable";
  if (error.status === 403 && error.code === "invitation_recipient_mismatch") return "mismatch";
  if (error.status === 422 && error.fieldCodes["account_registration"]) return "registration";
  if (error.status === 409 && error.details["staff_membership"] === "already_active") {
    return "alreadyStaff";
  }
  if (error.status === 429) return "limited";
  if (error.status === 401) return "session";
  return "failed";
}

const KEY = "staff-invitation";

/** `previewStaffInvitation`: anonymous, read once per page. It changes nothing. */
export function useStaffInvitationPreview(token: string, { enabled = true } = {}) {
  return useQuery({
    queryKey: [KEY, "preview"],
    queryFn: ({ signal }) => previewStaffInvitation({ token }, { signal }),
    select: (answer) => answer.preview,
    enabled,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

/**
 * `resolveStaffInvitation`: the signed-in recipient's own view, in any status,
 * read again on focus (revoked or expired meanwhile). It changes nothing.
 */
export function useStaffInvitationRecipient(
  token: string,
  viewer: string,
  { enabled = true } = {},
) {
  return useQuery({
    // Named by the viewer: another account never sees this answer.
    queryKey: [KEY, "recipient", viewer],
    queryFn: ({ signal }) =>
      callWithSession((init) => resolveStaffInvitation({ token }, { ...init, signal })),
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
 * acceptance refreshes the viewer's entry and gym list before the page leaves
 * for the console, so its gate reads the new membership.
 */
export function useStaffInvitationAnswer(token: string) {
  const client = useQueryClient();

  const accept = useMutation({
    mutationFn: (): Promise<StaffInvitationAcceptResponse> =>
      callWithSession((init) => acceptStaffInvitation({ token }, init)),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: getResolveMyEntryQueryKey() }),
        client.invalidateQueries({ queryKey: getListMyGymsQueryKey() }),
      ]),
  });

  const decline = useMutation({
    mutationFn: () => callWithSession((init) => declineStaffInvitation({ token }, init)),
  });

  return { accept, decline };
}
