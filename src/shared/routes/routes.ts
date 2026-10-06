import { webGuards, webRoutes, webShells } from "./web-routes";

/**
 * Typed access to the canonical web routes (SF-31 registry, generated into
 * ./web-routes.ts). Paths are locale-independent: the i18n `Link` and
 * `redirect` add the locale. Never write a product path by hand; resolve it
 * from its route id here (route-architecture §14).
 */
export type WebRoute = (typeof webRoutes)[number];
export type WebRouteId = WebRoute["id"];
export type WebShell = (typeof webShells)[number];
export type WebShellId = WebShell["id"];
export type WebNavItem = WebShell["navItems"][number];
export type SessionRequirement = WebRoute["session"];
export type Capability = NonNullable<WebRoute["capability"]>;

const routesById = new Map<string, WebRoute>(webRoutes.map((route) => [route.id, route]));

export function webRoute(id: WebRouteId): WebRoute {
  const route = routesById.get(id);
  if (!route) throw new Error(`Unknown web route ${id}`);
  return route;
}

export function isWebRouteId(id: string): id is WebRouteId {
  return routesById.has(id);
}

/** Every web route whose page renders inside `shell`. */
export function shellRoutes(shell: WebShellId): WebRoute[] {
  return webRoutes.filter((route) => route.shell === shell);
}

export function webShell(id: WebShellId): WebShell {
  const shell = webShells.find((candidate) => candidate.id === id);
  if (!shell) throw new Error(`Unknown web shell ${id}`);
  return shell;
}

/**
 * The locale-independent href of a route: named parameters are filled from
 * `params` (each one is required and URL-encoded) and `query` is appended.
 */
export function routeHref(
  id: WebRouteId,
  params: Record<string, string> = {},
  query: Record<string, string> = {},
): string {
  const path = webRoute(id).path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === "") throw new Error(`${id} needs the :${name} parameter`);
    return encodeURIComponent(value);
  });
  const search = new URLSearchParams(query).toString();
  return search ? `${path}?${search}` : path;
}

const segmentsOf = (path: string) => (path === "/" ? [] : path.slice(1).split("/"));

/**
 * The registry route a locale-independent pathname resolves to. Static
 * segments win over parameters (`/sponsor/campaigns/new` before
 * `/sponsor/campaigns/:campaignId`), as in the Next.js router; the catch-all
 * is never returned.
 */
export function matchWebRoute(pathname: string): WebRoute | undefined {
  const target = segmentsOf(pathname.replace(/\/+$/, "") || "/");
  let best: { route: WebRoute; score: number } | undefined;

  for (const route of webRoutes) {
    if (route.nav === "CATCH_ALL") continue;
    const pattern = segmentsOf(route.path);
    if (pattern.length !== target.length) continue;

    let score = 0;
    const matches = pattern.every((segment, index) => {
      if (segment.startsWith(":")) return target[index] !== "";
      score += 1;
      return segment === target[index];
    });
    if (matches && (!best || score > best.score)) best = { route, score };
  }
  return best?.route;
}

/**
 * The navigation item of `shell` that owns `routeId`: the item pointing at
 * the route itself, otherwise at its nearest registry ancestor. Items that
 * share a route are told apart by their query (sponsor Campaigns, Challenges
 * and Events all open `/sponsor/campaigns`).
 */
export function navKeyForRoute(
  shell: WebShellId,
  routeId: WebRouteId | undefined,
  search: URLSearchParams = new URLSearchParams(),
): string | undefined {
  const items: readonly WebNavItem[] = webShell(shell).navItems;
  let current = routeId ? routesById.get(routeId) : undefined;

  while (current) {
    const id = current.id;
    const candidates = items.filter((item) => item.route === id);
    const withQuery = candidates.find(
      (item) =>
        "query" in item &&
        Object.entries(item.query).every(([key, value]) => search.get(key) === value),
    );
    const plain = candidates.find((item) => !("query" in item));
    const owner = withQuery ?? plain;
    if (owner) return owner.key;
    current = current.parent ? routesById.get(current.parent) : undefined;
  }
  return undefined;
}

/** The sign-in route for an area (`/admin/*` and `/sponsor/*` have their own). */
export function signInRouteFor(area: "web" | "web.sponsor" | "web.admin"): WebRouteId {
  return webGuards.signIn[area];
}

export { webGuards };
