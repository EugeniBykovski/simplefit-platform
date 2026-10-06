import { describe, expect, it } from "vitest";

import {
  matchWebRoute,
  navKeyForRoute,
  routeHref,
  signInRouteFor,
  webGuards,
  webRoute,
  type WebRouteId,
} from "./routes";
import { webRoutes, webShells } from "./web-routes";

describe("routeHref", () => {
  it("returns the canonical path, filling named parameters and query", () => {
    expect(routeHref("web.app.coach.fighters")).toBe("/app/coach/fighters");
    expect(routeHref("web.app.coach.fighters._fighter-id", { fighterId: "f 1/2" })).toBe(
      "/app/coach/fighters/f%201%2F2",
    );
    expect(routeHref("web.sponsor.campaigns", {}, { type: "challenge" })).toBe(
      "/sponsor/campaigns?type=challenge",
    );
  });

  it("refuses to build a path without its named parameter", () => {
    expect(() => routeHref("web.admin.users._user-id")).toThrow(/:userId/);
  });
});

describe("matchWebRoute", () => {
  it("resolves every registry path to its own route (static segments win)", () => {
    const mismatches = webRoutes
      .filter((route) => route.nav !== "CATCH_ALL")
      .map((route) => {
        const sample = route.path.replace(/:[A-Za-z]+/g, "sample-id");
        return [route.id, matchWebRoute(sample)?.id] as const;
      })
      .filter(([id, matched]) => id !== matched);
    expect(mismatches).toEqual([]);
  });

  it("prefers static routes over parameters", () => {
    expect(matchWebRoute("/sponsor/campaigns/new")?.id).toBe("web.sponsor.campaigns.new");
    expect(matchWebRoute("/sponsor/campaigns/c-9")?.id).toBe("web.sponsor.campaigns._campaign-id");
    expect(matchWebRoute("/admin/sponsors/revenue")?.id).toBe("web.admin.sponsors.revenue");
  });

  it("ignores trailing slashes and never returns the catch-all", () => {
    expect(matchWebRoute("/app/coach/")?.id).toBe("web.app.coach");
    expect(matchWebRoute("/")?.id).toBe("web.root");
    expect(matchWebRoute("/not/a/route")).toBeUndefined();
  });
});

describe("navKeyForRoute", () => {
  it.each([
    ["web.app.fighter", "web.app.home", "home"],
    ["web.app.fighter", "web.app.camp.board", "training"],
    ["web.app.coach", "web.app.coach.fighters._fighter-id", "fighters"],
    ["web.app.coach", "web.app.coach.earnings.transactions", "earnings"],
    ["web.app.gym", "web.app.gym.settings.danger", "settings"],
    ["web.app.gym", "web.app.gym.open-sparring._open-sparring-id", "sparring"],
    ["web.admin", "web.admin.sponsors._sponsor-id.timeline", "sponsors"],
    ["web.admin", "web.admin.support._session-id", "support"],
    ["web.sponsor", "web.sponsor.campaigns.new", "campaigns"],
  ] as const)("%s keeps the owning item active for %s", (shell, route, key) => {
    expect(navKeyForRoute(shell, route)).toBe(key);
  });

  it("tells same-route sponsor items apart by query", () => {
    const at = (query: string) =>
      navKeyForRoute("web.sponsor", "web.sponsor.campaigns", new URLSearchParams(query));
    expect(at("")).toBe("campaigns");
    expect(at("type=challenge")).toBe("challenges");
    expect(at("type=event")).toBe("events");
    expect(at("type=other")).toBe("campaigns");
  });

  it("marks nothing for routes outside the shell's navigation", () => {
    expect(navKeyForRoute("web.app.coach", "web.app.home")).toBeUndefined();
    expect(navKeyForRoute("web.sponsor", "web.sponsor.analytics._campaign-id")).toBeUndefined();
    expect(navKeyForRoute("web.app.gym", undefined)).toBeUndefined();
  });

  it("every routed navigation item points at a registry route", () => {
    const targets = webShells.flatMap((shell) =>
      shell.navItems.flatMap((item) => (item.route ? [item.route as WebRouteId] : [])),
    );
    for (const id of targets) expect(webRoute(id).id).toBe(id);
  });
});

describe("guards", () => {
  it("use the registry's area sign-in routes and entry", () => {
    expect(signInRouteFor("web")).toBe("web.login");
    expect(signInRouteFor("web.sponsor")).toBe("web.sponsor.login");
    expect(signInRouteFor("web.admin")).toBe("web.admin.login");
    expect(webGuards.entry).toBe("web.app");
    expect(webRoute("web.admin.login").session).toBe("GUEST_ONLY");
  });
});
