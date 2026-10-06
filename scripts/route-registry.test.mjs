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
const NAV_TYPES = ["NAV_ITEM", "STACK", "WIZARD", "STANDALONE", "ENTRY", "CATCH_ALL"];
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

const { routes, screens, shells, api, outputs, discrepancies } = registry;
const routeById = new Map(routes.map((route) => [route.id, route]));
const shellById = new Map(shells.map((shell) => [shell.id, shell]));
const discrepancyIds = new Set(discrepancies.map((entry) => entry.id));

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
    expect(screens.length + outputs.length + apiRows.size).toBe(rows);
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

  it("exist for every product route and never for internal ones", () => {
    const found = problems(routes, (route, report) => {
      const internal = route.surface === "INTERNAL";
      if (internal && route.screens.length > 0) report("INTERNAL route with design screens");
      if (!internal && route.screens.length === 0)
        report("product route without a design screen (orphan)");
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

describe("discrepancies", () => {
  it("are complete and referenced consistently", () => {
    expect(duplicates(discrepancies.map((entry) => entry.id))).toEqual([]);
    const found = problems(discrepancies, (entry, report) => {
      for (const field of ["title", "sourceA", "sourceB", "mismatch", "impact", "resolution"]) {
        if (!filled(entry[field])) report(`missing ${field}`);
      }
      if (!DISCREPANCY_STATUSES.includes(entry.status)) report(`unknown status ${entry.status}`);
      for (const id of entry.routes) if (!routeById.has(id)) report(`unknown route ${id}`);
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
