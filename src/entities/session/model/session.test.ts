import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentUser } from "@/shared/api/generated/endpoints/auth/auth";
import { isApiError } from "@/shared/api/http/api-error";
import { jsonResponse } from "@/test/render";

import {
  callWithSession,
  refresh,
  resetSessionForTests,
  restoreSession,
  signOut,
  startSession,
  useSessionStatus,
} from "./session";

const API = "http://api.test";
const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();

const tokens = (accessToken: string) =>
  jsonResponse({
    access_token: accessToken,
    access_token_expires_at: inAnHour(),
    refresh_token_expires_at: inAnHour(),
    refresh_token_transport: "cookie",
    token_type: "Bearer",
  });

const unauthorized = () =>
  jsonResponse(
    { error: { code: "unauthorized", message: "Authentication is required", details: {} } },
    { status: 401 },
  );

const user = () =>
  jsonResponse({ user: { id: "8a6e0804-2bd0-4672-b79d-d97027f9071b", created_at: inAnHour() } });

type Call = [string, RequestInit];
const calls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls as Call[];
const header = ([, init]: Call, name: string) => new Headers(init.headers).get(name);

describe("session", () => {
  beforeEach(() => {
    resetSessionForTests();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("restores the session from the refresh cookie with the CSRF header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokens("sfa_restored"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(restoreSession()).resolves.toBe(true);

    const [call] = calls(fetchMock);
    expect(call?.[0]).toBe(`${API}/api/auth/session/refresh`);
    expect(call?.[1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(call && header(call, "x-simplefit-csrf")).toBe("1");
  });

  it("is anonymous when there is no refresh cookie", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(unauthorized()));
    const { result } = renderHook(() => useSessionStatus());

    expect(result.current).toBe("loading");
    await waitFor(() => expect(result.current).toBe("anonymous"));
  });

  it("shares one refresh between concurrent callers (refresh tokens are single use)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokens("sfa_once"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(Promise.all([refresh(), refresh(), restoreSession()])).resolves.toEqual([
      true,
      true,
      true,
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the access token as a bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(user());
    vi.stubGlobal("fetch", fetchMock);
    startSession({ access_token: "sfa_current", access_token_expires_at: inAnHour() });

    await callWithSession((init) => getCurrentUser(init));

    const [call] = calls(fetchMock);
    expect(call?.[0]).toBe(`${API}/api/me`);
    expect(call && header(call, "authorization")).toBe("Bearer sfa_current");
  });

  it("refreshes once and retries once after a 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(tokens("sfa_fresh"))
      .mockResolvedValueOnce(user());
    vi.stubGlobal("fetch", fetchMock);
    startSession({ access_token: "sfa_stale", access_token_expires_at: inAnHour() });

    await expect(callWithSession((init) => getCurrentUser(init))).resolves.toMatchObject({
      user: { id: expect.any(String) },
    });

    const sent = calls(fetchMock);
    expect(sent.map(([url]) => url)).toEqual([
      `${API}/api/me`,
      `${API}/api/auth/session/refresh`,
      `${API}/api/me`,
    ]);
    expect(sent[2] && header(sent[2], "authorization")).toBe("Bearer sfa_fresh");
  });

  it("gives up after the retried call is rejected again, without looping", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(tokens("sfa_fresh"))
      .mockResolvedValue(unauthorized());
    vi.stubGlobal("fetch", fetchMock);
    startSession({ access_token: "sfa_stale", access_token_expires_at: inAnHour() });
    const { result } = renderHook(() => useSessionStatus());

    const error = await callWithSession((init) => getCurrentUser(init)).catch((e: unknown) => e);

    expect(isApiError(error) && error.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(result.current).toBe("anonymous"));
  });

  it("does not call the endpoint when no session can be restored", async () => {
    const fetchMock = vi.fn().mockResolvedValue(unauthorized());
    vi.stubGlobal("fetch", fetchMock);
    const call = vi.fn();

    const error = await callWithSession(call).catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe("unauthorized");
    expect(call).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes an access token that is about to expire before using it", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tokens("sfa_next")).mockResolvedValue(user());
    vi.stubGlobal("fetch", fetchMock);
    startSession({
      access_token: "sfa_expiring",
      access_token_expires_at: new Date(Date.now() + 5_000).toISOString(),
    });

    await callWithSession((init) => getCurrentUser(init));

    const sent = calls(fetchMock);
    expect(sent.map(([url]) => url)).toEqual([`${API}/api/auth/session/refresh`, `${API}/api/me`]);
    expect(sent[1] && header(sent[1], "authorization")).toBe("Bearer sfa_next");
  });

  it("signs out with the bearer token and the refresh cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    startSession({ access_token: "sfa_current", access_token_expires_at: inAnHour() });
    const { result } = renderHook(() => useSessionStatus());

    await act(() => signOut());

    const [call] = calls(fetchMock);
    expect(call?.[0]).toBe(`${API}/api/auth/logout`);
    expect(call?.[1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(call && header(call, "x-simplefit-csrf")).toBe("1");
    expect(call && header(call, "authorization")).toBe("Bearer sfa_current");
    expect(result.current).toBe("anonymous");
  });

  it("clears the local session even when the logout request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    startSession({ access_token: "sfa_current", access_token_expires_at: inAnHour() });
    const { result } = renderHook(() => useSessionStatus());

    await act(() => signOut());

    expect(result.current).toBe("anonymous");
  });

  it("keeps tokens out of browser storage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tokens("sfa_memory_only")));

    await restoreSession();

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain("sfa_memory_only");
  });
});
