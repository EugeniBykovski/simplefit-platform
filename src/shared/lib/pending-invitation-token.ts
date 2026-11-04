import { useEffect, useSyncExternalStore } from "react";

/**
 * A one-time invitation token this tab is answering (extracted from the SF-60
 * coach invitation for the SF-133 staff invitation; each domain has its own
 * key and token shape, and they never meet).
 *
 * The token is a secret. It arrives only in the URL fragment, which never
 * reaches a server; the invitation page reads it once, removes the fragment
 * from the address bar and history, and keeps it here: in this tab's
 * `sessionStorage` (memory when storage is unavailable), never in a URL,
 * `returnTo`, query key, log or `localStorage`. It is sent only in request
 * bodies.
 *
 * It belongs to one person. A token taken while signed out is bound to the
 * first viewer who signs in; once bound, any session boundary (sign-out,
 * expiry, another account) drops it, so a later user of the tab never
 * inherits it. It also expires after an hour in the tab and is dropped on
 * every final outcome. The backend still checks the recipient on every
 * response: holding the link proves nothing.
 */
export type PendingInvitation = { token: string; owner: string | null; capturedAt: number };

const TTL_MS = 60 * 60 * 1000;

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

type Snapshot = { ready: boolean; pending: PendingInvitation | undefined };
const SERVER: Snapshot = { ready: false, pending: undefined };

export function createPendingInvitationToken({ key, token }: { key: string; token: RegExp }) {
  let memory: string | undefined;
  let snapshot: Snapshot = SERVER;
  const listeners = new Set<() => void>();

  function write(value: PendingInvitation | undefined) {
    const raw = value === undefined ? undefined : JSON.stringify(value);
    memory = raw;
    try {
      if (raw === undefined) storage()?.removeItem(key);
      else storage()?.setItem(key, raw);
    } catch {
      // Memory keeps it for this page load.
    }
  }

  function read(): PendingInvitation | undefined {
    let raw: string | undefined;
    try {
      raw = storage()?.getItem(key) ?? memory;
    } catch {
      raw = memory;
    }
    if (raw === undefined) return undefined;
    try {
      const value = JSON.parse(raw) as Partial<PendingInvitation>;
      if (
        typeof value.token !== "string" ||
        !token.test(value.token) ||
        (value.owner !== null && typeof value.owner !== "string") ||
        typeof value.capturedAt !== "number"
      ) {
        return undefined;
      }
      return { token: value.token, owner: value.owner ?? null, capturedAt: value.capturedAt };
    } catch {
      return undefined;
    }
  }

  /** Whether `value` has the shape of this domain's token (it is never altered). */
  const isToken = (value: unknown): value is string =>
    typeof value === "string" && token.test(value);

  function publish() {
    snapshot = { ready: true, pending: read() };
    for (const listener of listeners) listener();
  }

  function update(value: PendingInvitation | undefined) {
    write(value);
    if (snapshot.ready) publish();
  }

  const store = {
    /**
     * Reads the link's fragment once per page load: keeps a well-formed token
     * for this tab (unbound until a signed-in viewer reads it), then removes the
     * fragment from the address bar and history so it is never bookmarked,
     * shared or sent as a referrer.
     */
    captureFromLocation() {
      if (snapshot.ready || typeof window === "undefined") return;
      const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
      if (window.location.hash !== "") {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
      }
      if (isToken(value)) write({ token: value, owner: null, capturedAt: Date.now() });
      publish();
    },

    /**
     * Housekeeping for `viewer` (`null` while signed out): drops an expired
     * token or one bound to someone else, and binds an unbound token to the
     * first signed-in viewer.
     */
    settle(viewer: string | null) {
      const value = read();
      if (value === undefined) return;
      if (Date.now() - value.capturedAt > TTL_MS) return update(undefined);
      if (viewer === null) return;
      if (value.owner === null) return update({ ...value, owner: viewer });
      if (value.owner !== viewer) update(undefined);
    },

    /** A session boundary: a token bound to an identity never outlives it. */
    crossBoundary() {
      const value = read();
      if (value !== undefined && value.owner !== null) update(undefined);
    },

    clear() {
      update(undefined);
    },
  };

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /**
   * The token `viewer` may answer on the invitation page: `undefined` until the
   * link is read and the session known (`viewer === undefined`), `null` when
   * there is none for them, else the token.
   */
  function usePendingToken(viewer: string | null | undefined): string | null | undefined {
    const current = useSyncExternalStore(
      subscribe,
      () => snapshot,
      () => SERVER,
    );
    useEffect(() => store.captureFromLocation(), []);
    useEffect(() => {
      if (current.ready && viewer !== undefined) store.settle(viewer);
    }, [current.ready, viewer]);

    if (!current.ready || viewer === undefined) return undefined;
    const value = current.pending;
    if (value === undefined) return null;
    if (viewer === null) return value.owner === null ? value.token : null;
    return value.owner === null || value.owner === viewer ? value.token : null;
  }

  /** Test seam. */
  function resetForTests() {
    memory = undefined;
    snapshot = SERVER;
    try {
      storage()?.removeItem(key);
    } catch {
      // Nothing to reset.
    }
  }

  return { store, isToken, usePendingToken, resetForTests };
}
