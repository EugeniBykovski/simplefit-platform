import type { WebRouteId } from "@/shared/routes/routes";

/**
 * Public site header links, as in the landing artboards' header (LandHome,
 * WebSignUp): every target is a registry route; "Enterprise" is the
 * enterprise state of /pricing (PR4, `?role=enterprise`).
 */
export const siteNavigation: readonly {
  key: "fighters" | "coaches" | "gyms" | "pricing" | "marketplace" | "partners" | "enterprise";
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
