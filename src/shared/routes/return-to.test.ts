import { describe, expect, it } from "vitest";

import { returnToOf, sanitizeReturnTo, withReturnTo } from "./return-to";

describe("sanitizeReturnTo", () => {
  it.each([
    ["/app", "/app"],
    ["/app/home", "/app/home"],
    ["/app/messages?thread=42", "/app/messages?thread=42"],
    ["/app/payments/pay_123", "/app/payments/pay_123"],
    ["/app/home#section", "/app/home"],
    ["/en/app/home?tab=1", "/app/home?tab=1"],
    ["/es-MX/app/home", "/app/home"],
    ["/app/home/", "/app/home/"],
    ["/pricing", "/pricing"],
    ["/app/./home", "/app/home"],
  ])("keeps %s as %s", (input, expected) => {
    expect(sanitizeReturnTo(input)).toBe(expected);
  });

  it.each([
    // Open redirects and protocol URLs
    ["absolute URL", "https://evil.example/app"],
    ["protocol-relative", "//evil.example/app"],
    ["backslash host", "/\\evil.example"],
    ["backslashes", "\\\\evil.example"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["scheme without slashes", "http:evil.example"],
    ["relative path", "app/home"],
    // Whitespace and control characters
    ["leading space", " /app"],
    ["tab", "/app\t/home"],
    ["newline", "/app\n"],
    ["NUL", "/app\u0000"],
    // Encodings are decoded once by the query parser, never again here
    ["encoded scheme", "%2F%2Fevil.example"],
    ["encoded slashes are no route", "/%2F%2Fevil.example"],
    ["encoded backslash is no route", "/%5Cevil.example"],
    ["dot segments into a locale-stripped //", "/en//evil.example"],
    // Malformed or unknown
    ["empty", ""],
    ["unknown route", "/definitely-not-a-route"],
    ["too long", `/app?q=${"a".repeat(2100)}`],
    // Guest-only routes: no login loop
    ["sign-in", "/login"],
    ["sign-in code", "/login/code?x=1"],
    ["sign-up", "/signup"],
    ["sign-up verify", "/signup/verify"],
    ["localized sign-in", "/de/login"],
    ["dot segments into sign-in", "/app/../login"],
    // Onboarding, restricted, not-found, verification link
    ["onboarding", "/app/onboarding/fighter"],
    ["suspended", "/account/suspended"],
    ["pending deletion", "/account/pending-deletion"],
    ["verification link", "/verify-email"],
  ])("rejects %s", (_name, input) => {
    expect(sanitizeReturnTo(input)).toBeUndefined();
  });

  it.each([undefined, null, 42, ["/app"], { href: "/app" }])("rejects non-string %j", (input) => {
    expect(sanitizeReturnTo(input)).toBeUndefined();
  });
});

describe("withReturnTo", () => {
  it("carries a valid returnTo to the next auth route", () => {
    expect(withReturnTo("web.login.code", "/app/messages?thread=1")).toBe(
      "/login/code?returnTo=%2Fapp%2Fmessages%3Fthread%3D1",
    );
  });

  it("drops an invalid one", () => {
    expect(withReturnTo("web.signup", "//evil.example")).toBe("/signup");
    expect(withReturnTo("web.signup", undefined)).toBe("/signup");
  });
});

describe("returnToOf", () => {
  it("reads and validates the returnTo query parameter", () => {
    expect(returnToOf("?returnTo=%2Fapp%2Fhome")).toBe("/app/home");
    expect(returnToOf("?returnTo=https%3A%2F%2Fevil.example")).toBeUndefined();
    expect(returnToOf("")).toBeUndefined();
  });
});
