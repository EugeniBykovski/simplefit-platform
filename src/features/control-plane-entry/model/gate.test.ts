import { describe, expect, it } from "vitest";

import type { Operator } from "@/entities/operator";
import { ApiError } from "@/shared/api/http/api-error";
import { WebAuthnError } from "@/shared/lib/webauthn";

import { ceremonyProblem, decideGate } from "./gate";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const operator = (overrides: Partial<Operator> = {}): Operator => ({
  id: "o",
  status: "active",
  permissions: [],
  security_keys: { registered: 2, required: 2 },
  step_up: null,
  enrollment_expires_at: null,
  activated_at: at(-1),
  ...overrides,
});
const step = (expiresIn: number) => ({
  verified_at: at(-1),
  expires_at: at(expiresIn),
  fresh_seconds_remaining: 0,
});
const read = (
  data: Operator | null | undefined,
  status: "pending" | "error" | "success" = "success",
) => ({
  status,
  data,
});
const apiError = (status: number, code: string, details: Record<string, unknown> = {}) =>
  new ApiError(status, code, "x", details, null);

describe("decideGate (AD0, SF-120)", () => {
  it("assumes nothing before or without an answer", () => {
    expect(decideGate(read(undefined, "pending"), NOW, false)).toEqual({ kind: "checking" });
    expect(decideGate(read(undefined, "error"), NOW, false)).toEqual({ kind: "loadFailed" });
  });

  it("one answer for anyone who isn't an active or pending operator", () => {
    expect(decideGate(read(null), NOW, false)).toEqual({ kind: "unavailable" });
  });

  it("pending: enrol until the backend's required number, unless the window ended", () => {
    const pending = operator({
      status: "pending_enrollment",
      security_keys: { registered: 1, required: 2 },
      enrollment_expires_at: at(60_000),
    });
    expect(decideGate(read(pending), NOW, false)).toEqual({
      kind: "enroll",
      registered: 1,
      required: 2,
    });
    expect(decideGate(read({ ...pending, enrollment_expires_at: at(0) }), NOW, false)).toEqual({
      kind: "enrollmentExpired",
    });
  });

  it("opens only with a key check that hasn't lapsed", () => {
    const open = operator({ step_up: step(60_000) });
    expect(decideGate(read(open), NOW, false)).toEqual({ kind: "open", operator: open });
    expect(decideGate(read(operator()), NOW, false)).toEqual({ kind: "key", lapsed: false });
    expect(decideGate(read(operator({ step_up: step(0) })), NOW, false)).toEqual({
      kind: "key",
      lapsed: true,
    });
    // Ended while the page was open (another tab, expiry read back as null).
    expect(decideGate(read(operator()), NOW, true)).toEqual({ kind: "key", lapsed: true });
  });
});

describe("ceremonyProblem", () => {
  it("branches on codes and browser reasons, never messages", () => {
    expect(ceremonyProblem(new WebAuthnError("cancelled"))).toBe("failed");
    expect(ceremonyProblem(new WebAuthnError("unsupported"))).toBe("unsupported");
    expect(ceremonyProblem(new WebAuthnError("duplicate"))).toBe("duplicate");
    expect(ceremonyProblem(apiError(422, "security_key_rejected"))).toBe("rejected");
    expect(ceremonyProblem(apiError(429, "rate_limited"))).toBe("rateLimited");
    expect(ceremonyProblem(apiError(503, "service_unavailable"))).toBe("serviceUnavailable");
    expect(ceremonyProblem(apiError(409, "conflict", { enrollment: "expired" }))).toBe(
      "enrollmentExpired",
    );
    expect(ceremonyProblem(apiError(409, "conflict", { credential: "already_registered" }))).toBe(
      "duplicate",
    );
    expect(ceremonyProblem(apiError(404, "not_found"))).toBe("stale");
    expect(ceremonyProblem(apiError(403, "step_up_required"))).toBe("stale");
    expect(ceremonyProblem(new Error("network"))).toBe("failed");
  });
});
