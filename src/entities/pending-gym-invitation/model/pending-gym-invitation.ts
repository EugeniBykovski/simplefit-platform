/**
 * The member invitation this tab is answering (SF-134): the one-time token of
 * the E07 link (`/invite/gym#token=…`, SF-95), held exactly as a staff or coach
 * invitation's (`createPendingInvitationToken`) under its own key and shape.
 * Sign-in, registration and account registration continue back to the page
 * with the token-free `returnTo=/invite/gym`.
 */
import {
  createPendingInvitationToken,
  type PendingInvitation,
} from "@/shared/lib/pending-invitation-token";

export type { PendingInvitation };

/** SF-95 invitation tokens: `sgm_` and 43 URL-safe base64 characters. */
const pending = createPendingInvitationToken({
  key: "simplefit.gym-invitation",
  token: /^sgm_[A-Za-z0-9_-]{43}$/,
});

export const isGymInvitationToken = pending.isToken;
export const pendingGymInvitation = pending.store;
export const usePendingGymInvitation = pending.usePendingToken;
export const resetPendingGymInvitationForTests = pending.resetForTests;
