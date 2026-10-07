import { describe, expect, it, vi } from "vitest";

import { getHealth } from "@/shared/api/generated/endpoints/system/system";
import { jsonResponse } from "@/test/render";

import { ApiError } from "./api-error";
import { apiFetch, apiUrl } from "./api-fetch";

describe("apiUrl", () => {
  it("resolves API paths against NEXT_PUBLIC_API_URL", () => {
    expect(apiUrl("/api/health")).toBe("http://api.test/api/health");
  });
});

describe("apiFetch", () => {
  it("requests JSON and resolves with the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/thing", { method: "POST", body: "{}" })).resolves.toEqual({
      ok: true,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe("http://api.test/api/thing");
    expect(init.method).toBe("POST");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("throws ApiError carrying the backend error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: "validation_error",
              message: "Request validation failed",
              details: { fields: { email: ["has invalid format"] } },
              request_id: "req-123",
            },
          },
          { status: 422 },
        ),
      ),
    );

    const error = await apiFetch("/api/v1/things").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      code: "validation_error",
      message: "Request validation failed",
      requestId: "req-123",
      fieldErrors: { email: ["has invalid format"] },
    });
  });

  it("carries the retry-after delay of a rate-limited response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: { code: "rate_limited", message: "Too many requests", details: {} } },
            { status: 429, headers: { "retry-after": "42" } },
          ),
        ),
    );

    await expect(apiFetch("/api/auth/email/sign-in")).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
      retryAfterSeconds: 42,
    });
  });

  it("ignores a retry-after that is not a delay in seconds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("slow down", {
          status: 429,
          headers: { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" },
        }),
      ),
    );

    await expect(apiFetch("/api/auth/email/sign-in")).rejects.toMatchObject({
      retryAfterSeconds: null,
    });
  });

  it("throws ApiError for non-envelope error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("Bad gateway", { status: 502, headers: { "x-request-id": "edge-1" } }),
        ),
    );

    await expect(apiFetch("/api/health")).rejects.toMatchObject({
      status: 502,
      code: "unexpected_response",
      requestId: "edge-1",
    });
  });
});

describe("generated client", () => {
  it("calls the backend contract through apiFetch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: "ok", service: "simplefit-api" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getHealth()).resolves.toEqual({ status: "ok", service: "simplefit-api" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/health",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
