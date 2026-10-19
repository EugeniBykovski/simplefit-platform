import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isFontFetchFailure } from "./font-fetch-retry.mjs";

describe("font fetch retry", () => {
  it("retries only the Google Fonts download failure", () => {
    expect(
      isFontFetchFailure(
        "[plugin vite-plugin-storybook-nextjs-font]\nError: Failed to fetch `Unbounded` from Google Fonts with URL:",
      ),
    ).toBe(true);
    expect(isFontFetchFailure("Failed to fetch `JetBrains Mono` from Google Fonts.")).toBe(true);
    expect(isFontFetchFailure("Type error: Property 'x' does not exist")).toBe(false);
    expect(isFontFetchFailure("Failed to fetch dynamically imported module")).toBe(false);
  });

  it("wraps every CI build that downloads the brand fonts", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const runs = [...workflow.matchAll(/run: (.*)/g)].map((match) => match[1]);
    const builds = runs.filter((run) => /pnpm (build|storybook:build)\b/.test(run));
    expect(builds).toHaveLength(4);
    for (const run of builds) expect(run).toMatch(/^node scripts\/font-fetch-retry\.mjs pnpm /);
  });
});
