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

export type Session = {
  status: SessionStatus;
  /** Set while `authenticated`. */
  viewer?: Viewer;
  /** Why the session is `unavailable` (network or server failure). */
  error?: unknown;
};

type Credentials = { accessToken: string; expiresAt: number };
type RefreshOutcome = "refreshed" | "rejected" | "unavailable";

/** Options for requests that carry the refresh cookie (refresh, sign-in, logout). */
export const cookieTransport = {
  credentials: "include",
  headers: { "x-simplefit-csrf": "1" },
} as const satisfies RequestInit;

// Refresh shortly before expiry rather than sending a token about to lapse.
const EXPIRY_MARGIN_MS = 30_000;
const REFRESH_LOCK = "simplefit.session.refresh";
const CHANNEL = "simplefit.session";

let snapshot: Session = { status: "loading" };
let credentials: Credentials | undefined;
// Bumped whenever the credentials change, in this tab or from another one.
let generation = 0;
let refreshing: Promise<RefreshOutcome> | undefined;
let restoring: Promise<SessionStatus> | undefined;
let channel: TabChannel | undefined;
// The failure of the last unavailable refresh, kept for the unavailable view.
let refreshFailure: unknown;
const listeners = new Set<() => void>();

const SERVER_SNAPSHOT: Session = { status: "loading" };

function publish(next: Session) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
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
// Cross-tab channel

type TabMessage =
  { type: "credentials"; accessToken: string; expiresAt: number } | { type: "signed-out" };

function isTabMessage(value: unknown): value is TabMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  if (message.type === "signed-out") return true;
  return (
    message.type === "credentials" &&
    typeof message.accessToken === "string" &&
    message.accessToken !== "" &&
    typeof message.expiresAt === "number" &&
    Number.isFinite(message.expiresAt)
  );
}

function onTabMessage(message: unknown) {
  if (!isTabMessage(message)) return;
  if (message.type === "signed-out") {
    end();
    return;
  }
  adopt({ accessToken: message.accessToken, expiresAt: message.expiresAt });
  // Another tab signed in or refreshed: a tab without a viewer enters too.
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

/** Clears the local session (credentials and viewer); the user is anonymous. */
function end() {
  adopt(undefined);
  publish({ status: "anonymous" });
}

const isRejection = (error: unknown) => isApiError(error) && error.status === 401;

/**
 * Rotates the refresh cookie for a new access token. One refresh runs at a
 * time across all tabs; concurrent callers in this tab share it. Resolves
 * `rejected` when the credential is no longer valid (the session ends) and
 * `unavailable` on network or server failures (the session is kept).
 */
export function refresh(): Promise<RefreshOutcome> {
  tabChannel();
  const seen = generation;
  refreshing ??= withTabLock(REFRESH_LOCK, async (): Promise<RefreshOutcome> => {
    // Another tab refreshed while this one waited for the lock.
    if (generation !== seen && freshCredentials() !== undefined) return "refreshed";
    try {
      const next = credentialsOf(await refreshSession(undefined, cookieTransport));
      adopt(next);
      broadcast({ type: "credentials", ...next });
      return "refreshed";
    } catch (error) {
      if (!isRejection(error)) {
        refreshFailure = error;
        if (snapshot.status !== "authenticated") publish({ status: "unavailable", error });
        return "unavailable";
      }
      end();
      broadcast({ type: "signed-out" });
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

const unauthenticated = () => new ApiError(401, "unauthorized", "No active session", {}, null);

const bearer = (accessToken: string): RequestInit => ({
  headers: { Authorization: `Bearer ${accessToken}` },
});

async function accessToken(): Promise<string> {
  const current = freshCredentials();
  if (current !== undefined) return current.accessToken;
  if (snapshot.status === "anonymous") throw unauthenticated();
  const outcome = await refresh();
  if (outcome === "unavailable") {
    throw new SessionUnavailableError("Session refresh unavailable", { cause: refreshFailure });
  }
  const next = freshCredentials();
  if (outcome === "rejected" || next === undefined) throw unauthenticated();
  return next.accessToken;
}

/**
 * Calls an authenticated endpoint with the access token. On 401 the session
 * is refreshed once (or the token another tab just refreshed is used) and the
 * call retried once; a second 401 ends the session.
 */
export async function callWithSession<T>(call: (init: RequestInit) => Promise<T>): Promise<T> {
  const used = await accessToken();
  try {
    return await call(bearer(used));
  } catch (error) {
    if (!isRejection(error)) throw error;
  }

  // Take the newer token when another refresh already replaced the one used.
  const current = freshCredentials();
  const retryWith =
    current !== undefined && current.accessToken !== used
      ? current.accessToken
      : (await refresh()) === "refreshed"
        ? freshCredentials()?.accessToken
        : undefined;
  if (retryWith === undefined) throw unauthenticated();

  try {
    return await call(bearer(retryWith));
  } catch (error) {
    if (isRejection(error)) {
      end();
      broadcast({ type: "signed-out" });
    }
    throw error;
  }
}

/** Resolves the viewer with the current credentials and publishes the outcome. */
async function loadViewer(): Promise<SessionStatus> {
  try {
    const { user } = await callWithSession((init) => getCurrentUser(init));
    publish({ status: "authenticated", viewer: user });
  } catch (error) {
    if (isRejection(error)) end();
    else {
      const cause = error instanceof SessionUnavailableError ? error.cause : error;
      publish({ status: "unavailable", error: cause });
    }
  }
  return snapshot.status;
}

/**
 * Restores the session once per page load: refresh (coalesced across tabs),
 * then `GET /api/me`. After `unavailable` it can be called again to retry.
 */
export function restoreSession(): Promise<SessionStatus> {
  if (snapshot.status === "authenticated" || snapshot.status === "anonymous") {
    return Promise.resolve(snapshot.status);
  }
  restoring ??= (async () => {
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
 * adopts the fresh credentials, shares them with the other tabs and resolves
 * the viewer. Navigation is not decided here: the guest-only gate sends the
 * now authenticated user to the application entry.
 */
export async function completeAuthentication(
  tokens: Pick<SessionTokens, "access_token" | "access_token_expires_at">,
): Promise<SessionStatus> {
  const next = credentialsOf(tokens);
  adopt(next);
  broadcast({ type: "credentials", ...next });
  return loadViewer();
}

/**
 * Revokes the session on the API (bearer token and refresh cookie) and clears
 * it locally and in every other tab. Local state is cleared even when the
 * request fails.
 */
export async function signOut(): Promise<void> {
  const headers: Record<string, string> = { ...cookieTransport.headers };
  if (credentials !== undefined) headers.Authorization = `Bearer ${credentials.accessToken}`;

  try {
    await logout(undefined, { ...cookieTransport, headers });
  } catch {
    // The API clears the cookie whenever it answers; nothing else to undo here.
  } finally {
    end();
    broadcast({ type: "signed-out" });
  }
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
  publish({ status: "loading" });
}
