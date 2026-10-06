import { useEffect, useSyncExternalStore } from "react";

import { logout, refreshSession } from "@/shared/api/generated/endpoints/auth/auth";
import type { SessionTokens } from "@/shared/api/generated/model";
import { ApiError, isApiError } from "@/shared/api/http/api-error";

/**
 * The browser's SimpleFit session (ADR 0010 in simplefit-api, web transport).
 *
 * - The access token lives only in this module's memory: never in
 *   localStorage, sessionStorage, cookies readable by scripts or URLs. A
 *   reload loses it; the session is restored from the refresh cookie.
 * - The refresh token is an `HttpOnly` cookie set by the API
 *   (`Path=/api/auth`). Scripts never see it; requests that use it send
 *   `credentials: "include"` and the `x-simplefit-csrf: 1` header.
 * - A request rejected with 401 is retried at most once, after one refresh.
 *
 * State is module-level and only ever changes in the browser (handlers and
 * effects); the server snapshot is always "loading".
 */
export type SessionStatus = "loading" | "authenticated" | "anonymous";

type State =
  | { status: "loading" | "anonymous" }
  | { status: "authenticated"; accessToken: string; expiresAt: number };

/** Options for requests that carry the refresh cookie (refresh, sign-in, logout). */
export const cookieTransport = {
  credentials: "include",
  headers: { "x-simplefit-csrf": "1" },
} as const satisfies RequestInit;

// Refresh shortly before expiry rather than sending a token about to lapse.
const EXPIRY_MARGIN_MS = 30_000;

let state: State = { status: "loading" };
let refreshing: Promise<boolean> | undefined;
const listeners = new Set<() => void>();

function setState(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getStatus = (): SessionStatus => state.status;
const getServerStatus = (): SessionStatus => "loading";

/** Starts a session from fresh credentials (sign-in or refresh responses). */
export function startSession(
  tokens: Pick<SessionTokens, "access_token" | "access_token_expires_at">,
): void {
  setState({
    status: "authenticated",
    accessToken: tokens.access_token,
    expiresAt: Date.parse(tokens.access_token_expires_at),
  });
}

/**
 * Rotates the refresh cookie for a new access token. Concurrent callers share
 * one request (a refresh token is single use). Resolves whether a session is
 * active afterwards.
 */
export function refresh(): Promise<boolean> {
  refreshing ??= refreshSession(undefined, cookieTransport)
    .then((tokens) => {
      startSession(tokens);
      return true;
    })
    .catch(() => {
      setState({ status: "anonymous" });
      return false;
    })
    .finally(() => {
      refreshing = undefined;
    });
  return refreshing;
}

/** Restores the session from the refresh cookie once per page load. */
export function restoreSession(): Promise<boolean> {
  if (state.status !== "loading") return Promise.resolve(state.status === "authenticated");
  return refresh();
}

async function currentAccessToken(): Promise<string | undefined> {
  if (state.status === "authenticated" && state.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
    return state.accessToken;
  }
  if (state.status === "anonymous") return undefined;
  return (await refresh()) && state.status === "authenticated" ? state.accessToken : undefined;
}

const unauthenticated = () => new ApiError(401, "unauthorized", "No active session", {}, null);

const bearer = (accessToken: string): RequestInit => ({
  headers: { Authorization: `Bearer ${accessToken}` },
});

/**
 * Calls an authenticated endpoint with the access token. On 401 the session
 * is refreshed once and the call retried once; a second 401 ends the session.
 */
export async function callWithSession<T>(call: (init: RequestInit) => Promise<T>): Promise<T> {
  const accessToken = await currentAccessToken();
  if (accessToken === undefined) throw unauthenticated();

  try {
    return await call(bearer(accessToken));
  } catch (error) {
    if (!isApiError(error) || error.status !== 401) throw error;
  }

  if (!(await refresh()) || state.status !== "authenticated") throw unauthenticated();
  try {
    return await call(bearer(state.accessToken));
  } catch (error) {
    if (isApiError(error) && error.status === 401) setState({ status: "anonymous" });
    throw error;
  }
}

/**
 * Revokes the session on the API (bearer token and refresh cookie) and clears
 * it locally. Local state is cleared even when the request fails.
 */
export async function signOut(): Promise<void> {
  const headers: Record<string, string> = { ...cookieTransport.headers };
  if (state.status === "authenticated") headers.Authorization = `Bearer ${state.accessToken}`;

  try {
    await logout(undefined, { ...cookieTransport, headers });
  } catch {
    // The API clears the cookie whenever it answers; nothing else to undo here.
  } finally {
    setState({ status: "anonymous" });
  }
}

/** The session status; restores the session on first use in the page. */
export function useSessionStatus(): SessionStatus {
  const status = useSyncExternalStore(subscribe, getStatus, getServerStatus);

  useEffect(() => {
    void restoreSession();
  }, []);

  return status;
}

/** Test seam: back to the initial state of a page load. */
export function resetSessionForTests(): void {
  refreshing = undefined;
  setState({ status: "loading" });
}
