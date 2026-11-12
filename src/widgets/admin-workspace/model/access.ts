import { grants, type Operator } from "@/entities/operator";
import type { TourStep } from "@/features/product-tour";

/**
 * What the Control Plane shows an operator (SF-120), from the backend's permission
 * list only. Presentation, never a gate: each operator endpoint checks permission
 * and key on its own, and a tour or a checklist never adds access.
 *
 * ARW1's "Your access" lists the sections that exist in the backend's permission
 * catalog (simplefit-api ADR 0028). The design's Overview, Users, Gyms, Gym
 * verification and System health have no permission yet, so they are named as
 * "not part of the Control Plane yet", never shown as granted or not granted.
 */
export type AccessRow = "sponsorOrganizations" | "sponsorApplications" | "audit" | "operators";

const ACCESS: Record<AccessRow, readonly string[]> = {
  sponsorOrganizations: ["sponsors.restrict"],
  sponsorApplications: ["sponsors.applications.read"],
  audit: ["audit.read"],
  operators: ["operators.read"],
};

export const ACCESS_ROWS = Object.keys(ACCESS) as AccessRow[];

export function hasAccess(operator: Operator, row: AccessRow): boolean {
  return ACCESS[row].some((permission) => grants(operator, permission));
}

/** AdminNav items (registry keys) for this operator: the overview, then what was granted. */
export function visibleNavItems(operator: Operator): string[] {
  return [
    "overview",
    ...(grants(operator, "gyms.read") ? ["tenants"] : []),
    ...(["users.read", "fighters.read", "coaches.read"].some((permission) =>
      grants(operator, permission),
    )
      ? ["users"]
      : []),
    ...(hasAccess(operator, "sponsorOrganizations") || hasAccess(operator, "sponsorApplications")
      ? ["sponsors"]
      : []),
    ...(grants(operator, "billing.read") ? ["subscriptions", "transactions", "pricing"] : []),
    ...(!grants(operator, "billing.read") && grants(operator, "billing.reconciliation.read")
      ? ["subscriptions"]
      : []),
    ...(hasAccess(operator, "audit") ? ["audit"] : []),
    ...(grants(operator, "config.read") ? ["flags"] : []),
    ...(["system.health.read", "system.jobs.read"].some((permission) =>
      grants(operator, permission),
    )
      ? ["integrations"]
      : []),
    ...(hasAccess(operator, "operators") ? ["staff"] : []),
  ];
}

export type ControlPlaneTourStepId = "welcome" | "sensitive" | "me";

/**
 * ARW1's tour (Claude Design `FirstRunAdmin` state=tour), on real elements only:
 * the access card, the sensitive-actions card and the operator block. The design's
 * Reviews, Accounts, Audit log and System health steps point at pages that don't
 * exist yet, so they are left out (docs/admin-design/sf-120-design-register.md).
 */
export const CONTROL_PLANE_TOUR_STEPS: readonly TourStep<ControlPlaneTourStepId>[] = [
  {
    id: "welcome",
    selector: "[data-tour-target=admin-access]",
    placement: "below",
    spot: { padX: 4, padY: 4, radius: "3xl" },
  },
  {
    id: "sensitive",
    selector: "[data-tour-target=admin-sensitive]",
    placement: "left",
    spot: { padX: 4, padY: 4, radius: "3xl" },
  },
  {
    id: "me",
    selector: "aside [data-tour-target=workspace]",
    placement: "right",
    spot: { padX: 4, padY: 4, radius: "xl" },
  },
];
