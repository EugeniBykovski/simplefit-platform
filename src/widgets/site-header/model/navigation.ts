import type { WebRouteId } from "@/shared/routes/routes";

export type SiteNavKey =
  "fighters" | "coaches" | "gyms" | "pricing" | "marketplace" | "partners" | "enterprise";

/**
 * Public site header links, in the order every public-website artboard draws
 * them (Claude Design 1791448557-b0b9). Every target is a registry route;
 * "Enterprise" is the enterprise state of /pricing (PR4, `?role=enterprise`).
 */
export const siteNavigation: readonly {
  key: SiteNavKey;
  route: WebRouteId;
  query?: Record<string, string>;
}[] = [
  { key: "fighters", route: "web.fighters" },
  { key: "coaches", route: "web.coaches" },
  { key: "gyms", route: "web.gyms" },
  { key: "pricing", route: "web.pricing" },
  { key: "marketplace", route: "web.marketplace" },
  { key: "partners", route: "web.partners" },
  { key: "enterprise", route: "web.pricing", query: { role: "enterprise" } },
];

/**
 * The header item each public route marks as current, as the artboards draw
 * it: Pricing on PR1–PR3 and the plan comparison, Enterprise on PR4 and white
 * label, Partners on the partners pages. Home, sign-up and every other route
 * mark none.
 */
const ACTIVE: Partial<Record<WebRouteId, SiteNavKey>> = {
  "web.fighters": "fighters",
  "web.coaches": "coaches",
  "web.gyms": "gyms",
  "web.marketplace": "marketplace",
  "web.pricing": "pricing",
  "web.pricing.compare": "pricing",
  "web.white-label": "enterprise",
  "web.partners": "partners",
  "web.partners.apply": "partners",
};

/** The current header item for a route and its query, if the route has one. */
export function activeSiteNavKey(
  routeId: WebRouteId | undefined,
  search: URLSearchParams = new URLSearchParams(),
): SiteNavKey | undefined {
  if (routeId === undefined) return undefined;
  if (routeId === "web.pricing" && search.get("role") === "enterprise") return "enterprise";
  return ACTIVE[routeId];
}
