import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { OUTPUT, renderWebRoutes } from "./generate-web-routes.mjs";

const root = process.cwd();

describe("generated web routes", () => {
  it("are in sync with docs/route-registry.json (run pnpm routes:generate)", async () => {
    const registry = JSON.parse(readFileSync(join(root, "docs/route-registry.json"), "utf8"));
    expect(readFileSync(join(root, OUTPUT), "utf8")).toBe(await renderWebRoutes(registry));
  });
});
