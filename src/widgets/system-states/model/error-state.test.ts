import { describe, expect, it } from "vitest";

import { ApiError } from "@/shared/api/http/api-error";

import { failureFor, isRetryable } from "./error-state";

const api = (status: number) => new ApiError(status, "code", "internal detail", {}, "req-1");

describe("failureFor", () => {
  it("maps API statuses to the failure states", () => {
    expect(failureFor(api(401))).toBe("unauthorized");
    expect(failureFor(api(403))).toBe("forbidden");
    expect(failureFor(api(503))).toBe("unavailable");
    expect(failureFor(api(500))).toBe("unexpected");
    expect(failureFor(api(404))).toBe("unexpected");
  });

  it("treats an unreachable network as offline", () => {
    expect(failureFor(new TypeError("Failed to fetch"))).toBe("offline");
    expect(failureFor(new Error("boom"), false)).toBe("offline");
  });

  it("falls back to unexpected for anything else", () => {
    expect(failureFor(new Error("boom"), true)).toBe("unexpected");
    expect(failureFor("weird", true)).toBe("unexpected");
  });

  it("does not offer a retry where it cannot help", () => {
    expect(isRetryable("forbidden")).toBe(false);
    expect(
      ["unexpected", "offline", "unavailable"].every((kind) => isRetryable(kind as never)),
    ).toBe(true);
  });
});
