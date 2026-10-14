import { expect, test, type Page } from "@playwright/test";

import { axeViolations, box, expectBox, overflow, VIEWPORTS } from "./harness";
import { onboardingApi } from "./onboarding-api";

/*
 * Coach web workspace geometry on the production build (SF-54), against
 * Claude Design 1791982482-71e3: WC1 WebCoachDashboard with CoachWebNav and
 * ContextSwitcher (1440 × 900), and WCX1 WebContextSelect (1440 × 900). At
 * the artboard size the anchors land on the artboard's coordinates (±2 px);
 * across the laptop matrix the shell fills the window, the dashboard keeps
 * its two columns top-aligned and nothing overflows; narrow windows stack.
 */

const FIGHTER = {
  display_name: "Alex N.",
  username: "alex_n",
  country_code: "PL",
  city: "Warsaw",
  experience_level: "amateur",
  stance: "orthodox",
};
const COACH = {
  display_name: "Alex Novak",
  brand_name: "Novak Boxing",
  country_code: "PL",
  city: "Warsaw",
  bio: "Footwork-first boxing. Ten-week camps for amateurs.",
  languages: ["en", "pl"],
  coaching_formats: ["personal_training", "fight_camps"],
  competition_levels: ["amateur"],
};
const BOTH = { fields: FIGHTER, completed: true, coachFields: COACH, coachCompleted: true };

async function openDashboard(page: Page) {
  await onboardingApi(page, { ...BOTH, lastContext: "coach", tour: "completed" });
  await page.goto("/en/app/coach");
  await page.getByRole("heading", { level: 1, name: "Welcome, Alex Novak" }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

const near = (actual: number, expected: number, tolerance = 2) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

test.describe("WC1 at the artboard size (1440 × 900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("sidebar, switcher, header and the two columns sit on the artboard", async ({ page }) => {
    await openDashboard(page);
    // CoachWebNav: the 240 px sidebar, the switcher 14 px in and 212 px wide under the brand.
    await expectBox(page.getByRole("complementary"), { x: 0, y: 0, w: 240, h: 900 });
    const trigger = await box(
      page.getByRole("complementary").getByRole("button", { name: /Alex Novak, Coach/ }),
    );
    near(trigger.x, 14);
    near(trigger.width, 212);
    near(trigger.y, 68);
    near(trigger.height, 54);
    // Nav rows: Dashboard first under the COACHING label.
    const dashboard = await box(page.locator("aside [data-nav-item=dashboard]"));
    near(dashboard.x, 14);
    near(dashboard.width, 212);

    // The 76 px page header beside the sidebar; the title on the 32 px gutter.
    const header = await box(page.locator("main header").first());
    near(header.x, 240);
    near(header.width, 1200);
    near(header.height, 76);
    const title = page.getByRole("heading", { level: 1 });
    near((await box(title)).x, 272);

    // Two top-aligned columns, 1.8 : 1 with an 18 px gap, from y 98 (±2).
    const profile = await box(page.getByRole("region", { name: "Your coach profile" }));
    const setup = await box(page.getByRole("region", { name: "Get your coaching space ready" }));
    near(profile.x, 272);
    near(profile.y, 98);
    near(setup.y, 98);
    near(setup.x - (profile.x + profile.width), 18);
    near(profile.width, ((1136 - 18) * 1.8) / 2.8, 3);
    near(setup.x + setup.width, 1408);
    expect(
      await page
        .getByRole("region", { name: "Your coach profile" })
        .evaluate((el) => getComputedStyle(el).borderTopLeftRadius),
    ).toBe("22px");
    expect(await overflow(page)).toBe(0);
    expect(await axeViolations(page)).toEqual([]);
  });

  test("the switcher menu opens under the trigger, inside the window, and is accessible", async ({
    page,
  }) => {
    await openDashboard(page);
    await page
      .getByRole("complementary")
      .getByRole("button", { name: /Alex Novak, Coach/ })
      .click();
    const menu = page.getByRole("menu");
    // Measured once the opening animation has settled.
    await menu.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const area = await box(menu);
    near(area.x, 14);
    near(area.width, 212);
    expect(area.y).toBeGreaterThan(68 + 54);
    expect(area.y + area.height).toBeLessThanOrEqual(900);
    // The menu is portalled to <body> (Radix overlays), outside the landmarks;
    // it is reached from its trigger in the sidebar. Every other rule applies.
    expect((await axeViolations(page)).filter((rule) => !rule.startsWith("region "))).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(
      page.getByRole("complementary").getByRole("button", { name: /Alex Novak, Coach/ }),
    ).toBeFocused();
  });

  test("WCX1: the 72 px frame and the 560 px column centred in the window", async ({ page }) => {
    await onboardingApi(page, { ...BOTH, tour: "completed" });
    await page.goto("/en/app/context");
    const title = page.getByRole("heading", { level: 1, name: "Where do you want to go?" });
    await title.waitFor();
    await page.evaluate(() => document.fonts.ready);
    await expectBox(page.locator("header").first(), { x: 0, y: 0, w: 1440, h: 72 });
    const column = await box(page.locator("[data-context-selection] main > div > div"));
    near(column.width, 560);
    near(column.x, 440);
    // Centred vertically between the header and the bottom of the window.
    near(column.y - 72, 900 - (column.y + column.height), 4);
    expect(await overflow(page)).toBe(0);
    expect(await axeViolations(page)).toEqual([]);
  });
});

test.describe("across the laptop and desktop matrix", () => {
  for (const [width, height] of VIEWPORTS) {
    test(`${width} × ${height}: the shell fills the window, two columns, nothing clipped`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openDashboard(page);
      await expectBox(page.getByRole("complementary"), { x: 0, y: 0, w: 240 });
      const header = await box(page.locator("main header").first());
      near(header.x + header.width, width);
      const profile = await box(page.getByRole("region", { name: "Your coach profile" }));
      const setup = await box(page.getByRole("region", { name: "Get your coaching space ready" }));
      near(profile.y, setup.y);
      expect(profile.width).toBeGreaterThan(setup.width);
      expect(await overflow(page)).toBe(0);
    });
  }
});

test.describe("narrow windows", () => {
  for (const [width, height] of [
    [1024, 768],
    [768, 1024],
    [390, 844],
  ] as const) {
    test(`${width} px: no horizontal overflow; the columns stack below 1024`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openDashboard(page);
      expect(await overflow(page)).toBe(0);
      const profile = await box(page.getByRole("region", { name: "Your coach profile" }));
      const setup = await box(page.getByRole("region", { name: "Get your coaching space ready" }));
      if (width < 1024) expect(setup.y).toBeGreaterThan(profile.y + profile.height);
      else near(profile.y, setup.y);
      if (width < 768) {
        await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
      }
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});
