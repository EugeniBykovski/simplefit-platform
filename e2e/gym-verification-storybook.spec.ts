import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * The business verification, community and go-live stories (SF-103: OG7,
 * WG10 / OG13, OG14) on the static Storybook build: each renders the
 * production composition in its state with no request leaving the page (the
 * API is a per-story double), in the dark and light themes, without
 * accessibility violations, and at every width from 375 to 1920 px without
 * horizontal overflow. No story offers an approval or a Publish action.
 */

const STORYBOOK = "http://127.0.0.1:6007";

async function story(page: Page, id: string, theme: "Dark" | "Light") {
  const outside: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      if (!url.hostname.endsWith("fonts.gstatic.com")) outside.push(request.url());
    }
  });
  await page.goto(
    `${STORYBOOK}/iframe.html?id=gym-console-business-verification--${id}&viewMode=story&globals=theme:${theme}`,
  );
  await page.waitForFunction(() =>
    ["sb-show-main", "sb-show-errordisplay"].some((name) => document.body.classList.contains(name)),
  );
  expect(await page.evaluate(() => document.body.classList.contains("sb-show-errordisplay"))).toBe(
    false,
  );
  return outside;
}

/** axe-core in the page (WCAG 2.1 A/AA and best practices), as the site QA runs it. */
async function axe(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await page.evaluate(async () => {
        const { violations } = await (
          window as unknown as {
            axe: {
              run: (
                context: Element,
                options: object,
              ) => Promise<{ violations: { id: string; nodes: unknown[] }[] }>;
            };
          }
        ).axe.run(document.querySelector("main") ?? document.body, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
          },
        });
        return violations.map((violation) => `${violation.id} (${violation.nodes.length})`);
      });
    } catch (error) {
      // Storybook's a11y addon may be running its own pass in the preview.
      if (attempt >= 20 || !String(error).includes("Axe is already running")) throw error;
      await page.waitForTimeout(250);
    }
  }
}

test.use({ viewport: { width: 1440, height: 900 } });

const STATES = [
  ["not-started", "Not started"],
  ["draft", "Uploading"],
  ["in-review", "In review"],
  ["changes-requested", "A document could not be read."],
  ["approved", "Verified"],
  ["rejected", "The business could not be verified from the information provided."],
  ["revoked", "The business appears to be closed."],
  ["restricted-to-owner", "Only the gym's owner manages business verification"],
  ["go-live-not-met", "Some required steps aren't done yet."],
  ["go-live-prerequisites-met", "Every required step is done."],
  ["go-live-restricted", "Only the owner and managers see go-live readiness"],
  ["community", "Never, whatever the setting"],
  ["german-copy", "Unternehmensdaten"],
] as const;

for (const theme of ["Dark", "Light"] as const) {
  for (const [id, text] of STATES) {
    test(`${theme} · ${id}: ${text}`, async ({ page }) => {
      const outside = await story(page, id, theme);
      await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
      expect(outside).toEqual([]);
    });
  }
}

test("no story offers an approval or a Publish action", async ({ page }) => {
  for (const id of ["in-review", "approved", "go-live-prerequisites-met"]) {
    await story(page, id, "Dark");
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await expect(page.getByRole("button", { name: /approve|publish|verify/i })).toHaveCount(0);
  }
});

for (const id of ["draft", "changes-requested", "approved", "go-live-not-met", "community"]) {
  test(`no accessibility violations · ${id}`, async ({ page }) => {
    await story(page, id, "Dark");
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    expect(await axe(page)).toEqual([]);
  });
}

for (const [width, height] of [
  [1920, 1080],
  [1366, 768],
  [1024, 768],
  [768, 1024],
  [430, 932],
  [390, 844],
  [375, 667],
] as const) {
  test(`no horizontal overflow at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const id of ["draft", "go-live-not-met", "community"]) {
      await story(page, id, "Dark");
      await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });
}
