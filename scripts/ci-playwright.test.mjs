import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/*
 * CI runs the browser suites in Playwright's official image (SF-47): its
 * browsers belong to one Playwright release, so the image tag must be the
 * exact @playwright/test version, or every browser launch fails.
 */
describe("CI Playwright image", () => {
  it("is pinned to the exact @playwright/test version", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const version = pkg.devDependencies["@playwright/test"];
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const images = [...workflow.matchAll(/mcr\.microsoft\.com\/playwright:v([\w.-]+)/g)].map(
      (match) => match[1],
    );
    expect(images).toEqual([`${version}-noble`]);
    // Nothing installs browsers or OS packages at run time.
    expect(workflow).not.toMatch(/run:.*playwright install/);
  });
});
