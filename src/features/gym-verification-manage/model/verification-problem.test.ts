import { describe, expect, it } from "vitest";

import { ApiError } from "@/shared/api/http/api-error";

import {
  UploadFailedError,
  isVerificationFailure,
  verificationProblem,
  verificationReadProblem,
} from "./verification-problem";

const api = (
  status: number,
  code: string,
  details: Record<string, unknown> = {},
  retry: number | null = null,
) => new ApiError(status, code, code, details, null, retry);

describe("verificationProblem (SF-103)", () => {
  it.each([
    [api(409, "conflict", { revision: "stale", current_revision: 3 }), "stale"],
    [api(409, "conflict", { verification: "submitted" }), "frozen"],
    [api(409, "conflict", { evidence: "upload_pending" }), "uploadPending"],
    [api(409, "conflict", { evidence: "limit_reached" }), "limitReached"],
    [api(409, "conflict", { evidence: "submitted" }), "documentSubmitted"],
    [api(409, "conflict", { upload: "not_found" }), "uploadMissing"],
    [api(409, "conflict", { upload: "mismatch" }), "uploadMismatch"],
    [api(409, "conflict", { setup_status: "draft" }), "draft"],
    [api(422, "validation_error"), "invalid"],
    [api(503, "service_unavailable"), "storageUnavailable"],
    [api(401, "unauthorized"), "session"],
    [api(403, "forbidden"), "forbidden"],
    [api(404, "not_found"), "gone"],
    [api(500, "internal_error"), "unknown"],
    [new UploadFailedError(), "uploadFailed"],
    [new TypeError("network"), "unknown"],
  ])("maps %o to %s", (error, kind) => {
    expect(verificationProblem(error).kind).toBe(kind);
  });

  it("reports rate limits in minutes and reads as loadFailed when the connection dropped", () => {
    expect(verificationProblem(api(429, "rate_limited", {}, 90))).toEqual({
      kind: "limited",
      minutes: 2,
    });
    expect(verificationReadProblem(new TypeError("offline"))).toEqual({ kind: "loadFailed" });
    expect(isVerificationFailure({ kind: "stale" })).toBe(false);
    expect(isVerificationFailure({ kind: "uploadFailed" })).toBe(true);
  });
});
