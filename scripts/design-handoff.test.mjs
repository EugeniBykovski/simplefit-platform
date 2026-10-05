import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * Guards for the Claude Design handoff contract (docs/design-handoff.md, SF-16):
 * the canonical artifact metadata stays intact, the docs agree with it, and
 * no copy of the design source is committed to this repository.
 */
// Vitest runs from the repository root.
const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const ARTIFACT_ID = "JEsBg51MjX8KiHWEro8omY";
const ARTIFACT_URL = `https://claude.ai/artifact/${ARTIFACT_ID}`;
const PAGE_IDS = [
  "onboarding",
  "fighter-mobile",
  "coach-mobile",
  "gym-mobile",
  "desktop-web",
  "sponsor-portal",
  "admin",
  "public-website",
  "design-system",
  "brand-assets",
  "pitch-business",
];
const THIS_REPO = "simplefit-platform";

const source = JSON.parse(read("docs/design-source.json"));
const handoff = read("docs/design-handoff.md");

describe("design source metadata", () => {
  it("names the canonical Claude Design artifact", () => {
    expect(source.artifact.id).toBe(ARTIFACT_ID);
    expect(source.artifact.url).toBe(ARTIFACT_URL);
    expect(source.artifact.index).toBe("project/canvas.json");
  });

  it("lists every design page exactly once, each with a known owner", () => {
    expect(source.pages.map((page) => page.id)).toEqual(PAGE_IDS);
    for (const page of source.pages) {
      expect(Object.keys(source.owners)).toContain(page.owner);
    }
  });

  it("assigns pages to this repository", () => {
    const owned = source.pages.filter((page) => page.owner === THIS_REPO);
    expect(owned.length).toBeGreaterThan(0);
  });
});

describe("design handoff documentation", () => {
  it("references the artifact and every page id", () => {
    expect(handoff).toContain(ARTIFACT_URL);
    for (const id of PAGE_IDS) expect(handoff).toContain(`\`${id}\``);
  });

  it("defines the design reference format", () => {
    for (const field of ["Design:", "Page:", "Artboard:", "Screen:", "State:", "Version:"]) {
      expect(handoff).toContain(field);
    }
  });

  it("is linked from CLAUDE.md and the design system doc", () => {
    expect(read("CLAUDE.md")).toContain("docs/design-handoff.md");
    expect(read("docs/design-system.md")).toContain("docs/design-handoff.md");
  });
});

describe("repository contents", () => {
  const skipped = new Set([".git", "node_modules", ".next", "out", "build", "coverage"]);

  function* files(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skipped.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) yield* files(path);
      else yield relative(root, path);
    }
  }

  it("contains no copies of the Claude Design source", () => {
    const copies = [...files(root)].filter(
      (path) => path.endsWith(".dc.html") || path.endsWith("canvas.json"),
    );
    expect(copies).toEqual([]);
  });
});
