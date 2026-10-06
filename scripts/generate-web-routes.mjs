#!/usr/bin/env node
/*
 * Generates src/shared/routes/web-routes.ts from the canonical route registry
 * (docs/route-registry.json, SF-31): the web routes with their path, shell,
 * parent, navigation type and access, the shells' navigation items, and the
 * web sign-in and entry guards. Application code links through this module,
 * never through handwritten paths (route-architecture §14).
 *
 *   node scripts/generate-web-routes.mjs           write the module
 *   node scripts/generate-web-routes.mjs --check   fail when it is out of date
 *
 * scripts/web-routes.test.mjs runs the check in `pnpm test`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as prettier from "prettier";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const OUTPUT = "src/shared/routes/web-routes.ts";

/** The module source for `registry`, formatted with the repository's Prettier config. */
export async function renderWebRoutes(registry) {
  const routes = registry.routes
    .filter((route) => route.platform === "web")
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((route) => ({
      id: route.id,
      path: route.path,
      params: route.params,
      shell: route.shell,
      surface: route.surface,
      parent: route.parent,
      nav: route.nav.type,
      session: route.access.session,
      capability: route.access.capability,
      phase: route.access.phase,
      ...(route.redirect ? { redirectTo: route.redirect.to } : {}),
    }));

  const shells = registry.shells
    .filter((shell) => shell.platform === "web")
    .map((shell) => ({
      id: shell.id,
      parent: shell.parent,
      navItems: (shell.navItems ?? []).map((item) => ({
        key: item.key,
        route: item.route,
        ...(item.query ? { query: item.query } : {}),
      })),
    }));

  const guards = {
    signIn: Object.fromEntries(
      Object.entries(registry.guards.signIn).filter(([key]) => key.startsWith("web")),
    ),
    entry: registry.guards.entry.web,
    notFound: registry.guards.notFound.web,
    restrictedAccount: {
      suspended: registry.guards.restrictedAccount.suspended.web,
      pendingDeletion: registry.guards.restrictedAccount.pendingDeletion.web,
    },
    returnToParam: registry.guards.returnToParam,
  };

  const json = (value) => JSON.stringify(value, null, 2);

  const source = `// Generated from docs/route-registry.json by scripts/generate-web-routes.mjs.
// Do not edit: change the registry (SF-31) and run \`pnpm routes:generate\`.

export const webRoutes = ${json(routes)} as const;

export const webShells = ${json(shells)} as const;

export const webGuards = ${json(guards)} as const;
`;
  const target = join(root, OUTPUT);
  return prettier.format(source, { ...(await prettier.resolveConfig(target)), filepath: target });
}

async function main() {
  const registry = JSON.parse(readFileSync(join(root, "docs/route-registry.json"), "utf8"));
  const content = await renderWebRoutes(registry);
  const target = join(root, OUTPUT);

  if (process.argv.includes("--check")) {
    const current = readFileSync(target, "utf8");
    if (current !== content) {
      console.error(`${OUTPUT} is out of date: run pnpm routes:generate`);
      process.exit(1);
    }
    console.log(`${OUTPUT} is up to date with docs/route-registry.json.`);
    return;
  }

  writeFileSync(target, content);
  console.log(`Wrote ${OUTPUT}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
