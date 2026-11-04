import { describe, expect, it } from "vitest";

import { cn, isUuid } from "./utils";

describe("cn", () => {
  it("joins conditional class names", () => {
    expect(cn("a", false && "b", undefined, ["c", { d: true, e: false }])).toBe("a c d");
  });

  it("lets later Tailwind classes override conflicting earlier ones", () => {
    expect(cn("rounded-md px-2 py-1", "px-4", "rounded-lg")).toBe("py-1 px-4 rounded-lg");
  });
});

describe("isUuid (SF-104)", () => {
  it("accepts UUIDs and refuses anything that could change an API path", () => {
    expect(isUuid("3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64")).toBe(true);
    expect(isUuid("3D0A7F52-1C8E-4B6A-9F20-5E7D1B3C9A64")).toBe(true);
    for (const value of [
      "",
      "..",
      "../me",
      "..%2Fme",
      "abc",
      "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64/x",
      " 3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64",
    ]) {
      expect(isUuid(value), value).toBe(false);
    }
  });
});
