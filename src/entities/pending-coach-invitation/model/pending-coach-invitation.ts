/**
 * The coach invitation this tab is answering (SF-60): the one-time token of
 * the E08 link (`/invite/coach#token=…`, SF-57).
 *
 * The token is a secret. It arrives only in the URL fragment, which never
 * reaches a server; the invitation page reads it once, removes the fragment
 * from the address bar and history, and keeps it here: in this tab's
 * `sessionStorage` (memory when storage is unavailable), never in a URL,
 * `returnTo`, query key, log or `localStorage`. It is sent only in the body
 * of the SF-57 requests.
 *
 * It belongs to one person. A token taken while signed out is bound to the
 * first viewer who signs in (sign-in, account registration and Fighter
 * onboarding continue back to the page with the token-free
 * `returnTo=/invite/coach`); once bound, any session boundary (sign-out,
 * expiry, another account) drops it, so a later user of the tab never
 * inherits it. It also expires after an hour in the tab, and is dropped on
 * every final outcome (accepted, declined, unavailable). The backend still
 * checks the recipient on every response: holding the link proves nothing.
 */
import {
  createPendingInvitationToken,
  type PendingInvitation,
} from "@/shared/lib/pending-invitation-token";

export type { PendingInvitation };

/** SF-57 invitation tokens: `sfi_` and 43 URL-safe base64 characters. */
const pending = createPendingInvitationToken({
  key: "simplefit.coach-invitation",
  token: /^sfi_[A-Za-z0-9_-]{43}$/,
});

/** Whether `value` has the shape of an SF-57 invitation token (it is never altered). */
export const isInvitationToken = pending.isToken;

export const pendingCoachInvitation = pending.store;

/**
 * The token `viewer` may answer on the invitation page: `undefined` until the
 * link is read and the session known (`viewer === undefined`), `null` when
 * there is none for them, else the token.
 */
export const usePendingCoachInvitation = pending.usePendingToken;

/** Test seam. */
export const resetPendingCoachInvitationForTests = pending.resetForTests;
