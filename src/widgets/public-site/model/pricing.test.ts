import { describe, expect, it } from "vitest";

import { COMPARE_ROWS, GYM_PLANS, parseBilling, parsePricingRole } from "./pricing";

describe("pricing URL state", () => {
  it("reads ?role=, falling back to the coach plans (PR1) for anything else", () => {
    expect(parsePricingRole("fighter")).toBe("fighter");
    expect(parsePricingRole("enterprise")).toBe("enterprise");
    for (const value of [undefined, "", "admin", "Gym", ["gym"]]) {
      expect(parsePricingRole(value)).toBe("coach");
    }
  });

  it("reads ?billing=annual; anything else is monthly", () => {
    expect(parseBilling("annual")).toBe("annual");
    for (const value of [undefined, "monthly", "yearly", ["annual"]]) {
      expect(parseBilling(value)).toBe("monthly");
    }
  });
});

describe("plan comparison (PR6)", () => {
  it("has a value for every gym plan in every row", () => {
    expect(COMPARE_ROWS).toHaveLength(15);
    for (const row of COMPARE_ROWS) expect(row.values).toHaveLength(GYM_PLANS.length);
  });
});
