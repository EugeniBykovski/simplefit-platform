import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * SRW1 and SRW2 (SF-119) on the static Storybook build: the production overview,
 * welcome and tour in the portal's route composition, on a per-story API double
 * (mock-only, not backend E2E). Axe (WCAG 2.2 AA tags), 375–1920 fit, 1440 geometry
 * against the real targets, the 390 docked card, focus and reduced motion.
 */

const STORYBOOK = "http://127.0.0.1:6007";
const PREFIX = "sponsor-portal-overview--";

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
  ["welcome-owner", "Welcome to your workspace"],
  ["welcome-member", "Welcome to your workspace"],
  ["welcome-in-progress", "Continue the tour"],
] as const) {
  test(`SRW1 ${id}: renders, stays local, passes axe and fits 375–1920`, async ({ page }) => {
    const outside = await story(page, id);
    await expect(page.getByText(text).first()).toBeVisible();
    expect(outside).toEqual([]);
    expect(await axe(page)).toEqual([]);
    await page.screenshot({
      path: `test-results/sponsor-first-run/${id}-1440.png`,
      fullPage: true,
    });
    for (const width of [375, 390, 768, 1024, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await overflow(page), `${id} at ${width}`).toBeLessThanOrEqual(0);
    }
  });
}

for (const [id, title] of [
  ["tour-start", "Start here"],
  ["tour-menu", "Overview"],
  ["tour-future", "What isn’t here yet"],
] as const) {
  test(`SRW2 ${id}: a modal coach mark on its real target, inside the 1440 viewport, axe clean`, async ({
    page,
  }) => {
    await story(page, id);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: title })).toBeVisible();
    await expect(dialog).toHaveAttribute("data-tour-layout", "placed");
    const card = await dialog.boundingBox();
    expect(card).not.toBeNull();
    if (card) {
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.y).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(1440);
      expect(card.y + card.height).toBeLessThanOrEqual(900);
    }
    expect(await axe(page)).toEqual([]);
    await page.screenshot({ path: `test-results/sponsor-first-run/${id}-1440.png` });
  });
}

test("SRW2 at 1440: the spotlight sits on the menu's Overview item, 4 px around it", async ({
  page,
}) => {
  await story(page, "tour-menu");
  const target = await page.locator("aside [data-nav-item=overview]").boundingBox();
  const spot = await page.locator("[data-tour-spotlight=overview]").boundingBox();
  expect(target && spot).toBeTruthy();
  if (target && spot) {
    expect(Math.abs(spot.x - (target.x - 4))).toBeLessThanOrEqual(1);
    expect(Math.abs(spot.y - (target.y - 4))).toBeLessThanOrEqual(1);
    expect(Math.abs(spot.width - (target.width + 8))).toBeLessThanOrEqual(1);
    expect(Math.abs(spot.height - (target.height + 8))).toBeLessThanOrEqual(1);
  }
  // The card is beside it, not over it.
  const card = await page.getByRole("dialog").boundingBox();
  if (card && target) expect(card.x).toBeGreaterThan(target.x + target.width);
});

test("SRW2 at 390: docked to the bottom, inside the viewport, 44 px controls, no overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await story(page, "tour-phone");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("data-tour-layout", "docked");
  const card = await dialog.boundingBox();
  expect(card).not.toBeNull();
  if (card) {
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(390);
    expect(card.y + card.height).toBeLessThanOrEqual(844);
  }
  for (const name of ["Next", "Back"]) {
    const box = await dialog.getByRole("button", { name }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(await axe(page)).toEqual([]);
  await page.screenshot({ path: "test-results/sponsor-first-run/tour-phone-390.png" });
});

test("SRW2 keyboard: focus stays in the card, arrows move, Escape asks before ending", async ({
  page,
}) => {
  await story(page, "tour-menu");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Next" })).toBeFocused();
  for (const key of ["Tab", "Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("heading", { name: "Application" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog.getByRole("heading", { name: "End the tour?" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog.getByRole("heading", { name: "Overview" })).toBeVisible();
});

test("SRW2 respects reduced motion: the spotlight doesn't animate", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await story(page, "tour-menu");
  const duration = await page
    .locator("[data-tour-spotlight=overview]")
    .evaluate((node) => getComputedStyle(node).transitionDuration);
  expect(duration.split(",").every((value) => Number.parseFloat(value) === 0)).toBe(true);
});
