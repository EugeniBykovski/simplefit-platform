import { describe, expect, it } from "vitest";

import { parsePublicEnv } from "./env";

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
});
