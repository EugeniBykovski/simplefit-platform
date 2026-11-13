import { describe, expect, it } from "vitest";

import type { Operator } from "@/entities/operator";
import { ApiError } from "@/shared/api/http/api-error";
import { WebAuthnError } from "@/shared/lib/webauthn";

import { ceremonyProblem, decideEnrollment, decideGate } from "./gate";

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

describe("decideGate (AD0, SF-120; SF-157 session assurance)", () => {
  it("assumes nothing before or without an answer", () => {
    expect(decideGate(read(undefined, "pending"))).toEqual({ kind: "checking" });
    expect(decideGate(read(undefined, "error"))).toEqual({ kind: "loadFailed" });
  });

  it("one answer for anyone who isn't an active or pending operator", () => {
    expect(decideGate(read(null))).toEqual({ kind: "unavailable" });
  });

  it("opens for a pending operator without keys and an active one without a key check", () => {
    const pending = operator({
      status: "pending_enrollment",
      security_keys: { registered: 0, required: 2 },
      enrollment_expires_at: at(60_000),
    });
    expect(decideGate(read(pending))).toEqual({ kind: "open", operator: pending });
    const unchecked = operator();
    expect(decideGate(read(unchecked))).toEqual({ kind: "open", operator: unchecked });
    const checked = operator({ step_up: step(60_000) });
    expect(decideGate(read(checked))).toEqual({ kind: "open", operator: checked });
  });
});

describe("decideEnrollment (SF-157: registration when an action needs it)", () => {
  it("pending: register until the backend's required number, unless the window ended", () => {
    const pending = operator({
      status: "pending_enrollment",
      security_keys: { registered: 1, required: 2 },
      enrollment_expires_at: at(60_000),
    });
    expect(decideEnrollment(pending, NOW)).toEqual({ kind: "enroll", registered: 1, required: 2 });
    expect(decideEnrollment({ ...pending, enrollment_expires_at: at(0) }, NOW)).toEqual({
      kind: "enrollmentExpired",
    });
  });

  it("active: nothing left to register", () => {
    expect(decideEnrollment(operator(), NOW)).toEqual({ kind: "registered" });
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
