import { describe, expect, it } from "vitest";

import { ApiError } from "./http/api-error";
import { shouldRetry } from "./query-client";

const apiError = (status: number) => new ApiError(status, "code", "message", {}, null);

describe("shouldRetry", () => {
  it("never retries client errors", () => {
    expect(shouldRetry(0, apiError(404))).toBe(false);
    expect(shouldRetry(0, apiError(422))).toBe(false);
  });

  it("retries server and network errors a bounded number of times", () => {
    expect(shouldRetry(0, apiError(503))).toBe(true);
    expect(shouldRetry(1, new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetry(2, apiError(503))).toBe(false);
  });
});
