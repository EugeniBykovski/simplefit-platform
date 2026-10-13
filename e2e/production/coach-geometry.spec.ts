import { expect, test, type Page } from "@playwright/test";

import { axeViolations, box, expectBox, overflow, VIEWPORTS } from "./harness";
import { onboardingApi } from "./onboarding-api";

/*
 * Coach web registration geometry on the production build (SF-52), against
 * Claude Design 1791896379-65b7: WCR1 WebRegCProfile and WCR2 WebRegCType
 * (1440 × 980), WCR7 WebRegCDone (1440 × 940). At the artboard size the
 * anchors land on the artboard's coordinates (1 px); across the laptop matrix
 * the composition is the same three columns, fluid in the middle,
 * full-bleed, top-aligned, nothing clipped; narrow windows stack.
 */

const ROUTE = "/en/app/onboarding/coach";
const PROFILE = {
  display_name: "Coach Alex",
  brand_name: "Alex Boxing",
  country_code: "PL",
  city: "Warsaw",
  bio: "Footwork-first boxing. Ten-week camps for amateurs.",
  languages: ["pl", "en"],
};
const TYPE = {
  coaching_formats: ["personal_training", "fight_camps"],
  competition_levels: ["amateur"],
};

async function openStep(page: Page, step: "profile" | "type") {
  await onboardingApi(page, {
    coachFields: step === "profile" ? PROFILE : { ...PROFILE, ...TYPE },
  });
  await page.goto(`${ROUTE}?step=${step}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

/** WCR7: complete from WCR2, as the page only shows it right after completion. */
async function openComplete(page: Page) {
  await openStep(page, "type");
  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByRole("heading", { level: 1, name: "Your coach profile is ready." }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

/** The WCR frame: the 72 px header and the three columns on the 64 px gutters. */
async function expectFrame(page: Page, width: number) {
  await expectBox(page.locator("[data-coach-onboarding]"), { x: 0, y: 0, w: width });
  await expectBox(page.locator("header").first(), { x: 0, y: 0, w: width, h: 72 });
  await expectBox(page.locator("header a").first(), { x: 56, h: 30 });
  const exit = await box(page.getByRole("button", { name: "Save & exit" }));
  expect(Math.abs(exit.x + exit.width - (width - 56))).toBeLessThanOrEqual(1);
  await expectBox(page.locator("[data-step-nav]"), { x: 64, y: 120, w: 250 });
  const formWidth = width - 128 - 250 - 320 - 80;
  await expectBox(page.locator("[data-onboarding-grid] > div").first(), {
    x: 64 + 250 + 40,
    y: 120,
    w: formWidth,
  });
  await expectBox(page.locator("[data-onboarding-grid] > aside"), {
    x: width - 64 - 320,
    y: 120,
    w: 320,
  });
  return formWidth;
}

test.describe("at the artboard size (1440 × 980)", () => {
  test.use({ viewport: { width: 1440, height: 980 } });

  test("WCR1: frame, step card, heading, fields, CTA and preview on the artboard", async ({
    page,
  }) => {
    await openStep(page, "profile");
    expect(await expectFrame(page, 1440)).toBe(662);
    await expectBox(page.getByText("Step 2 of 3 · Coach profile"), { x: 354, y: 120 });
    const title = page.getByRole("heading", { level: 1, name: "Your coach profile" });
    await expectBox(title, { x: 354, y: 142, h: 40 });
    expect(await title.evaluate((el) => getComputedStyle(el).fontSize)).toBe("32px");
    // Account ✓, Coach profile (current), Coaching type, Complete: 40 px rows, 4 px apart.
    const rows = page.locator("[data-step-nav] li > *");
    await expect(rows).toHaveCount(4);
    for (const [index, y] of [211, 255, 299, 343].entries()) {
      await expectBox(rows.nth(index), { x: 83, y, w: 212, h: 40 });
    }
    await expectBox(page.getByRole("textbox", { name: "Coach name" }), { x: 354, w: 662, h: 44 });
    await expectBox(page.getByLabel("Brand name · optional"), { x: 354, w: 662, h: 44 });
    await expectBox(page.getByRole("combobox", { name: "Country" }), { x: 354, w: 324, h: 44 });
    await expectBox(page.getByLabel("City"), { x: 692, w: 324, h: 44 });
    const bio = await box(page.getByLabel("Bio · optional"));
    expect(Math.abs(bio.x - 354)).toBeLessThanOrEqual(1);
    expect(bio.height).toBeGreaterThanOrEqual(96);
    await expectBox(page.locator('[data-field="languages"] label').first(), { h: 36 });
    const cta = await box(page.getByRole("button", { name: "Continue" }));
    expect(Math.abs(cta.height - 48)).toBeLessThanOrEqual(1);
    expect(Math.abs(cta.x + cta.width - 1016)).toBeLessThanOrEqual(1);
    await expectBox(page.locator("[data-coach-preview]"), { x: 1056, y: 120, w: 320 });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/production/wcr1-1440x980.png", fullPage: true });
  });

  test("WCR2: two format columns 12 px apart, levels, Back / Finish, preview", async ({ page }) => {
    await openStep(page, "type");
    await expectFrame(page, 1440);
    await expectBox(page.getByRole("heading", { level: 1, name: "How do you coach?" }), {
      x: 354,
      y: 142,
      h: 40,
    });
    const cards = page.locator('[data-field="coaching_formats"] label');
    await expect(cards).toHaveCount(4);
    const half = (662 - 12) / 2;
    await expectBox(cards.nth(0), { x: 354, w: half });
    await expectBox(cards.nth(1), { x: 354 + half + 12, w: half });
    const [first, third] = [await box(cards.nth(0)), await box(cards.nth(2))];
    expect(Math.abs(third.y - (first.y + first.height + 12))).toBeLessThanOrEqual(1);
    expect(await cards.first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe(
      "20px",
    );
    await expectBox(page.locator('[data-field="competition_levels"] label').first(), { h: 36 });
    await expectBox(page.getByRole("button", { name: "Back" }), { x: 354, h: 48 });
    const finish = await box(page.getByRole("button", { name: "Finish" }));
    expect(Math.abs(finish.x + finish.width - 1016)).toBeLessThanOrEqual(1);
    await expectBox(page.locator("[data-coach-preview]"), { x: 1056, y: 120, w: 320 });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/production/wcr2-1440x980.png", fullPage: true });
  });

  test("WCR2 invalid and WCR1 failure states keep the frame", async ({ page }) => {
    const api = await onboardingApi(page, { coachFields: PROFILE });
    await page.goto(`${ROUTE}?step=type`);
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByText("Pick at least one format.")).toBeVisible();
    await expectFrame(page, 1440);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/production/wcr2-invalid-1440x980.png" });
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("heading", { level: 1, name: "Your coach profile" }).waitFor();
    api.failWrites(1);
    await page.getByLabel("City").fill("Gdańsk");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("We couldn’t save your changes.")).toBeVisible();
    await expectFrame(page, 1440);
    await page.screenshot({ path: "test-results/production/wcr1-failure-1440x980.png" });
  });
});

test.describe("WCR7 at its artboard size (1440 × 940)", () => {
  test.use({ viewport: { width: 1440, height: 940 } });

  test("the fluid column and the 420 px card, 56 px apart on the 64 px gutters", async ({
    page,
  }) => {
    await openComplete(page);
    await expectBox(page.locator("header").first(), { x: 0, y: 0, w: 1440, h: 72 });
    await expect(page.getByText("Coach · done")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save & exit" })).toHaveCount(0);
    await expectBox(page.locator("[data-complete-step]"), { x: 64, y: 120, w: 1312 });
    await expectBox(page.locator("[data-coach-card]"), { x: 1440 - 64 - 420, y: 120, w: 420 });
    const title = page.getByRole("heading", { level: 1, name: "Your coach profile is ready." });
    expect(await title.evaluate((el) => getComputedStyle(el).fontSize)).toBe("40px");
    await expectBox(title, { x: 64 });
    await expectBox(page.locator("[data-complete-step] [aria-hidden]").first(), {
      x: 64,
      y: 120,
      w: 76,
      h: 76,
    });
    await expectBox(page.getByRole("button", { name: "Continue to coach home" }), {
      x: 64,
      h: 52,
    });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/production/wcr7-1440x940.png", fullPage: true });
  });
});

for (const [width, height] of [...VIEWPORTS, [1440, 980] as const]) {
  test.describe(`${width} × ${height}`, () => {
    test.use({ viewport: { width, height } });

    for (const step of ["profile", "type"] as const) {
      const code = step === "profile" ? "wcr1" : "wcr2";
      test(`${code.toUpperCase()}: the same three columns, full-bleed, top-aligned, actions reachable`, async ({
        page,
      }) => {
        await openStep(page, step);
        await expectFrame(page, width);
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        // Taller than the window only by its own content: the page scrolls, nothing is clipped.
        const action = page.getByRole("button", {
          name: step === "profile" ? "Continue" : "Finish",
        });
        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeInViewport();
        await expect(page.getByRole("button", { name: "Save & exit" })).toBeVisible();
        await page.screenshot({
          path: `test-results/production/${code}-${width}x${height}.png`,
          fullPage: true,
        });
      });
    }

    test("WCR7: the fluid column and the 420 px card", async ({ page }) => {
      await openComplete(page);
      await expectBox(page.locator("[data-coach-card]"), { x: width - 64 - 420, w: 420 });
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      const cta = page.getByRole("button", { name: "Continue to coach home" });
      await cta.scrollIntoViewIfNeeded();
      await expect(cta).toBeInViewport();
      await page.screenshot({
        path: `test-results/production/wcr7-${width}x${height}.png`,
        fullPage: true,
      });
    });
  });
}

test.describe("a narrow window (390 × 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const step of ["profile", "type"] as const) {
    test(`${step === "profile" ? "WCR1" : "WCR2"} stacks in one column with no horizontal scroll`, async ({
      page,
    }) => {
      await openStep(page, step);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      const nav = await box(page.locator("[data-step-nav]"));
      const form = await box(page.locator("[data-onboarding-grid] > div").first());
      expect(form.y).toBeGreaterThan(nav.y + nav.height - 1);
      expect(form.width).toBeLessThanOrEqual(390);
      const action = page.getByRole("button", { name: step === "profile" ? "Continue" : "Finish" });
      await action.scrollIntoViewIfNeeded();
      await expect(action).toBeInViewport();
      await page.screenshot({
        path: `test-results/production/${step === "profile" ? "wcr1" : "wcr2"}-390x844.png`,
        fullPage: true,
      });
    });
  }

  test("WCR7 stacks the card under the column", async ({ page }) => {
    await openComplete(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const cta = page.getByRole("button", { name: "Continue to coach home" });
    await cta.scrollIntoViewIfNeeded();
    await expect(cta).toBeInViewport();
    await page.screenshot({ path: "test-results/production/wcr7-390x844.png", fullPage: true });
  });
});
