import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("joins conditional class names", () => {
    expect(cn("a", false && "b", undefined, ["c", { d: true, e: false }])).toBe("a c d");
  });

  it("lets later Tailwind classes override conflicting earlier ones", () => {
    expect(cn("px-2 py-1 text-sm", "px-4", "text-lg")).toBe("py-1 px-4 text-lg");
  });
});
