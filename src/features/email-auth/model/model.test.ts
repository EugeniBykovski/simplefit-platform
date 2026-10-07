import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api/http/api-error";

import {
  formatCountdown,
  inputStateFor,
  requestFailureOf,
  statusForVerifyError,
} from "./code-step";
import { normalizeEmail, pending } from "./pending";

const apiError = (status: number, code: string, retryAfter: number | null = null) =>
  new ApiError(status, code, "ignored", {}, null, retryAfter);

describe("statusForVerifyError", () => {
  it.each([
    [apiError(422, "code_invalid"), "sign-in", "invalid"],
    [apiError(422, "code_expired"), "sign-in", "expired"],
    [apiError(409, "verified_elsewhere"), "registration", "verified-elsewhere"],
    [apiError(409, "conflict"), "registration", "verified-elsewhere"],
    [apiError(409, "verified_elsewhere"), "sign-in", "error"],
    [apiError(403, "forbidden"), "sign-in", "error"],
    [apiError(503, "service_unavailable"), "registration", "error"],
    [new TypeError("Failed to fetch"), "sign-in", "error"],
  ] as const)("%o during %s is %s", (error, purpose, status) => {
    expect(statusForVerifyError(error, purpose).status).toBe(status);
  });

  it("keeps the retry-after delay of rate limiting", () => {
    expect(statusForVerifyError(apiError(429, "rate_limited", 30), "sign-in")).toEqual({
      status: "throttled",
      retryAfterSeconds: 30,
    });
  });
});

describe("requestFailureOf", () => {
  it("branches on the code, never on the message", () => {
    expect(requestFailureOf(apiError(422, "validation_error"))).toBe("invalidEmail");
    expect(requestFailureOf(apiError(429, "rate_limited"))).toBe("rateLimited");
    expect(requestFailureOf(apiError(500, "internal_error"))).toBe("generic");
    expect(requestFailureOf(new TypeError("offline"))).toBe("generic");
  });
});

describe("inputStateFor", () => {
  it.each([
    ["typing", "4071", "typing"],
    ["typing", "407193", "filled"],
    ["invalid", "407100", "error"],
    ["throttled", "", "locked"],
    ["verified-elsewhere", "", "locked"],
    ["error", "407193", "filled"],
  ] as const)("%s with %s looks %s", (status, code, look) => {
    expect(inputStateFor(status, code)).toBe(look);
  });
});

describe("formatCountdown", () => {
  it.each([
    [59, "0:59"],
    [42.2, "0:43"],
    [60, "1:00"],
    [0, "0:00"],
    [-3, "0:00"],
  ])("%s s is %s", (seconds, text) => {
    expect(formatCountdown(seconds)).toBe(text);
  });
});

describe("pending flow", () => {
  afterEach(() => {
    pending.clear("signIn");
    pending.clear("registration");
    vi.restoreAllMocks();
  });

  it("keeps sign-in and registration apart, in sessionStorage only", () => {
    pending.set("signIn", { email: "a@example.com", resendAt: 1 });
    pending.set("registration", {
      email: "b@example.com",
      registrationToken: "sfg_x",
      resendAt: 2,
    });

    expect(pending.get("signIn")).toEqual({ email: "a@example.com", resendAt: 1 });
    expect(pending.get("registration")?.registrationToken).toBe("sfg_x");
    expect(localStorage.length).toBe(0);
  });

  it("ignores malformed records", () => {
    sessionStorage.setItem("simplefit.auth.email-registration", '{"email":"x@example.com"}');
    sessionStorage.setItem("simplefit.auth.email-sign-in", "not json");

    expect(pending.get("registration")).toBeUndefined();
    expect(pending.get("signIn")).toBeUndefined();
  });

  it("falls back to memory when sessionStorage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    pending.set("signIn", { email: "a@example.com", resendAt: 1 });

    expect(pending.get("signIn")).toEqual({ email: "a@example.com", resendAt: 1 });
  });

  it("normalizes like the API: trimmed, ASCII lower case", () => {
    expect(normalizeEmail("  Fighter@Example.COM ")).toBe("fighter@example.com");
  });
});
