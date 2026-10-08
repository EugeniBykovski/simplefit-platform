import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * SF-32: the web route skeleton follows the SF-31 registry. Derived from
 * docs/route-registry.json and the filesystem, never from a second route
 * list. Complements scripts/route-registry.test.mjs (every page is a
 * registry route and every implemented route has its file).
 */
const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const registry = JSON.parse(read("docs/route-registry.json"));
const routes = registry.routes.filter((route) => route.platform === "web");
const shells = new Map(
  registry.shells.filter((shell) => shell.platform === "web").map((shell) => [shell.id, shell]),
);
const LOCALE_ROOT = "src/app/[locale]";

/** Real screens from earlier tickets: SF-32 must never turn them into placeholders. */
const REAL_SCREENS = [
  "web.root",
  "web.app",
  "web.login",
  "web.login.code",
  "web.signup",
  "web.signup.account",
  "web.signup.verify",
  "web.verify-email",
  "web.dev.design-system",
  // SF-38: Fighter web registration (WF0, WF1, WF6).
  "web.app.onboarding.fighter",
  // SF-46: account basics & consent (WA5).
  "web.app.onboarding.account",
];

const placeholderSource = (id) => `import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("${id}");

export const generateMetadata = route.generateMetadata;
export default route.Page;
`;

/** The layout files that wrap `file`, from the locale root inwards. */
function layoutChain(file) {
  const chain = [];
  for (let dir = dirname(file); dir.startsWith(LOCALE_ROOT); dir = dirname(dir)) {
    const layout = join(dir, "layout.tsx");
    if (existsSync(join(root, layout))) chain.unshift(layout);
  }
  return chain;
}

const kind = (route) => {
  const source = read(route.production.file);
  if (source.includes("placeholderRoute(")) return "placeholder";
  if (route.nav.type === "REDIRECT") return "redirect";
  return "screen";
};

describe("route resolution strategy", () => {
  it("every web route resolves through an intentional production file", () => {
    const missing = routes.filter(
      (route) =>
        route.status !== "IMPLEMENTED" || !existsSync(join(root, route.production?.file ?? "")),
    );
    expect(missing.map((route) => route.id)).toEqual([]);
  });

  it("placeholder pages are exactly the canonical placeholder module for their own route", () => {
    const wrong = routes
      .filter((route) => kind(route) === "placeholder")
      .filter((route) => read(route.production.file) !== placeholderSource(route.id));
    expect(wrong.map((route) => route.id)).toEqual([]);
  });

  it("keeps the real screens of earlier tickets", () => {
    const placeholders = REAL_SCREENS.filter(
      (id) => kind(routes.find((route) => route.id === id)) !== "screen",
    );
    expect(placeholders).toEqual([]);
  });

  it("REDIRECT routes only redirect to their registry target", () => {
    for (const route of routes.filter((candidate) => candidate.nav.type === "REDIRECT")) {
      const source = read(route.production.file);
      expect(source).toContain(`redirect({ href: routeHref("${route.redirect.to}"), locale })`);
      // Renders nothing: no JSX and no returned content.
      expect(source).not.toMatch(/<\/|\/>|return\b/);
    }
  });

  it("accounts for every route: screens, placeholders, redirects and the catch-all", () => {
    const counts = routes.reduce((acc, route) => {
      const key = route.nav.type === "CATCH_ALL" ? "catchAll" : kind(route);
      return { ...acc, [key]: (acc[key] ?? 0) + 1 };
    }, {});
    expect(counts.placeholder + counts.redirect + counts.screen + counts.catchAll).toBe(
      routes.length,
    );
    expect(counts.screen).toBe(REAL_SCREENS.length);
  });
});

describe("dynamic parameters", () => {
  it("keep the registry's named parameters as [name] directories", () => {
    const wrong = routes.filter((route) => {
      const dirs = [...route.production.file.matchAll(/\/\[(?!\.\.\.)([^\]/]+)\]\//g)]
        .map((match) => match[1])
        .filter((name) => name !== "locale");
      return JSON.stringify(dirs) !== JSON.stringify(route.params);
    });
    expect(wrong.map((route) => route.id)).toEqual([]);
  });
});

describe("shells", () => {
  it("every shell is a layout file in the registry", () => {
    const missing = [...shells.values()].filter(
      (shell) => shell.status !== "IMPLEMENTED" || !existsSync(join(root, shell.production.file)),
    );
    expect(missing.map((shell) => shell.id)).toEqual([]);
  });

  it("every route renders inside its own shell's layout", () => {
    const wrong = routes.filter((route) => {
      const shell = shells.get(route.shell);
      const chain = layoutChain(route.production.file);
      return !chain.includes(shell.production.file);
    });
    expect(wrong.map((route) => `${route.id} (${route.shell})`)).toEqual([]);
  });

  it("no route renders inside a sibling shell's layout", () => {
    const shellFiles = new Map([...shells.values()].map((shell) => [shell.production.file, shell]));
    const wrong = routes.filter((route) =>
      layoutChain(route.production.file).some((layout) => {
        const owner = shellFiles.get(layout);
        if (!owner) return false;
        // A layout on the chain must be the route's shell or one of its ancestors.
        for (let id = route.shell; id; id = shells.get(id)?.parent)
          if (id === owner.id) return false;
        return true;
      }),
    );
    expect(wrong.map((route) => route.id)).toEqual([]);
  });

  it("sidebar shells use their own registry navigation", () => {
    for (const [file, shell] of [
      ["src/app/[locale]/app/(fighter)/layout.tsx", "web.app.fighter"],
      ["src/app/[locale]/app/coach/layout.tsx", "web.app.coach"],
      ["src/app/[locale]/app/gym/layout.tsx", "web.app.gym"],
      ["src/app/[locale]/(sponsor)/sponsor/layout.tsx", "web.sponsor"],
      ["src/app/[locale]/(admin)/admin/layout.tsx", "web.admin"],
    ]) {
      expect(read(file)).toContain(`<WorkspaceShell shell="${shell}">`);
    }
  });
});

describe("access composition (session part of SF-31 §6)", () => {
  const gates = (route) => {
    const chain = layoutChain(route.production.file).map(read).join("\n");
    return {
      requireSession: chain.includes("<RequireSession"),
      guestOnly: chain.includes("<GuestOnly"),
    };
  };

  it("AUTHENTICATED routes are behind RequireSession, GUEST_ONLY behind GuestOnly, PUBLIC behind neither", () => {
    const wrong = routes.filter((route) => {
      const { requireSession, guestOnly } = gates(route);
      switch (route.access.session) {
        case "AUTHENTICATED":
          return !requireSession || guestOnly;
        case "GUEST_ONLY":
          return requireSession || !guestOnly;
        default:
          return requireSession || guestOnly;
      }
    });
    expect(wrong.map((route) => `${route.id} (${route.access.session})`)).toEqual([]);
  });

  it("each signed-in area sends visitors to its own registry sign-in route", () => {
    const signIn = (file) => read(file).match(/signInRouteFor\("([^"]+)"\)/)?.[1];
    expect(signIn("src/app/[locale]/app/layout.tsx")).toBe("web");
    expect(signIn("src/app/[locale]/account/layout.tsx")).toBe("web");
    expect(signIn("src/app/[locale]/(sponsor)/sponsor/layout.tsx")).toBe("web.sponsor");
    expect(signIn("src/app/[locale]/(admin)/admin/layout.tsx")).toBe("web.admin");
    expect(registry.guards.signIn).toMatchObject({
      web: "web.login",
      "web.sponsor": "web.sponsor.login",
      "web.admin": "web.admin.login",
    });
  });

  it("/admin/login stays GUEST_ONLY outside the admin shell (D-ADMIN-IDENTITY)", () => {
    const login = routes.find((route) => route.id === "web.admin.login");
    expect(login.access.session).toBe("GUEST_ONLY");
    expect(layoutChain(login.production.file)).not.toContain(
      "src/app/[locale]/(admin)/admin/layout.tsx",
    );
  });
});

describe("placeholder copy", () => {
  it("every placeholder route has a title in every full locale", () => {
    const locales = ["en", "ru", "pl", "de", "uk", "es", "fr"];
    const placeholders = routes.filter((route) => kind(route) === "placeholder");
    for (const locale of locales) {
      const titles = JSON.parse(read(`messages/${locale}/routes.json`)).titles;
      const missing = placeholders
        .map((route) => route.id.replaceAll(".", "/"))
        .filter((key) => !titles[key]);
      expect(missing, locale).toEqual([]);
    }
  });
});
