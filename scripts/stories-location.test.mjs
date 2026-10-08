import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/*
 * The Storybook workshop lives in one tree (docs/design-system.md#storybook):
 * src/stories/{foundations,components,screens,support}. Storybook only loads
 * that tree (.storybook/main.ts), so a story elsewhere would silently vanish;
 * and production code never imports it (eslint `forbiddenLayers`).
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? files(full) : [path.relative(root, full)];
  });
}

const all = files(src);

describe("Storybook workshop location", () => {
  it("keeps every story under src/stories", () => {
    const stray = all.filter(
      (file) =>
        /\.stories\.(ts|tsx|mdx)$/.test(file) &&
        !file.startsWith(`src${path.sep}stories${path.sep}`),
    );
    expect(stray).toEqual([]);
  });

  it("files every story under foundations, components or screens", () => {
    const stories = all.filter((file) => file.startsWith(`src${path.sep}stories${path.sep}`));
    for (const file of stories) {
      const [, , group] = file.split(path.sep);
      expect(["foundations", "components", "screens", "support"], file).toContain(group);
    }
  });

  it("is never imported by production code", () => {
    const production = all.filter(
      (file) => /\.(ts|tsx)$/.test(file) && !file.startsWith(`src${path.sep}stories${path.sep}`),
    );
    const importers = production.filter((file) =>
      /from ["']@\/stories\//.test(readFileSync(path.join(root, file), "utf8")),
    );
    expect(importers).toEqual([]);
  });
});
