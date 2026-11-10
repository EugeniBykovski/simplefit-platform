import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * AD0 and ARW1 (SF-120) on the static Storybook build: the production entry card
 * per state and the welcome in the Control Plane's route composition, on a
 * per-story API double (mock-only, not backend E2E). Axe (WCAG 2.2 AA tags),
 * 375–1920 fit, 1440 geometry against the real targets, the 390 docked card,
 * keyboard focus and reduced motion.
 */

const STORYBOOK = "http://127.0.0.1:6007";
const PREFIX = "control-plane-entry-and-first-visit--";

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
  ["checking", "Checking access…"],
  ["key", "Use your security key"],
  ["waiting", "Waiting for your key…"],
  ["failed", "That key didn’t work"],
  ["rate-limited", "Too many attempts"],
  ["enroll", "Register two security keys"],
  ["enroll-second", "Now your backup key"],
  ["enroll-rejected", "can’t be used here"],
  ["enroll-done", "Your keys are registered"],
  ["reverify", "Confirm it’s you again"],
  ["recovery", "Lost your keys?"],
  ["unavailable", "We can’t find that page"],
  ["enrollment-expired", "Your setup window has ended"],
  ["unsupported", "This browser can’t use security keys"],
  ["service-unavailable", "Security keys aren’t available right now"],
  ["load-failed", "We couldn’t check your access"],
  ["ready", "Welcome to the Control Plane"],
  ["restricted", "Welcome to the Control Plane"],
  ["recorded", "Welcome to the Control Plane"],
  ["load-error", "We couldn’t load your access"],
] as const) {
  test(`${id}: renders, stays local, passes axe and fits 375–1920`, async ({ page }) => {
    const outside = await story(page, id);
    await expect(page.getByText(text).first()).toBeVisible();
    expect(outside).toEqual([]);
    expect(await axe(page)).toEqual([]);
    await page.screenshot({ path: `test-results/control-plane/${id}-1440.png`, fullPage: true });
    for (const width of [375, 390, 768, 1024, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await overflow(page), `${id} at ${width}`).toBeLessThanOrEqual(0);
    }
  });
}

test("AD0 primary actions are at least 44 px and keyboard reachable", async ({ page }) => {
  await story(page, "key");
  const primary = page.getByRole("button", { name: "Use security key" });
  expect((await primary.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  for (
    let i = 0;
    i < 6 && !(await primary.evaluate((node) => node === document.activeElement));
    i += 1
  ) {
    await page.keyboard.press("Tab");
  }
  await expect(primary).toBeFocused();
});

test("ARW1 restricted: a reviewer sees only what was granted", async ({ page }) => {
  await story(page, "restricted");
  await expect(page.locator("[data-access-row=sponsorApplications]")).toHaveAttribute(
    "data-granted",
    "true",
  );
  for (const row of ["sponsorOrganizations", "audit", "operators"]) {
    await expect(page.locator(`[data-access-row=${row}]`)).toHaveAttribute("data-granted", "false");
  }
  const nav = page.locator("aside nav");
  await expect(nav.getByText("Sponsors")).toBeVisible();
  await expect(nav.getByText("Audit log")).toHaveCount(0);
  await expect(nav.getByText("Internal access")).toHaveCount(0);
});

for (const [id, title, target] of [
  ["tour-welcome", "What this is", "[data-tour-target=admin-access]"],
  ["tour-sensitive", "Sensitive actions", "[data-tour-target=admin-sensitive]"],
  ["tour-me", "Your key check and leaving", "aside [data-tour-target=workspace]"],
] as const) {
  test(`ARW1 ${id}: a modal coach mark on its real target, inside the 1440 viewport, axe clean`, async ({
    page,
  }) => {
    await story(page, id);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: title })).toBeVisible();
    await expect(dialog).toHaveAttribute("data-tour-layout", "placed");
    const card = await dialog.boundingBox();
    const box = await page.locator(target).boundingBox();
    const spot = await page.locator("[data-tour-spotlight]").boundingBox();
    expect(card && box && spot).toBeTruthy();
    if (card && box && spot) {
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.y).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(1440);
      expect(card.y + card.height).toBeLessThanOrEqual(900);
      expect(Math.abs(spot.x - (box.x - 4))).toBeLessThanOrEqual(1);
      expect(Math.abs(spot.width - (box.width + 8))).toBeLessThanOrEqual(1);
    }
    expect(await axe(page)).toEqual([]);
    await page.screenshot({ path: `test-results/control-plane/${id}-1440.png` });
  });
}

test("ARW1 done: the done card offers the overview", async ({ page }) => {
  await story(page, "tour-done");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "You’re ready" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Go to overview" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test("ARW1 at 390: the tour docks to the bottom, inside the viewport, no overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await story(page, "tour-welcome");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("data-tour-layout", "docked");
  const card = await dialog.boundingBox();
  expect(card).not.toBeNull();
  if (card) {
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(390);
    expect(card.y + card.height).toBeLessThanOrEqual(844);
  }
  expect(
    (await dialog.getByRole("button", { name: "Next" }).boundingBox())?.height ?? 0,
  ).toBeGreaterThanOrEqual(44);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(await axe(page)).toEqual([]);
  await page.screenshot({ path: "test-results/control-plane/tour-phone-390.png" });
});

test("ARW1 keyboard: focus stays in the card, arrows move, Escape asks before skipping", async ({
  page,
}) => {
  await story(page, "tour-sensitive");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Next" })).toBeFocused();
  for (const key of ["Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByRole("heading", { name: "What this is" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog.getByRole("heading", { name: "Skip the tour?" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog.getByRole("heading", { name: "What this is" })).toBeVisible();
});
