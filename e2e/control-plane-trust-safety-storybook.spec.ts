import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * AD4 and AD11 (SF-125) on the static Storybook build (mock-only, not backend E2E): the
 * truthful "not available" screens make no request, pass axe (WCAG 2.2 AA tags) and fit
 * 375–1920; nothing on them looks operational.
 */

const STORYBOOK = "http://127.0.0.1:6007";
const PREFIX = "control-plane-trust-and-safety--";

async function story(page: Page, id: string) {
  const outside: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      if (!url.hostname.endsWith("fonts.gstatic.com")) outside.push(request.url());
    }
  });
  await page.goto(`${STORYBOOK}/iframe.html?id=${PREFIX}${id}&viewMode=story&globals=theme:Dark`);
  await page.waitForFunction(() =>
    ["sb-show-main", "sb-show-errordisplay"].some((name) => document.body.classList.contains(name)),
  );
  expect(await page.evaluate(() => document.body.classList.contains("sb-show-errordisplay"))).toBe(
    false,
  );
  return outside;
}

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
        ).axe.run(document.body, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
          },
        });
        return violations.map((violation) => `${violation.id} (${violation.nodes.length})`);
      });
    } catch (error) {
      if (attempt >= 20 || !String(error).includes("Axe is already running")) throw error;
      await page.waitForTimeout(250);
    }
  }
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.use({ viewport: { width: 1440, height: 900 } });

for (const [id, text] of [
  ["moderation-unavailable", "Moderation isn’t part of the Control Plane yet"],
  ["enforcement-unavailable", "Enforcement and appeals aren’t part of the Control Plane yet"],
] as const) {
  test(`${id}: renders, makes no request, passes axe and fits 375–1920`, async ({ page }) => {
    const outside = await story(page, id);
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 10_000 });
    expect(outside).toEqual([]);
    expect(await axe(page)).toEqual([]);
    await expect(page.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("table")).toHaveCount(0);
    await page.screenshot({
      path: `test-results/control-plane-trust-safety/${id}-1440.png`,
      fullPage: true,
    });
    for (const width of [375, 390, 768, 1024, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await overflow(page), `${id} at ${width}`).toBeLessThanOrEqual(0);
    }
  });
}

test("keyboard: the only stops are the two links to the real controls", async ({ page }) => {
  await story(page, "enforcement-unavailable");
  await expect(page.getByRole("link", { name: "Users" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("link", { name: "Users" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Sponsor applications" })).toBeFocused();
});
