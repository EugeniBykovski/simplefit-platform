import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * AD1 (SF-121) on the static Storybook build: the production overview per state on
 * deterministic fixtures (mock-only, not backend E2E). Axe (WCAG 2.2 AA tags),
 * 375–1920 fit, the 1440 two-column geometry, keyboard use of the period control,
 * and German strings without overflow.
 */

const STORYBOOK = "http://127.0.0.1:6007";
const PREFIX = "control-plane-overview--";

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
  ["ready", "Population"],
  ["empty", "Population"],
  ["partial", "No access"],
  ["restricted", "Other sections need permissions you don’t have."],
  ["provider", "Some background jobs failed in the last 24 hours."],
  ["loading", ""],
  ["error", "We couldn’t load this"],
  ["forbidden", "The overview needs permissions you don’t have"],
  ["long-locale", "Übersicht"],
  ["in-shell", "Population"],
] as const) {
  test(`AD1 ${id}: renders, stays local, passes axe and fits 375–1920`, async ({ page }) => {
    const outside = await story(page, id);
    if (text) await expect(page.getByText(text).first()).toBeVisible();
    else await expect(page.getByRole("status", { name: "Loading overview" })).toBeVisible();
    expect(outside).toEqual([]);
    expect(await axe(page)).toEqual([]);
    await page.screenshot({
      path: `test-results/control-plane-overview/${id}-1440.png`,
      fullPage: true,
    });
    for (const width of [375, 390, 768, 1024, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await overflow(page), `${id} at ${width}`).toBeLessThanOrEqual(0);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `test-results/control-plane-overview/${id}-390.png`,
      fullPage: true,
    });
  });
}

test("AD1 at 1440: Population on the left, the review queue and health beside it", async ({
  page,
}) => {
  await story(page, "ready");
  const population = await page.locator("[data-overview-card=population]").boundingBox();
  const reviews = await page.locator("[data-overview-card=reviews]").boundingBox();
  const health = await page.locator("[data-overview-card=health]").boundingBox();
  expect(population && reviews && health).toBeTruthy();
  if (population && reviews && health) {
    expect(reviews.x).toBeGreaterThan(population.x + population.width);
    expect(Math.abs(reviews.y - population.y)).toBeLessThanOrEqual(1);
    expect(health.y).toBeGreaterThan(reviews.y + reviews.height);
    expect(population.width).toBeGreaterThan(reviews.width);
  }
});

test("AD1 below 1024: one column, Population first", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await story(page, "ready");
  const population = await page.locator("[data-overview-card=population]").boundingBox();
  const reviews = await page.locator("[data-overview-card=reviews]").boundingBox();
  if (population && reviews) {
    expect(reviews.y).toBeGreaterThan(population.y + population.height);
    expect(Math.abs(reviews.x - population.x)).toBeLessThanOrEqual(1);
  }
});

test("AD1 keyboard: the period control is reachable and operable, with visible state", async ({
  page,
}) => {
  await story(page, "ready");
  const thirty = page.getByRole("button", { name: "30 days" });
  for (
    let i = 0;
    i < 20 && !(await thirty.evaluate((node) => node === document.activeElement));
    i += 1
  ) {
    await page.keyboard.press("Tab");
  }
  await expect(thirty).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(thirty).toHaveAttribute("aria-pressed", "true");
  expect((await thirty.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40);
});

test("AD1 states are told apart without colour: restricted and unavailable say so in text", async ({
  page,
}) => {
  await story(page, "partial");
  await expect(page.locator("[data-overview-metric=operators]")).toContainText("No access");
  await expect(page.locator("[data-overview-metric=gym_verifications_waiting]")).toContainText(
    "Not available yet",
  );
});
