import { describe, expect, it } from "vitest";

import { parsePublicEnv } from "./env";

const API_URL = "https://api.simplefit.test";
const CLIENT_ID = "123456789012-abc123def456.apps.googleusercontent.com";

describe("parsePublicEnv", () => {
  it("accepts an http(s) API URL and strips trailing slashes", () => {
    expect(parsePublicEnv({ NEXT_PUBLIC_API_URL: "https://api.simplefit.test//" })).toEqual({
      NEXT_PUBLIC_API_URL: "https://api.simplefit.test",
    });
  });

  it("rejects a missing API URL", () => {
    expect(() => parsePublicEnv({})).toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it("rejects non-http protocols", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_API_URL: "ftp://api.simplefit.test" })).toThrow(
      /http\(s\) URL/,
    );
  });

  it("accepts a trimmed Google client ID", () => {
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_API_URL: API_URL,
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: ` ${CLIENT_ID} `,
      }).NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    ).toBe(CLIENT_ID);
  });

  it.each([undefined, "", "  "])("treats %j as no Google client ID", (value) => {
    expect(
      parsePublicEnv({ NEXT_PUBLIC_API_URL: API_URL, NEXT_PUBLIC_GOOGLE_CLIENT_ID: value })
        .NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    ).toBeUndefined();
  });

  it.each(["not-a-client-id", "GOCSPX-secret", `${CLIENT_ID}.evil.test`])(
    "rejects the malformed Google client ID %j",
    (value) => {
      expect(() =>
        parsePublicEnv({ NEXT_PUBLIC_API_URL: API_URL, NEXT_PUBLIC_GOOGLE_CLIENT_ID: value }),
      ).toThrow(/NEXT_PUBLIC_GOOGLE_CLIENT_ID/);
    },
  );

  it("accepts the Apple Services ID and an https return URL", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_API_URL: API_URL,
      NEXT_PUBLIC_APPLE_SERVICES_ID: " com.simplefit.boxing.web ",
      NEXT_PUBLIC_APPLE_REDIRECT_URI: "https://app.example.com/login",
    });
    expect(env.NEXT_PUBLIC_APPLE_SERVICES_ID).toBe("com.simplefit.boxing.web");
    expect(env.NEXT_PUBLIC_APPLE_REDIRECT_URI).toBe("https://app.example.com/login");
  });

  it("treats blank Apple values as not configured", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_API_URL: API_URL,
      NEXT_PUBLIC_APPLE_SERVICES_ID: "",
      NEXT_PUBLIC_APPLE_REDIRECT_URI: " ",
    });
    expect(env.NEXT_PUBLIC_APPLE_SERVICES_ID).toBeUndefined();
    expect(env.NEXT_PUBLIC_APPLE_REDIRECT_URI).toBeUndefined();
  });

  it.each([
    ["NEXT_PUBLIC_APPLE_SERVICES_ID", "simplefit"],
    ["NEXT_PUBLIC_APPLE_SERVICES_ID", "com.simplefit web"],
    ["NEXT_PUBLIC_APPLE_REDIRECT_URI", "http://localhost:3000/login"],
    ["NEXT_PUBLIC_APPLE_REDIRECT_URI", "not a url"],
  ])("rejects a malformed %s (%j)", (name, value) => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_API_URL: API_URL, [name]: value })).toThrow(
      new RegExp(name),
    );
  });
});
