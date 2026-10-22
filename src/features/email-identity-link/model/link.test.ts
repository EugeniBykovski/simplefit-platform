import { describe, expect, it } from "vitest";

import { ApiError } from "@/shared/api/http/api-error";

import {
  canonicalEmail,
  cellsFor,
  confirmFailureOf,
  formatCountdown,
  looksLikeEmail,
  requestFailureOf,
} from "./link";

const api = (status: number, code: string, retryAfter: number | null = null) =>
  new ApiError(status, code, "x", {}, "r", retryAfter);

describe("email identity link mappings (SF-78)", () => {
  it("maps confirmation answers by code, never by message", () => {
    expect(confirmFailureOf(api(422, "code_invalid"))).toEqual({ status: "invalid" });
    expect(confirmFailureOf(api(422, "code_expired"))).toEqual({ status: "expired" });
    expect(confirmFailureOf(api(409, "conflict"))).toEqual({ status: "conflict" });
    expect(confirmFailureOf(api(401, "unauthorized"))).toEqual({ status: "session" });
    expect(confirmFailureOf(api(429, "rate_limited", 30))).toEqual({
      status: "throttled",
      retryAfterSeconds: 30,
    });
  });

  it("treats a lost or unexpected answer as uncertain (reconciled, never shown as success)", () => {
    expect(confirmFailureOf(new TypeError("Failed to fetch"))).toEqual({ status: "uncertain" });
    expect(confirmFailureOf(api(500, "internal_error"))).toEqual({ status: "uncertain" });
  });

  it("maps request failures; the request never reveals who owns an address", () => {
    expect(requestFailureOf(api(422, "validation_error"))).toEqual({ failure: "invalid" });
    expect(requestFailureOf(api(429, "rate_limited", 12))).toEqual({
      failure: "limited",
      retryAfterSeconds: 12,
    });
    expect(requestFailureOf(api(401, "unauthorized"))).toEqual({ failure: "session" });
    expect(requestFailureOf(new Error("offline"))).toEqual({ failure: "error" });
  });

  it("checks the email shape for usability only", () => {
    expect(looksLikeEmail(" fighter@example.com ")).toBe(true);
    expect(looksLikeEmail("fighter@example")).toBe(false);
    expect(looksLikeEmail("not an email")).toBe(false);
  });

  it("finds an address in the identity list the way the API stores it (trim, ASCII lowercase)", () => {
    expect(canonicalEmail("  Fighter.One+Box@Example.COM ")).toBe("fighter.one+box@example.com");
  });

  it("draws the cells per status", () => {
    expect(cellsFor("invalid", "123456")).toBe("error");
    expect(cellsFor("expired", "123456")).toBe("expired");
    expect(cellsFor("throttled", "")).toBe("locked");
    expect(cellsFor("typing", "123")).toBe("typing");
    expect(cellsFor("typing", "123456")).toBe("filled");
    expect(formatCountdown(42)).toBe("0:42");
    expect(formatCountdown(60)).toBe("1:00");
  });
});
