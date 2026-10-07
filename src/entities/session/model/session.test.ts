import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jsonResponse } from "@/test/render";

import type * as SessionModule from "./session";

const API = "http://api.test";
const VIEWER = { id: "8a6e0804-2bd0-4672-b79d-d97027f9071b", created_at: "2026-10-01T10:00:00Z" };
const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();

const tokenBody = (accessToken: string, expiresAt = inAnHour()) => ({
  access_token: accessToken,
  access_token_expires_at: expiresAt,
  refresh_token_expires_at: inAnHour(),
  refresh_token_transport: "cookie",
  token_type: "Bearer",
});

const tokens = (accessToken: string) => jsonResponse(tokenBody(accessToken));
const viewer = () => jsonResponse({ user: VIEWER });
const unauthorized = () =>
  jsonResponse(
    { error: { code: "unauthorized", message: "Authentication is required", details: {} } },
    { status: 401 },
  );
const serverError = () =>
  jsonResponse(
    { error: { code: "service_unavailable", message: "Try later", details: {} } },
    { status: 503 },
  );
const offline = () => Promise.reject(new TypeError("Failed to fetch"));

type Call = [string, RequestInit];
const calls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls as Call[];
const urls = (fetchMock: ReturnType<typeof vi.fn>) => calls(fetchMock).map(([url]) => url);
const header = ([, init]: Call, name: string) => new Headers(init.headers).get(name);

/** Answers by path; each path's responses are used in order, the last one repeats. */
function api(routes: Record<string, (() => Response | Promise<Response>)[]>) {
  const seen = new Map<string, number>();
  return vi.fn((url: string) => {
    const path = new URL(url).pathname;
    const answers = routes[path];
    if (!answers) throw new Error(`unexpected request ${path}`);
    const index = seen.get(path) ?? 0;
    seen.set(path, index + 1);
    return Promise.resolve(answers[Math.min(index, answers.length - 1)]!());
  });
}

/**
 * A fresh copy of the module graph: one browser tab. `me` and `isApiError`
 * come from the same graph, so ApiError instances match the tab's own class.
 */
async function openTab() {
  vi.resetModules();
  const model = await import("./session");
  const { getCurrentUser } = await import("@/shared/api/generated/endpoints/auth/auth");
  const { isApiError } = await import("@/shared/api/http/api-error");
  return {
    ...model,
    me: (init: RequestInit) => getCurrentUser(init),
    isApiError,
  } satisfies typeof SessionModule & Record<string, unknown>;
}

let session: Awaited<ReturnType<typeof openTab>>;

beforeEach(async () => {
  // Real channels would connect this test's tab to earlier tests' tabs; the
  // cross-tab tests install a fake channel explicitly.
  vi.stubGlobal("BroadcastChannel", undefined);
  session = await openTab();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  session.resetSessionForTests();
});

describe("restore", () => {
  it("refreshes with the refresh cookie and CSRF header, then resolves the viewer", async () => {
    const fetchMock = api({
      "/api/auth/session/refresh": [() => tokens("sfa_restored")],
      "/api/me": [viewer],
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(session.restoreSession()).resolves.toBe("authenticated");

    const [refreshCall, meCall] = calls(fetchMock);
    expect(refreshCall?.[0]).toBe(`${API}/api/auth/session/refresh`);
    expect(refreshCall?.[1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(refreshCall && header(refreshCall, "x-simplefit-csrf")).toBe("1");
    expect(meCall?.[0]).toBe(`${API}/api/me`);
    expect(meCall && header(meCall, "authorization")).toBe("Bearer sfa_restored");
  });

  it("exposes the viewer from /api/me and nothing else", async () => {
    vi.stubGlobal(
      "fetch",
      api({ "/api/auth/session/refresh": [() => tokens("sfa_a")], "/api/me": [viewer] }),
    );
    const { result } = renderHook(() => session.useSession());

    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.viewer).toEqual(VIEWER);
  });

  it("is anonymous when there is no refresh cookie", async () => {
    vi.stubGlobal("fetch", api({ "/api/auth/session/refresh": [unauthorized] }));
    const { result } = renderHook(() => session.useSessionStatus());

    expect(result.current).toBe("loading");
    await waitFor(() => expect(result.current).toBe("anonymous"));
  });

  it.each([
    ["the network fails", offline],
    ["the API is unavailable", serverError],
  ])("is unavailable, not anonymous, when %s during the refresh", async (_case, failure) => {
    const fetchMock = api({ "/api/auth/session/refresh": [failure] });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => session.useSession());

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.error).toBeDefined();
    expect(result.current.viewer).toBeUndefined();
  });

  it("is unavailable when /api/me fails after a good refresh, and retries only /api/me", async () => {
    const fetchMock = api({
      "/api/auth/session/refresh": [() => tokens("sfa_kept")],
      "/api/me": [offline, viewer],
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(session.restoreSession()).resolves.toBe("unavailable");
    await expect(session.restoreSession()).resolves.toBe("authenticated");

    expect(urls(fetchMock)).toEqual([
      `${API}/api/auth/session/refresh`,
      `${API}/api/me`,
      `${API}/api/me`,
    ]);
  });

  it("can retry a refresh that was unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      api({ "/api/auth/session/refresh": [offline, () => tokens("sfa_b")], "/api/me": [viewer] }),
    );

    await expect(session.restoreSession()).resolves.toBe("unavailable");
    await expect(session.restoreSession()).resolves.toBe("authenticated");
  });

  it("is anonymous when /api/me rejects the session after a refresh and retry", async () => {
    vi.stubGlobal(
      "fetch",
      api({
        "/api/auth/session/refresh": [() => tokens("sfa_1"), () => tokens("sfa_2")],
        "/api/me": [unauthorized],
      }),
    );

    await expect(session.restoreSession()).resolves.toBe("anonymous");
  });

  it("keeps tokens out of browser storage", async () => {
    vi.stubGlobal(
      "fetch",
      api({ "/api/auth/session/refresh": [() => tokens("sfa_memory_only")], "/api/me": [viewer] }),
    );

    await session.restoreSession();

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain("sfa_memory_only");
  });
});

describe("refresh coalescing in one tab", () => {
  it("shares one refresh between concurrent callers (refresh tokens are single use)", async () => {
    const fetchMock = api({
      "/api/auth/session/refresh": [() => tokens("sfa_once")],
      "/api/me": [viewer],
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([session.refresh(), session.refresh(), session.restoreSession()]);

    expect(urls(fetchMock).filter((url) => url.endsWith("/refresh"))).toHaveLength(1);
  });

  it("refreshes once for concurrent 401s and retries each call once", async () => {
    vi.stubGlobal("fetch", api({ "/api/me": [viewer] }));
    await session.completeAuthentication(tokenBody("sfa_stale"));
    const fetchMock = api({
      "/api/auth/session/refresh": [() => tokens("sfa_new")],
      "/api/me": [unauthorized, unauthorized, viewer],
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([session.callWithSession(session.me), session.callWithSession(session.me)]);

    const sent = calls(fetchMock);
    expect(sent.filter(([url]) => url.endsWith("/refresh"))).toHaveLength(1);
    expect(sent.filter(([url]) => url.endsWith("/api/me"))).toHaveLength(4);
    expect(sent.slice(-2).map((call) => header(call, "authorization"))).toEqual([
      "Bearer sfa_new",
      "Bearer sfa_new",
    ]);
  });
});

describe("authenticated calls", () => {
  async function signedIn(accessToken: string, expiresAt = inAnHour()) {
    vi.stubGlobal("fetch", api({ "/api/me": [viewer] }));
    await session.completeAuthentication(tokenBody(accessToken, expiresAt));
  }

  it("sends the access token as a bearer token", async () => {
    await signedIn("sfa_current");
    const fetchMock = api({ "/api/me": [viewer] });
    vi.stubGlobal("fetch", fetchMock);

    await session.callWithSession(session.me);

    const [call] = calls(fetchMock);
    expect(call && header(call, "authorization")).toBe("Bearer sfa_current");
  });

  it("refreshes once and retries once after a 401", async () => {
    await signedIn("sfa_stale");
    const fetchMock = api({
      "/api/me": [unauthorized, viewer],
      "/api/auth/session/refresh": [() => tokens("sfa_fresh")],
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(session.callWithSession(session.me)).resolves.toMatchObject({
      user: VIEWER,
    });

    const sent = calls(fetchMock);
    expect(sent.map(([url]) => url)).toEqual([
      `${API}/api/me`,
      `${API}/api/auth/session/refresh`,
      `${API}/api/me`,
    ]);
    expect(sent[2] && header(sent[2], "authorization")).toBe("Bearer sfa_fresh");
  });

  it("ends the session after the retried call is rejected again, without looping", async () => {
    await signedIn("sfa_stale");
    const fetchMock = api({
      "/api/me": [unauthorized],
      "/api/auth/session/refresh": [() => tokens("sfa_fresh")],
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => session.useSessionStatus());

    const error = await session.callWithSession(session.me).catch((e: unknown) => e);

    expect(session.isApiError(error) && error.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(result.current).toBe("anonymous"));
  });

  it("keeps the session when the refresh after a 401 fails on the network", async () => {
    await signedIn("sfa_stale");
    vi.stubGlobal(
      "fetch",
      api({ "/api/me": [unauthorized], "/api/auth/session/refresh": [offline] }),
    );
    const { result } = renderHook(() => session.useSessionStatus());

    await session.callWithSession(session.me).catch(() => undefined);

    expect(result.current).toBe("authenticated");
  });

  it("does not call the endpoint when no session can be restored", async () => {
    const fetchMock = api({ "/api/auth/session/refresh": [unauthorized] });
    vi.stubGlobal("fetch", fetchMock);
    const call = vi.fn();

    const error = await session.callWithSession(call).catch((e: unknown) => e);

    expect(session.isApiError(error) && error.code).toBe("unauthorized");
    expect(call).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes an access token that is about to expire before using it", async () => {
    await signedIn("sfa_expiring", new Date(Date.now() + 5_000).toISOString());
    const fetchMock = api({
      "/api/auth/session/refresh": [() => tokens("sfa_next")],
      "/api/me": [viewer],
    });
    vi.stubGlobal("fetch", fetchMock);

    await session.callWithSession(session.me);

    const sent = calls(fetchMock);
    expect(sent.map(([url]) => url)).toEqual([`${API}/api/auth/session/refresh`, `${API}/api/me`]);
    expect(sent[1] && header(sent[1], "authorization")).toBe("Bearer sfa_next");
  });
});

describe("sign-out", () => {
  it("signs out with the bearer token and the refresh cookie", async () => {
    vi.stubGlobal("fetch", api({ "/api/me": [viewer] }));
    await session.completeAuthentication(tokenBody("sfa_current"));
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => session.useSession());

    await act(() => session.signOut());

    const [call] = calls(fetchMock);
    expect(call?.[0]).toBe(`${API}/api/auth/logout`);
    expect(call?.[1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(call && header(call, "x-simplefit-csrf")).toBe("1");
    expect(call && header(call, "authorization")).toBe("Bearer sfa_current");
    expect(result.current).toEqual({ status: "anonymous" });
  });

  it("clears the local session even when the logout request fails", async () => {
    vi.stubGlobal("fetch", api({ "/api/me": [viewer] }));
    await session.completeAuthentication(tokenBody("sfa_current"));
    vi.stubGlobal("fetch", vi.fn(offline));
    const { result } = renderHook(() => session.useSessionStatus());

    await act(() => session.signOut());

    expect(result.current).toBe("anonymous");
  });
});

/*
 * Cross-tab coordination (ADR 0010). Each tab is its own module instance;
 * the tabs share a fake refresh cookie with strict rotation (a reused refresh
 * token revokes the session), the Web Locks API and BroadcastChannel.
 */
describe("across tabs", () => {
  /** Serializes tasks per lock name, like navigator.locks. */
  function fakeLocks() {
    const tails = new Map<string, Promise<unknown>>();
    return {
      request: vi.fn((name: string, _options: unknown, task: () => Promise<unknown>) => {
        const run = (tails.get(name) ?? Promise.resolve()).then(task);
        tails.set(
          name,
          run.catch(() => undefined),
        );
        return run;
      }),
    };
  }

  /** Delivers each message synchronously to every other channel of the same name. */
  function fakeBroadcastChannel() {
    const open = new Set<FakeChannel>();
    class FakeChannel {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      constructor(readonly name: string) {
        open.add(this);
      }
      postMessage(data: unknown) {
        for (const other of open) {
          if (other !== this && other.name === this.name) {
            other.onmessage?.({ data } as MessageEvent<unknown>);
          }
        }
      }
      close() {
        open.delete(this);
      }
    }
    return { FakeChannel, posted: () => open.size };
  }

  /** One rotating refresh cookie: a request that sends an already used token revokes the session. */
  function strictRotationApi() {
    let jar = "rt_0";
    let current = "rt_0";
    let revoked = false;
    let issued = 0;
    const fetchMock = vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path === "/api/me") return revoked ? unauthorized() : viewer();
      if (path !== "/api/auth/session/refresh") throw new Error(path);
      const sent = jar;
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (revoked || sent !== current) {
        revoked = true;
        return unauthorized();
      }
      issued += 1;
      current = `rt_${issued}`;
      jar = current;
      return tokens(`sfa_${issued}`);
    });
    return { fetchMock, revoked: () => revoked, refreshes: () => issued };
  }

  async function twoTabs() {
    const first = await openTab();
    const second = await openTab();
    return [first, second] as const;
  }

  it("serializes refreshes so two restoring tabs never reuse a refresh token", async () => {
    const { FakeChannel } = fakeBroadcastChannel();
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    vi.stubGlobal("navigator", { ...navigator, locks: fakeLocks() });
    const server = strictRotationApi();
    vi.stubGlobal("fetch", server.fetchMock);
    const [a, b] = await twoTabs();

    const statuses = await Promise.all([a.restoreSession(), b.restoreSession()]);

    expect(statuses).toEqual(["authenticated", "authenticated"]);
    expect(server.revoked()).toBe(false);
    // The second tab saw the first tab's refresh after taking the lock.
    expect(server.refreshes()).toBe(1);
    a.resetSessionForTests();
    b.resetSessionForTests();
  });

  it("documents why: without Web Locks two concurrent refreshes revoke the session", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.stubGlobal("navigator", { ...navigator, locks: undefined });
    const server = strictRotationApi();
    vi.stubGlobal("fetch", server.fetchMock);
    const [a, b] = await twoTabs();

    // The fallback still works within one tab and degrades without throwing.
    await Promise.all([a.restoreSession(), b.restoreSession()]);

    expect(server.revoked()).toBe(true);
    a.resetSessionForTests();
    b.resetSessionForTests();
  });

  it("signs every tab in when one tab completes authentication", async () => {
    const { FakeChannel } = fakeBroadcastChannel();
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    vi.stubGlobal(
      "fetch",
      api({ "/api/auth/session/refresh": [unauthorized], "/api/me": [viewer] }),
    );
    const [a, b] = await twoTabs();
    await Promise.all([a.restoreSession(), b.restoreSession()]);
    const { result } = renderHook(() => b.useSession());
    expect(result.current.status).toBe("anonymous");

    await a.completeAuthentication(tokenBody("sfa_shared"));

    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    const fetchMock = api({ "/api/me": [viewer] });
    vi.stubGlobal("fetch", fetchMock);
    await b.callWithSession(b.me);
    expect(header(calls(fetchMock)[0]!, "authorization")).toBe("Bearer sfa_shared");
    a.resetSessionForTests();
    b.resetSessionForTests();
  });

  it("signs every tab out when one tab signs out", async () => {
    const { FakeChannel } = fakeBroadcastChannel();
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    vi.stubGlobal(
      "fetch",
      api({ "/api/auth/session/refresh": [() => tokens("sfa_1")], "/api/me": [viewer] }),
    );
    const [a, b] = await twoTabs();
    await a.restoreSession();
    await b.restoreSession();
    const { result } = renderHook(() => b.useSessionStatus());
    expect(result.current).toBe("authenticated");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await act(() => a.signOut());

    expect(result.current).toBe("anonymous");
    a.resetSessionForTests();
    b.resetSessionForTests();
  });

  it("ignores malformed messages from the channel", async () => {
    const { FakeChannel } = fakeBroadcastChannel();
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    vi.stubGlobal("fetch", api({ "/api/auth/session/refresh": [unauthorized] }));
    await session.restoreSession();
    const intruder = new FakeChannel("simplefit.session");

    for (const message of [
      null,
      "credentials",
      { type: "credentials", accessToken: "", expiresAt: 1 },
      { type: "credentials", accessToken: "x", expiresAt: "soon" },
      { type: "promote", role: "admin" },
    ]) {
      intruder.postMessage(message);
    }

    const { result } = renderHook(() => session.useSessionStatus());
    expect(result.current).toBe("anonymous");
  });
});
