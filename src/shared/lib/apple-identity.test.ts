import { describe, expect, it } from "vitest";

import { isAppleCancellation, randomToken, sha256Hex } from "./apple-identity";

describe("Apple JS helpers", () => {
  it("makes unpredictable base64url tokens of the requested strength", () => {
    const nonce = randomToken();
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(new Set(Array.from({ length: 50 }, () => randomToken())).size).toBe(50);
  });

  it("hashes the raw nonce as lowercase hex SHA-256 (what Apple receives)", async () => {
    await expect(sha256Hex("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("recognises user cancellation only", () => {
    expect(isAppleCancellation({ error: "popup_closed_by_user" })).toBe(true);
    expect(isAppleCancellation({ error: "user_cancelled_authorize" })).toBe(true);
    expect(isAppleCancellation({ error: "invalid_client" })).toBe(false);
    expect(isAppleCancellation(new Error("boom"))).toBe(false);
    expect(isAppleCancellation(undefined)).toBe(false);
  });
});
