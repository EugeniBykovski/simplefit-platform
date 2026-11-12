import { describe, expect, it } from "vitest";

import type { Operator } from "@/entities/operator";

import { hasAccess, visibleNavItems } from "./access";

const operator = (permissions: string[]): Operator => ({
  id: "o",
  status: "active",
  permissions,
  security_keys: { registered: 2, required: 2 },
  step_up: null,
  enrollment_expires_at: null,
  activated_at: null,
});

describe("Control Plane access (SF-120, presentation only)", () => {
  it("lists only the overview for an operator without permissions", () => {
    expect(visibleNavItems(operator([]))).toEqual(["overview"]);
  });

  it("follows the backend's permissions, never more", () => {
    const reviewer = operator(["sponsors.applications.read", "sponsors.applications.claim"]);
    expect(visibleNavItems(reviewer)).toEqual(["overview", "sponsors"]);
    expect(hasAccess(reviewer, "sponsorApplications")).toBe(true);
    expect(hasAccess(reviewer, "audit")).toBe(false);
    expect(hasAccess(reviewer, "operators")).toBe(false);

    const founder = operator([
      "operators.read",
      "operators.manage",
      "audit.read",
      "sponsors.restrict",
    ]);
    expect(visibleNavItems(founder)).toEqual(["overview", "sponsors", "audit", "staff"]);
    expect(visibleNavItems(operator(["users.read"]))).toEqual(["overview", "users"]);
    // SF-123: Gyms with gyms.read; Users with any of the three people permissions.
    expect(visibleNavItems(operator(["gyms.read"]))).toEqual(["overview", "tenants"]);
    expect(visibleNavItems(operator(["fighters.read"]))).toEqual(["overview", "users"]);
    // SF-127: billing pages with billing.read; reconciliation alone opens billing only.
    expect(visibleNavItems(operator(["billing.read"]))).toEqual([
      "overview",
      "subscriptions",
      "transactions",
      "pricing",
    ]);
    expect(visibleNavItems(operator(["billing.reconciliation.read"]))).toEqual([
      "overview",
      "subscriptions",
    ]);
    // SF-126: System health with either operations permission.
    expect(visibleNavItems(operator(["system.jobs.read"]))).toEqual(["overview", "integrations"]);
    expect(visibleNavItems(operator(["coaches.read", "gyms.read"]))).toEqual([
      "overview",
      "tenants",
      "users",
    ]);
    expect(hasAccess(founder, "sponsorOrganizations")).toBe(true);
    expect(hasAccess(founder, "sponsorApplications")).toBe(false);
  });
});
