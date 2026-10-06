import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * Guards for the canonical route registry (docs/route-architecture.md, SF-31):
 * the registry is well formed, its references resolve, and this repository's
 * router matches the routes the registry marks as implemented.
 * docs/route-registry.json is identical in simplefit-platform and
 * simplefit-mobile; this file mirrors scripts/route-registry.test.js there,
 * except for the router checks at the end.
 *
 * Each check collects every violation, so a failure lists all of them.
 */
// Vitest runs from the repository root.
const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const THIS_PLATFORM = "web";
const registry = JSON.parse(read("docs/route-registry.json"));
const architecture = read("docs/route-architecture.md");

const PLATFORMS = ["web", "mobile"];
const SURFACES = [
  "SITE",
  "AUTH",
  "ONBOARDING",
  "FIGHTER",
  "COACH",
  "GYM",
  "SPONSOR",
  "ADMIN",
  "SHARED",
  "SYSTEM",
  "INTERNAL",
];
const SESSIONS = ["PUBLIC", "GUEST_ONLY", "AUTHENTICATED"];
const CAPABILITIES = ["FIGHTER", "COACH", "GYM_WORKSPACE", "SPONSOR_WORKSPACE", "ADMIN"];
const PHASES = ["ONBOARDING", "ACTIVE"];
const STATUSES = ["IMPLEMENTED", "PLACEHOLDER_REQUIRED", "DEFERRED"];
const NAV_TYPES = ["NAV_ITEM", "STACK", "WIZARD", "STANDALONE", "ENTRY", "CATCH_ALL", "REDIRECT"];
const DISCREPANCY_STATUSES = ["RESOLVED", "NEEDS_PRODUCT_DECISION", "DEFERRED"];
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const GALLERY_ARTBOARDS = [
  "GalleryIndex.dc.html",
  "GalleryIndex2.dc.html",
  "GalleryIndex4.dc.html",
];

const ROUTE_ID = /^(web|mobile)\.[a-z0-9_-]+(\.[a-z0-9_-]+)*$/;
const SEGMENT = /^([a-z0-9]+(-[a-z0-9]+)*|:[a-z][a-zA-Z0-9]*)$/;
const ARTBOARD = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.dc\.html$/;

const { routes, screens, shells, api, outputs, discrepancies, excludedRows, designGaps } = registry;
const routeById = new Map(routes.map((route) => [route.id, route]));
const shellById = new Map(shells.map((shell) => [shell.id, shell]));
const discrepancyIds = new Set(discrepancies.map((entry) => entry.id));
const gapIds = new Set(designGaps.map((gap) => gap.id));

const duplicates = (values) => values.filter((value, index) => values.indexOf(value) !== index);
const segments = (path) => (path === "/" ? [] : path.slice(1).split("/"));
const pathParams = (path) =>
  segments(path)
    .filter((segment) => segment.startsWith(":"))
    .map((segment) => segment.slice(1));
const filled = (value) => typeof value === "string" && value.trim() !== "";

/** Runs `check(item, report)` for every item and returns the reported problems. */
const problems = (items, check) => {
  const found = [];
  for (const item of items) check(item, (message) => found.push(`${item.id}: ${message}`));
  return found;
};

describe("route registry source", () => {
  it("names the canonical artifact and the three Route Gallery artboards", () => {
    expect(registry.source.artifact).toBe("https://claude.ai/artifact/JEsBg51MjX8KiHWEro8omY");
    expect(registry.source.version).toMatch(/^\d+-[0-9a-f]+$/);
    expect(registry.source.galleries.map((gallery) => gallery.artboard)).toEqual(GALLERY_ARTBOARDS);
  });

  it("accounts for every Route Gallery row exactly once", () => {
    const rows = registry.source.galleries.reduce((sum, gallery) => sum + gallery.rows, 0);
    // One gallery row can list several endpoints ("GET /feed · POST /shared-sessions").
    const apiRows = new Set(
      api.filter((entry) => entry.design).map((entry) => `${entry.design.section}|${entry.name}`),
    );
    expect(screens.length + excludedRows.length + outputs.length + apiRows.size).toBe(rows);
  });
});

describe("routes", () => {
  it("have unique, well-formed ids and unique paths per platform", () => {
    expect(duplicates(routes.map((route) => route.id))).toEqual([]);
    expect(duplicates(routes.map((route) => `${route.platform} ${route.path}`))).toEqual([]);
    const found = problems(routes, (route, report) => {
      if (!ROUTE_ID.test(route.id)) report("malformed id");
      if (!PLATFORMS.includes(route.platform)) report(`unknown platform ${route.platform}`);
      else if (!route.id.startsWith(`${route.platform}.`))
        report("id does not start with its platform");
    });
    expect(found).toEqual([]);
  });

  it("use canonical paths with explicit, named parameters", () => {
    const found = problems(routes, (route, report) => {
      if (route.path === "/" || route.path === "/*") {
        if (route.params.length > 0) report("root or catch-all with params");
        return;
      }
      for (const segment of segments(route.path)) {
        if (!SEGMENT.test(segment)) report(`malformed segment "${segment}"`);
      }
      if (/[?#]|\/$/.test(route.path)) report("query, fragment or trailing slash in path");
      if (/:id(\/|$)/.test(route.path)) report("generic :id parameter");
      if (JSON.stringify(route.params) !== JSON.stringify(pathParams(route.path))) {
        report(`params ${JSON.stringify(route.params)} do not match the path`);
      }
      if (duplicates(route.params).length > 0) report("repeated parameter name");
    });
    expect(found).toEqual([]);
  });

  it("carry valid metadata", () => {
    const found = problems(routes, (route, report) => {
      if (!filled(route.name)) report("missing name");
      if (!SURFACES.includes(route.surface)) report(`unknown surface ${route.surface}`);
      if (!STATUSES.includes(route.status)) report(`unknown status ${route.status}`);
      if (!NAV_TYPES.includes(route.nav?.type)) report(`unknown nav type ${route.nav?.type}`);
      const shell = shellById.get(route.shell);
      if (!shell) report(`unknown shell ${route.shell}`);
      else if (shell.platform !== route.platform)
        report(`shell ${shell.id} is on another platform`);
    });
    expect(found).toEqual([]);
  });

  it("compose access from session, capability and phase consistently", () => {
    const found = problems(routes, ({ access }, report) => {
      if (!SESSIONS.includes(access.session)) report(`unknown session ${access.session}`);
      if (access.capability !== null) {
        if (!CAPABILITIES.includes(access.capability))
          report(`unknown capability ${access.capability}`);
        if (access.session !== "AUTHENTICATED") report("capability without AUTHENTICATED session");
        if (!PHASES.includes(access.phase))
          report(`capability route needs a phase, got ${access.phase}`);
      } else if (access.phase !== null) {
        if (access.phase !== "ONBOARDING" || access.session !== "AUTHENTICATED") {
          report("only authenticated account onboarding may set a phase without a capability");
        }
      }
      if ("restrictedAccount" in access) {
        if (access.restrictedAccount !== true || access.session !== "AUTHENTICATED") {
          report("restrictedAccount must be true on an AUTHENTICATED route");
        }
      }
    });
    expect(found).toEqual([]);
  });

  it("have parents on the same platform whose path is an ancestor", () => {
    const found = problems(routes, (route, report) => {
      if (route.parent === null) return;
      const parent = routeById.get(route.parent);
      if (!parent) report(`unknown parent ${route.parent}`);
      else if (parent.platform !== route.platform) report("parent on another platform");
      else if (!route.path.startsWith(`${parent.path}/`))
        report(`parent path ${parent.path} is not an ancestor`);
    });
    expect(found).toEqual([]);
  });

  it("link navigation items to existing shells", () => {
    const found = problems(routes, (route, report) => {
      for (const item of route.nav.from) {
        const [shell, key] = item.split("#");
        if (shellById.get(shell)?.platform !== route.platform)
          report(`nav item ${item} has no shell here`);
        if (!/^[a-z]+$/.test(key ?? "")) report(`malformed nav item ${item}`);
      }
      if (route.nav.type === "NAV_ITEM" && route.nav.from.length === 0)
        report("NAV_ITEM without nav items");
    });
    expect(found).toEqual([]);
  });

  it("redirect only to a route of the same platform", () => {
    const found = problems(routes, (route, report) => {
      const isRedirect = route.nav.type === "REDIRECT";
      if (isRedirect !== (route.redirect !== undefined))
        report("REDIRECT type and redirect field disagree");
      if (!isRedirect) return;
      const target = routeById.get(route.redirect.to);
      if (target?.platform !== route.platform)
        report(`redirect target ${route.redirect.to} missing`);
      else if (target.nav.type === "REDIRECT") report("redirect chain");
    });
    expect(found).toEqual([]);
  });

  it("record their implementation status", () => {
    const found = problems(routes, (route, report) => {
      if (route.status === "IMPLEMENTED" && !/^src\//.test(route.production?.file ?? "")) {
        report("IMPLEMENTED without production.file");
      }
      if (route.status !== "IMPLEMENTED" && route.production !== undefined)
        report("production on a route not implemented");
      if (route.status === "DEFERRED" && !(route.discrepancies?.length > 0))
        report("DEFERRED without a discrepancy");
      for (const id of route.discrepancies ?? []) {
        if (!discrepancyIds.has(id)) report(`unknown discrepancy ${id}`);
      }
    });
    expect(found).toEqual([]);
  });
});

describe("excluded gallery rows", () => {
  it("are dropped only by a recorded decision and never reused as screens", () => {
    const screenIds = new Set(screens.map((screen) => screen.id));
    const found = problems(excludedRows, (row, report) => {
      if (screenIds.has(row.id)) report("also listed as a screen");
      if (!discrepancyIds.has(row.decision)) report(`unknown decision ${row.decision}`);
      if (!filled(row.reason) || !filled(row.galleryPath)) report("missing reason or galleryPath");
      if (!ARTBOARD.test(row.design?.artboard ?? "")) report("missing artboard");
    });
    expect(found).toEqual([]);
  });
});

describe("screens", () => {
  it("are unique and each belongs to exactly one route", () => {
    expect(duplicates(screens.map((screen) => screen.id))).toEqual([]);
    expect(duplicates(screens.map((screen) => screen.code).filter(Boolean))).toEqual([]);
    const listed = routes.flatMap((route) => route.screens);
    expect(duplicates(listed)).toEqual([]);
    expect([...listed].sort()).toEqual(screens.map((screen) => screen.id).sort());
    const found = problems(screens, (screen, report) => {
      if (!routeById.get(screen.route)?.screens.includes(screen.id))
        report(`not listed by route ${screen.route}`);
    });
    expect(found).toEqual([]);
  });

  it("trace back to a Route Gallery row and artboard", () => {
    const galleries = registry.source.galleries.map((gallery) => gallery.id);
    const found = problems(screens, (screen, report) => {
      if (!filled(screen.name)) report("missing name");
      if (!galleries.includes(screen.design?.gallery))
        report(`unknown gallery ${screen.design?.gallery}`);
      if (!ARTBOARD.test(screen.design?.artboard ?? "")) report("missing or malformed artboard");
    });
    expect(found).toEqual([]);
  });

  it("exist for every product route and never for internal or redirect ones", () => {
    const found = problems(routes, (route, report) => {
      const screenless = route.surface === "INTERNAL" || route.nav.type === "REDIRECT";
      if (screenless && route.screens.length > 0) report("INTERNAL or REDIRECT route with screens");
      if (!screenless && route.screens.length === 0)
        report("product route without a screen (orphan)");
    });
    expect(found).toEqual([]);
  });

  it("select their state by query or a known session condition", () => {
    const found = problems(screens, (screen, report) => {
      if ("condition" in screen && screen.condition !== "NO_SESSION") {
        report(`unknown condition ${screen.condition}`);
      }
    });
    expect(found).toEqual([]);
  });
});

describe("shells, capabilities and guards", () => {
  it("form a tree per platform", () => {
    expect(duplicates(shells.map((shell) => shell.id))).toEqual([]);
    const found = problems(shells, (shell, report) => {
      if (!STATUSES.includes(shell.status)) report(`unknown status ${shell.status}`);
      if (shell.status === "IMPLEMENTED" && !shell.production?.file)
        report("IMPLEMENTED without production.file");
      if (shell.parent !== null && shellById.get(shell.parent)?.platform !== shell.platform) {
        report(`parent ${shell.parent} missing or on another platform`);
      }
    });
    expect(found).toEqual([]);
  });

  it("list every nav item with a route, a design gap or an explicit note", () => {
    const found = [];
    for (const shell of shells.filter((candidate) => candidate.navItems)) {
      for (const item of shell.navItems) {
        const where = `${shell.id}#${item.key}`;
        if (!filled(item.label)) found.push(`${where}: missing label`);
        if (item.route) {
          const route = routeById.get(item.route);
          if (route?.platform !== shell.platform)
            found.push(`${where}: unknown route ${item.route}`);
          else if (!route.nav.from.includes(where))
            found.push(`${where}: ${route.id} lacks it in nav.from`);
          else if (route.params.length > 0) found.push(`${where}: ${route.id} needs parameters`);
        } else if (item.designGap) {
          if (!gapIds.has(item.designGap))
            found.push(`${where}: unknown design gap ${item.designGap}`);
        } else if (!filled(item.note)) {
          found.push(`${where}: no route, design gap or note`);
        }
      }
    }
    const listed = new Set(
      shells.flatMap((shell) =>
        (shell.navItems ?? [])
          .filter((item) => item.route)
          .map((item) => `${shell.id}#${item.key}`),
      ),
    );
    for (const route of routes) {
      for (const item of route.nav.from) {
        if (!listed.has(item)) found.push(`${route.id}: nav.from ${item} is not a shell nav item`);
      }
    }
    expect(found).toEqual([]);
  });

  it("point at existing routes of the right platform", () => {
    const found = [];
    const check = (where, id, platform) => {
      if (id !== null && routeById.get(id)?.platform !== platform) found.push(`${where}: ${id}`);
    };
    for (const capability of CAPABILITIES) {
      const entry = registry.capabilities[capability];
      if (!entry) {
        found.push(`capabilities.${capability} missing`);
        continue;
      }
      for (const platform of PLATFORMS) {
        check(`${capability}.home.${platform}`, entry.home[platform], platform);
        check(`${capability}.onboarding.${platform}`, entry.onboarding[platform], platform);
      }
    }
    const { guards } = registry;
    for (const [area, id] of Object.entries(guards.signIn))
      check(`signIn.${area}`, id, area.split(".")[0]);
    for (const platform of PLATFORMS) {
      check(
        `defaultDestinationFallback.${platform}`,
        guards.defaultDestinationFallback[platform],
        platform,
      );
      check(`workspaceChooser.${platform}`, guards.workspaceChooser[platform], platform);
      check(`notFound.${platform}`, guards.notFound[platform], platform);
      check(`entry.${platform}`, guards.entry[platform], platform);
      for (const id of guards.accountOnboarding[platform])
        check(`accountOnboarding.${platform}`, id, platform);
      check(`suspended.${platform}`, guards.restrictedAccount.suspended[platform], platform);
      check(
        `pendingDeletion.${platform}`,
        guards.restrictedAccount.pendingDeletion[platform],
        platform,
      );
    }
    expect(found).toEqual([]);
  });
});

describe("backend inventory", () => {
  it("lists endpoints without duplicates or invented contracts", () => {
    expect(duplicates(api.map((entry) => entry.id))).toEqual([]);
    expect(duplicates(api.map((entry) => `${entry.method} ${entry.path}`))).toEqual([]);
    const found = problems(api, (entry, report) => {
      if (!HTTP_METHODS.includes(entry.method)) report(`unknown method ${entry.method}`);
      if (!entry.path.startsWith("/api/")) report("path outside /api");
      if (!STATUSES.includes(entry.status)) report(`unknown status ${entry.status}`);
      if (entry.status === "IMPLEMENTED" && !entry.production?.file)
        report("IMPLEMENTED without production.file");
      // Proposed endpoints are design inventory; OpenAPI stays canonical (D-BACKEND-PROPOSED).
      if (entry.status === "DEFERRED" && entry.openapi !== null)
        report("DEFERRED endpoint claims an OpenAPI operation");
    });
    expect(found).toEqual([]);
  });

  it("keeps server outputs separate from UI routes", () => {
    expect(duplicates(outputs.map((output) => output.id))).toEqual([]);
    const found = problems(outputs, (output, report) => {
      if (output.status !== "DEFERRED") report(`unexpected status ${output.status}`);
    });
    expect(found).toEqual([]);
  });
});

describe("approved SF-31 decisions", () => {
  const route = (id) => routeById.get(id);
  const pathsOf = (platform) => routes.filter((r) => r.platform === platform).map((r) => r.path);

  it("keep the canonical paths and drop the rejected aliases", () => {
    expect(route("mobile.onboarding.role")?.path).toBe("/onboarding/role");
    expect(route("mobile.profile.fighter._fighter-id")?.path).toBe("/profile/fighter/:fighterId");
    expect(route("mobile.shared-session._shared-session-id")?.path).toBe(
      "/shared-session/:sharedSessionId",
    );
    expect(route("web.app.coach.sessions.new")?.path).toBe("/app/coach/sessions/new");
    expect(pathsOf("mobile")).not.toEqual(expect.arrayContaining(["/auth"]));
    expect(pathsOf("mobile")).not.toEqual(
      expect.arrayContaining(["/shared-session", "/profile/fighter"]),
    );
    expect(pathsOf("web")).not.toEqual(expect.arrayContaining(["/app/coach/programs/new"]));
    const adminSingular = pathsOf("web").filter((path) =>
      /^\/admin\/(sponsor|campaign)(\/|$)/.test(path),
    );
    expect(adminSingular).toEqual([]);
    expect(route("web.app.camp")?.redirect?.to).toBe("web.app.camp.board");
  });

  it("keep the approved access model", () => {
    expect(route("web.admin.login")?.access.session).toBe("GUEST_ONLY");
    expect(route("mobile.checkout")?.access).toMatchObject({ session: "PUBLIC", capability: null });
    expect(registry.guards.workspaceChooser.web).toBeNull();
    const workspaceIdsInPaths = routes.filter(({ params }) =>
      params.some((name) => ["workspaceId", "sponsorWorkspaceId"].includes(name)),
    );
    expect(workspaceIdsInPaths.map((r) => r.id)).toEqual([]);
    const mobileSponsorOrAdmin = routes.filter(
      (r) => r.platform === "mobile" && ["SPONSOR", "ADMIN"].includes(r.surface),
    );
    expect(mobileSponsorOrAdmin.map((r) => r.id)).toEqual([]);
  });

  it("keep web account pages account-level", () => {
    const account = routes.filter((r) => r.platform === "web" && r.path.startsWith("/account/"));
    expect(account.length).toBeGreaterThan(0);
    const found = problems(account, (r, report) => {
      if (r.shell !== "web.account") report(`shell ${r.shell}`);
      if (r.surface !== "SHARED") report(`surface ${r.surface}`);
      if (r.access.capability !== null || r.access.phase !== null)
        report("capability or phase set");
      if (r.access.session !== "AUTHENTICATED" || r.access.restrictedAccount !== true) {
        report("must be an AUTHENTICATED restrictedAccount route");
      }
    });
    expect(found).toEqual([]);
    const misplaced = routes.filter(
      (r) => r.shell === "web.account" && !r.path.startsWith("/account/"),
    );
    expect(misplaced.map((r) => r.id)).toEqual([]);
    expect(pathsOf("web").filter((path) => path.startsWith("/app/account"))).toEqual([]);
  });

  it("represent sponsor Challenges and Events as query states, not routes", () => {
    const sponsorNav = shells.find((shell) => shell.id === "web.sponsor").navItems;
    for (const [key, type] of [
      ["challenges", "challenge"],
      ["events", "event"],
    ]) {
      expect(sponsorNav.find((item) => item.key === key)).toMatchObject({
        route: "web.sponsor.campaigns",
        query: { type },
      });
    }
    expect(pathsOf("web")).not.toEqual(
      expect.arrayContaining(["/sponsor/challenges", "/sponsor/events", "/sponsor/creative"]),
    );
  });

  it("leave the sponsor analytics index as an unresolved design gap", () => {
    expect(gapIds.has("GAP-SPONSOR-ANALYTICS-INDEX")).toBe(true);
    expect(pathsOf("web")).not.toEqual(expect.arrayContaining(["/sponsor/analytics"]));
    expect(route("web.sponsor.analytics._campaign-id")?.path).toBe(
      "/sponsor/analytics/:campaignId",
    );
  });

  it("link every design gap to the nav items that wait for it", () => {
    const items = new Map(
      shells.flatMap((shell) =>
        (shell.navItems ?? []).map((item) => [`${shell.id}#${item.key}`, item]),
      ),
    );
    const found = problems(designGaps, (gap, report) => {
      for (const key of gap.navItems) {
        if (items.get(key)?.designGap !== gap.id) report(`nav item ${key} does not wait for it`);
      }
    });
    expect(found).toEqual([]);
  });
});

describe("design gaps", () => {
  it("are recorded without becoming routes", () => {
    expect(duplicates(designGaps.map((gap) => gap.id))).toEqual([]);
    const ownPaths = new Set(routes.map((route) => `${route.platform} ${route.path}`));
    const found = problems(designGaps, (gap, report) => {
      if (gap.status !== "UNRESOLVED_DESIGN") report(`unexpected status ${gap.status}`);
      if (!PLATFORMS.includes(gap.platform)) report(`unknown platform ${gap.platform}`);
      if (!filled(gap.description)) report("missing description");
      if (!discrepancyIds.has(gap.discrepancy)) report(`unknown discrepancy ${gap.discrepancy}`);
      if (gap.candidatePath && ownPaths.has(`${gap.platform} ${gap.candidatePath}`)) {
        report(`candidate path ${gap.candidatePath} is already a route`);
      }
    });
    expect(found).toEqual([]);
  });

  it("are all listed in the architecture document", () => {
    expect([...gapIds].filter((id) => !architecture.includes(`\`${id}\``))).toEqual([]);
  });
});

describe("discrepancies", () => {
  it("are complete and referenced consistently", () => {
    expect(duplicates(discrepancies.map((entry) => entry.id))).toEqual([]);
    const found = problems(discrepancies, (entry, report) => {
      for (const field of ["title", "sourceA", "sourceB", "mismatch", "impact", "resolution"]) {
        if (!filled(entry[field])) report(`missing ${field}`);
      }
      if (!DISCREPANCY_STATUSES.includes(entry.status)) report(`unknown status ${entry.status}`);
      for (const id of entry.routes) if (!routeById.has(id)) report(`unknown route ${id}`);
      for (const id of entry.designGaps ?? [])
        if (!gapIds.has(id)) report(`unknown design gap ${id}`);
    });
    expect(found).toEqual([]);
  });

  it("are all summarized in the architecture document", () => {
    expect([...discrepancyIds].filter((id) => !architecture.includes(`\`${id}\``))).toEqual([]);
  });
});

describe("documentation", () => {
  it("names the Route Gallery and is linked from CLAUDE.md and the handoff contract", () => {
    expect(GALLERY_ARTBOARDS.filter((artboard) => !architecture.includes(artboard))).toEqual([]);
    expect(read("CLAUDE.md")).toContain("docs/route-architecture.md");
    expect(read("docs/design-handoff.md")).toContain("docs/route-architecture.md");
  });
});

describe("web router", () => {
  function* pages(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) yield* pages(path);
      else if (entry.name === "page.tsx") yield relative(root, path).split(sep).join("/");
    }
  }

  /** src/app/[locale]/(group)/gyms/[gymId]/page.tsx -> /gyms/:gymId */
  const canonicalPath = (file) => {
    const parts = file
      .replace(/^src\/app\/\[locale\]\/?/, "")
      .replace(/\/?page\.tsx$/, "")
      .split("/")
      .filter((part) => part !== "" && !/^\(.+\)$/.test(part))
      .map((part) => (part.startsWith("[...") ? "*" : part.replace(/^\[(.+)\]$/, ":$1")));
    return `/${parts.join("/")}`;
  };

  const ownRoutes = routes.filter((route) => route.platform === THIS_PLATFORM);

  it("has a registry route for every page", () => {
    const found = [];
    for (const file of pages(join(root, "src", "app"))) {
      const route = ownRoutes.find((candidate) => candidate.path === canonicalPath(file));
      if (!route) found.push(`${file}: ${canonicalPath(file)} is not in the registry`);
      else if (route.status !== "IMPLEMENTED" || route.production.file !== file) {
        found.push(`${file}: ${route.id} must be IMPLEMENTED with production.file ${file}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("has a page or layout for everything the registry marks implemented", () => {
    const implemented = [
      ...ownRoutes,
      ...shells.filter((shell) => shell.platform === THIS_PLATFORM),
    ].filter((entry) => entry.status === "IMPLEMENTED");
    const missing = implemented.filter((entry) => !existsSync(join(root, entry.production.file)));
    expect(missing.map((entry) => entry.id)).toEqual([]);
  });
});
