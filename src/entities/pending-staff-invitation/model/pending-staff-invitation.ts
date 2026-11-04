/**
 * The staff invitation this tab is answering (SF-133): the one-time token of
 * the E06 link (`/invite/staff#token=…`, SF-93), held exactly as a coach
 * invitation's (`createPendingInvitationToken`) under its own key and shape.
 * Sign-in, registration and account registration continue back to the page
 * with the token-free `returnTo=/invite/staff`.
 */
import {
  createPendingInvitationToken,
  type PendingInvitation,
} from "@/shared/lib/pending-invitation-token";

export type { PendingInvitation };

/** SF-93 invitation tokens: `sfs_` and 43 URL-safe base64 characters. */
const pending = createPendingInvitationToken({
  key: "simplefit.staff-invitation",
  token: /^sfs_[A-Za-z0-9_-]{43}$/,
});

export const isStaffInvitationToken = pending.isToken;
export const pendingStaffInvitation = pending.store;
export const usePendingStaffInvitation = pending.usePendingToken;
export const resetPendingStaffInvitationForTests = pending.resetForTests;
