import { useEffect, useSyncExternalStore } from "react";

import { getCurrentUser, logout, refreshSession } from "@/shared/api/generated/endpoints/auth/auth";
import type { CurrentUserResponseUser, SessionTokens } from "@/shared/api/generated/model";
import { ApiError, isApiError } from "@/shared/api/http/api-error";
import { openTabChannel, withTabLock, type TabChannel } from "@/shared/lib/cross-tab";

/**
 * The browser's SimpleFit session (ADR 0010 in simplefit-api, web transport).
 *
 * - The access token lives only in memory: this module's and, while a tab is
 *   open, the memory of the other tabs it is broadcast to. Never
 *   localStorage, sessionStorage, readable cookies or URLs. A reload loses
 *   it; the session is restored from the refresh cookie.
 * - The refresh token is an `HttpOnly` cookie set by the API
 *   (`Path=/api/auth`). Scripts never see it; requests that use it send
 *   `credentials: "include"` and the `x-simplefit-csrf: 1` header.
 * - Refresh tokens are single use with no grace period: a second use revokes
 *   the session. Refreshes are therefore serialized across every tab of the
 *   origin with a Web Lock, and a tab that waited for the lock first checks
 *   whether another tab already refreshed (ADR 0010: "the web app
 *   coordinates across tabs"). Without Web Locks only in-tab coalescing
 *   applies.
 * - Tabs broadcast new credentials and sign-out, so all tabs share one
 *   session state.
 * - A session is `authenticated` once `GET /api/me` resolved the viewer. A
 *   rejected credential (401) ends it; a network or server failure does not:
 *   the status is `unavailable`, credentials are kept and the restore can be
 *   retried.
 *
 * State is module-level and only ever changes in the browser (handlers and
 * effects); the server snapshot is always "loading".
 */
export type SessionStatus = "loading" | "authenticated" | "anonymous" | "unavailable";

/** The signed-in user as `GET /api/me` returns it: an id, never a role or workspace. */
export type Viewer = CurrentUserResponseUser;

/**
 * How a session that existed in this page ended (SF-28): `signed-out` by the
 * user (here or in another tab), `expired` when the API rejected its
 * credentials. Unset when there never was a session in this page.
 */
export type SessionEnd = "signed-out" | "expired";

export type Session = {
  status: SessionStatus;
  /** Set while `authenticated`. */
  viewer?: Viewer;
  /** Why the session is `unavailable` (network or server failure). */
  error?: unknown;
  /** Set while `anonymous` after a session ended in this page. */
  ended?: SessionEnd;
};

type Credentials = { accessToken: string; expiresAt: number };
type RefreshOutcome = "refreshed" | "rejected" | "unavailable" | "superseded";

/** Whether `signOut` reached the API (`revoked`) or only cleared this browser (`local`). */
export type SignOutOutcome = "revoked" | "local";

/** Options for requests that carry the refresh cookie (refresh, sign-in, logout). */
export const cookieTransport = {
  credentials: "include",
  headers: { "x-simplefit-csrf": "1" },
} as const satisfies RequestInit;

// Refresh shortly before expiry rather than sending a token about to lapse.
const EXPIRY_MARGIN_MS = 30_000;
const REFRESH_LOCK = "simplefit.session.refresh";
const CHANNEL = "simplefit.session";
// Not a credential: only that a logout of this browser did not reach the API.
const PENDING_SIGN_OUT = "simplefit.session.sign-out-pending";

let snapshot: Session = { status: "loading" };
let credentials: Credentials | undefined;
// Bumped whenever the credentials change, in this tab or from another one.
let generation = 0;
// Bumped whenever the signed-in identity may change (sign-in, sign-out,
// expiry): work started under an older epoch belongs to another session.
let epoch = 0;
let refreshing: Promise<RefreshOutcome> | undefined;
let restoring: Promise<SessionStatus> | undefined;
let channel: TabChannel | undefined;
// The failure of the last unavailable refresh, kept for the unavailable view.
let refreshFailure: unknown;
const listeners = new Set<() => void>();
const boundaryListeners = new Set<() => void>();

const SERVER_SNAPSHOT: Session = { status: "loading" };

function publish(next: Session) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Registers `listener` to run, synchronously, whenever the signed-in identity
 * changes or ends (SF-28): before the new state is published, so user-scoped
 * client state (the query cache) is gone before anything renders for the
 * next user. Returns the unsubscribe function.
 */
export function onSessionBoundary(listener: () => void): () => void {
  boundaryListeners.add(listener);
  return () => boundaryListeners.delete(listener);
}

function crossBoundary() {
  epoch += 1;
  for (const listener of boundaryListeners) listener();
}

/** The credentials when they are not about to expire. */
const freshCredentials = (): Credentials | undefined =>
  credentials !== undefined && credentials.expiresAt - EXPIRY_MARGIN_MS > Date.now()
    ? credentials
    : undefined;

function adopt(next: Credentials | undefined) {
  credentials = next;
  generation += 1;
}

function credentialsOf(
  tokens: Pick<SessionTokens, "access_token" | "access_token_expires_at">,
): Credentials {
  return {
    accessToken: tokens.access_token,
    expiresAt: Date.parse(tokens.access_token_expires_at),
  };
}

// ---------------------------------------------------------------------------
// Pending sign-out (a logout that did not reach the API)

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function signOutPending(): boolean {
  try {
    return storage()?.getItem(PENDING_SIGN_OUT) === "1";
  } catch {
    return false;
  }
}

function setSignOutPending(pending: boolean) {
  try {
    if (pending) storage()?.setItem(PENDING_SIGN_OUT, "1");
    else storage()?.removeItem(PENDING_SIGN_OUT);
  } catch {
    // Storage unavailable: the in-memory sign-out still holds for this page.
  }
}

/**
 * Asks the API to revoke the signed-out session, under the refresh lock so it
 * never overlaps a refresh in any tab. `owner` is the epoch the sign-out
 * started: when someone signed in since then (a new epoch), the cookie now
 * belongs to the new session, so the old one is revoked by its bearer token
 * alone and the cookie is not sent. Resolves whether the API confirmed it.
 */
async function revokeOnApi(accessToken: string | undefined, owner: number): Promise<boolean> {
  return withTabLock(REFRESH_LOCK, async () => {
    const sameIdentity = epoch === owner;
    if (!sameIdentity && accessToken === undefined) return false;
    const headers: Record<string, string> = { ...cookieTransport.headers };
    if (accessToken !== undefined) headers.Authorization = `Bearer ${accessToken}`;
    const init: RequestInit = sameIdentity
      ? { ...cookieTransport, headers }
      : { credentials: "omit", headers };
    try {
      await logout(undefined, init);
      if (sameIdentity) setSignOutPending(false);
      return true;
    } catch {
      // Offline, or the API failed: the cookie is still set. Remember it, so
      // no later page load refreshes with it, and retry on the next load.
      if (sameIdentity) setSignOutPending(true);
      return false;
    }
  });
}

// ---------------------------------------------------------------------------
// Cross-tab channel

type TabMessage =
  | { type: "credentials"; accessToken: string; expiresAt: number; signIn: boolean }
  | { type: "signed-out"; reason: SessionEnd };

function isTabMessage(value: unknown): value is TabMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  if (message.type === "signed-out") {
    return message.reason === "signed-out" || message.reason === "expired";
  }
  return (
    message.type === "credentials" &&
    typeof message.accessToken === "string" &&
    message.accessToken !== "" &&
    typeof message.expiresAt === "number" &&
    Number.isFinite(message.expiresAt) &&
    typeof message.signIn === "boolean"
  );
}

function onTabMessage(message: unknown) {
  if (!isTabMessage(message)) return;
  if (message.type === "signed-out") {
    end(message.reason);
    return;
  }
  const next = { accessToken: message.accessToken, expiresAt: message.expiresAt };
  if (message.signIn) {
    // Another tab signed in, possibly as someone else: this tab's identity is
    // unknown until it resolves the viewer of the new credentials.
    setSignOutPending(false);
    crossBoundary();
    adopt(next);
    publish({ status: "loading" });
    void loadViewer();
    return;
  }
  adopt(next);
  // Another tab refreshed: a tab still restoring enters too.
  if (snapshot.status !== "authenticated") void loadViewer();
}

function tabChannel(): TabChannel | undefined {
  if (typeof window === "undefined") return undefined;
  channel ??= openTabChannel(CHANNEL, onTabMessage);
  return channel;
}

function broadcast(message: TabMessage) {
  tabChannel()?.post(message);
}

// ---------------------------------------------------------------------------
// Lifecycle

/**
 * Clears the local session (credentials and viewer); the user is anonymous.
 * `reason` says how a session that existed ended; a restore that finds no
 * valid session has none.
 */
function end(reason?: SessionEnd) {
  const ended = reason === "expired" && snapshot.status !== "authenticated" ? undefined : reason;
  crossBoundary();
  adopt(undefined);
  publish(ended === undefined ? { status: "anonymous" } : { status: "anonymous", ended });
}

/** The API rejected this session's credentials: it ends here and in every tab. */
function expire() {
  end("expired");
  broadcast({ type: "signed-out", reason: "expired" });
}

const isRejection = (error: unknown) => isApiError(error) && error.status === 401;

/**
 * Rotates the refresh cookie for a new access token. One refresh runs at a
 * time across all tabs; concurrent callers in this tab share it. Resolves
 * `rejected` when the credential is no longer valid (the session ends),
 * `unavailable` on network or server failures (the session is kept) and
 * `superseded` when the session ended or changed while it ran: its result
 * then belongs to nobody and is dropped, never adopted.
 */
export function refresh(): Promise<RefreshOutcome> {
  tabChannel();
  const seen = generation;
  refreshing ??= withTabLock(REFRESH_LOCK, async (): Promise<RefreshOutcome> => {
    // Another tab refreshed while this one waited for the lock.
    if (generation !== seen && freshCredentials() !== undefined) return "refreshed";
    // A logout that never reached the API: never revive its cookie.
    if (signOutPending()) return "rejected";
    const owner = epoch;
    try {
      const tokens = await refreshSession(undefined, cookieTransport);
      if (epoch !== owner) return "superseded";
      const next = credentialsOf(tokens);
      adopt(next);
      broadcast({ type: "credentials", ...next, signIn: false });
      return "refreshed";
    } catch (error) {
      if (epoch !== owner) return "superseded";
      if (!isRejection(error)) {
        refreshFailure = error;
        if (snapshot.status !== "authenticated") publish({ status: "unavailable", error });
        return "unavailable";
      }
      expire();
      return "rejected";
    }
  }).finally(() => {
    refreshing = undefined;
  });
  return refreshing;
}

/** Thrown by `callWithSession` when no credential could be obtained for a reason other than rejection. */
export class SessionUnavailableError extends Error {
  override readonly name = "SessionUnavailableError";
}

/**
 * Thrown by `callWithSession` when the session ended or another user signed
 * in while the call ran (SF-28): its response belongs to the previous
 * session and is discarded, never handed to the caller.
 */
export class SessionChangedError extends Error {
  override readonly name = "SessionChangedError";
  constructor() {
    super("The session changed while the request ran");
  }
}

const unauthenticated = () => new ApiError(401, "unauthorized", "No active session", {}, null);

const bearer = (accessToken: string): RequestInit => ({
  headers: { Authorization: `Bearer ${accessToken}` },
});

function assertEpoch(owner: number) {
  if (epoch !== owner) throw new SessionChangedError();
}

async function accessToken(owner: number): Promise<string> {
  const current = freshCredentials();
  if (current !== undefined) return current.accessToken;
  if (snapshot.status === "anonymous") throw unauthenticated();
  const outcome = await refresh();
  // This session's own rejection is the canonical 401, even though ending it
  // started a new epoch; only another session's change is SessionChangedError.
  if (outcome === "rejected") throw unauthenticated();
  if (outcome === "superseded") throw new SessionChangedError();
  assertEpoch(owner);
  if (outcome === "unavailable") {
    throw new SessionUnavailableError("Session refresh unavailable", { cause: refreshFailure });
  }
  const next = freshCredentials();
  if (next === undefined) throw unauthenticated();
  return next.accessToken;
}

/**
 * Calls an authenticated endpoint with the access token. On 401 the session
 * is refreshed once (or the token another tab just refreshed is used) and the
 * call retried once; a second 401 ends the session. A 401 is answered before
 * any business logic runs (the API's authentication plug), so the single
 * retry never repeats an operation. Other failures (403, 5xx, network) are
 * returned as they are: they neither refresh nor end the session. A response
 * that arrives after the session ended or changed is discarded
 * (`SessionChangedError`).
 */
export async function callWithSession<T>(call: (init: RequestInit) => Promise<T>): Promise<T> {
  const owner = epoch;
  const used = await accessToken(owner);
  try {
    const result = await call(bearer(used));
    assertEpoch(owner);
    return result;
  } catch (error) {
    assertEpoch(owner);
    if (!isRejection(error)) throw error;
  }

  // Take the newer token when another refresh already replaced the one used.
  const current = freshCredentials();
  let retryWith: string | undefined;
  if (current !== undefined && current.accessToken !== used) retryWith = current.accessToken;
  else {
    const outcome = await refresh();
    if (outcome === "superseded") throw new SessionChangedError();
    if (outcome !== "rejected") assertEpoch(owner);
    if (outcome === "refreshed") retryWith = freshCredentials()?.accessToken;
  }
  if (retryWith === undefined) throw unauthenticated();

  try {
    const result = await call(bearer(retryWith));
    assertEpoch(owner);
    return result;
  } catch (error) {
    assertEpoch(owner);
    if (isRejection(error)) expire();
    throw error;
  }
}

/** Resolves the viewer with the current credentials and publishes the outcome. */
async function loadViewer(): Promise<SessionStatus> {
  const owner = epoch;
  try {
    const { user } = await callWithSession((init) => getCurrentUser(init));
    if (epoch === owner) publish({ status: "authenticated", viewer: user });
  } catch (error) {
    if (error instanceof SessionChangedError || epoch !== owner) return snapshot.status;
    if (isRejection(error)) {
      if (snapshot.status !== "anonymous") end();
    } else {
      const cause = error instanceof SessionUnavailableError ? error.cause : error;
      publish({ status: "unavailable", error: cause });
    }
  }
  return snapshot.status;
}

/**
 * Restores the session once per page load: refresh (coalesced across tabs),
 * then `GET /api/me`. After `unavailable` it can be called again to retry.
 * When a logout of this browser never reached the API, it retries that
 * logout instead and stays signed out.
 */
export function restoreSession(): Promise<SessionStatus> {
  if (snapshot.status === "authenticated" || snapshot.status === "anonymous") {
    return Promise.resolve(snapshot.status);
  }
  restoring ??= (async () => {
    if (signOutPending()) {
      await revokeOnApi(undefined, epoch);
      end();
      return snapshot.status;
    }
    if (freshCredentials() === undefined) {
      const outcome = await refresh();
      if (outcome !== "refreshed") return snapshot.status;
    }
    return loadViewer();
  })().finally(() => {
    restoring = undefined;
  });
  return restoring;
}

/**
 * The one pipeline every sign-in method ends in (Google, Apple, email code):
 * starts a new identity epoch (nothing of a previous session survives),
 * adopts the fresh credentials, shares them with the other tabs and resolves
 * the viewer. Navigation is not decided here: the guest-only gate sends the
 * now authenticated user to the application entry.
 */
export async function completeAuthentication(
  tokens: Pick<SessionTokens, "access_token" | "access_token_expires_at">,
): Promise<SessionStatus> {
  // The sign-in response replaced the cookie of any logout still pending.
  setSignOutPending(false);
  crossBoundary();
  const next = credentialsOf(tokens);
  adopt(next);
  broadcast({ type: "credentials", ...next, signIn: true });
  return loadViewer();
}

/**
 * Signs this browser out (current device only, ADR 0010): the session ends
 * at once here and in every other tab, then the API is asked to revoke it,
 * after any refresh in flight in any tab (so no late refresh cookie outlives
 * the logout). Resolves `revoked` when the API confirmed it and `local` when
 * it could not be reached: then the browser stays signed out, never refreshes
 * with the remaining cookie and retries the logout on the next load. It never
 * claims a revocation the API did not confirm.
 */
export async function signOut(): Promise<SignOutOutcome> {
  const accessToken = credentials?.accessToken;
  end("signed-out");
  broadcast({ type: "signed-out", reason: "signed-out" });
  return (await revokeOnApi(accessToken, epoch)) ? "revoked" : "local";
}

/** The session; restores it on first use in the page. */
export function useSession(): Session {
  const session = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => SERVER_SNAPSHOT,
  );

  useEffect(() => {
    void restoreSession();
  }, []);

  return session;
}

/** The session status; restores the session on first use in the page. */
export function useSessionStatus(): SessionStatus {
  return useSession().status;
}

/** Test seam: back to the initial state of a page load. */
export function resetSessionForTests(): void {
  refreshing = undefined;
  restoring = undefined;
  channel?.close();
  channel = undefined;
  credentials = undefined;
  refreshFailure = undefined;
  generation = 0;
  // Never back to 0: work still pending from before the reset must stay stale.
  epoch += 1;
  boundaryListeners.clear();
  setSignOutPending(false);
  publish({ status: "loading" });
}
