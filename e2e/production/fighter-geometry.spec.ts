import { expect, test, type Page } from "@playwright/test";

import { fighterApi } from "./fighter-api";
import { axeViolations, box, expectBox, overflow, VIEWPORTS } from "./harness";

/*
 * Fighter web registration geometry on the production build (SF-38), against
 * Claude Design V78: WF0 WebRegFAccount and WF1 WebRegFProfile (1440 × 980),
 * WF6 WebRegFDone (1440 × 900). At the artboard size the anchors land on the
 * artboard's coordinates (1 px); across the laptop matrix the composition is
 * the same three columns, fluid in the middle, full-bleed, nothing clipped.
 */

const ROUTE = "/en/app/onboarding/fighter";
const BASICS = { display_name: "Alex K.", username: "alex_k", country_code: "PL", city: "Warsaw" };
const PROFILE = {
  ...BASICS,
  experience_level: "competitive_amateur",
  stance: "orthodox",
  amateur_bout_count: 14,
  goals: ["improve_technique", "competition"],
  weight_class: "minus_75",
  current_weight_kg: 73.8,
  height_cm: 178,
  next_fight_on: "2026-11-03",
  next_fight_name: "Warsaw Cup",
};

async function openStep(page: Page, step: "basics" | "profile", fields: Record<string, unknown>) {
  await fighterApi(page, { fields });
  await page.goto(`${ROUTE}?step=${step}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

/** WF6: complete from WF1, as the page only shows it right after completion. */
async function openComplete(page: Page) {
  await openStep(page, "profile", PROFILE);
  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByRole("heading", { level: 1, name: "You’re in, Alex." }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

/** The WF frame: the 72 px header and the three columns on the 64 px gutters. */
async function expectFrame(page: Page, width: number) {
  await expectBox(page.locator("[data-fighter-onboarding]"), { x: 0, y: 0, w: width });
  await expectBox(page.locator("header").first(), { x: 0, y: 0, w: width, h: 72 });
  await expectBox(page.locator("header a").first(), { x: 56, h: 30 });
  const exit = page.getByRole("button", { name: "Save & exit" });
  const exitBox = await box(exit);
  expect(Math.abs(exitBox.x + exitBox.width - (width - 56))).toBeLessThanOrEqual(1);
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

  test("WF0: frame, step card, heading, fields, CTA and preview on the artboard", async ({
    page,
  }) => {
    await openStep(page, "basics", BASICS);
    const formWidth = await expectFrame(page, 1440);
    expect(formWidth).toBe(662);
    // Eyebrow, the 32 px heading (onboarding-title) 8 px under it, the lead.
    await expectBox(page.getByText("Step 1 of 2 · Profile basics"), { x: 354, y: 120 });
    const title = page.getByRole("heading", { level: 1, name: "Your fighter profile" });
    await expectBox(title, { x: 354, y: 142, h: 40 });
    expect(await title.evaluate((el) => getComputedStyle(el).fontSize)).toBe("32px");
    // Step rows: 40 px, 4 px apart, the current one on the olive well.
    const rows = page.locator("[data-step-nav] li > *");
    for (const [index, y] of [211, 255, 299].entries()) {
      await expectBox(rows.nth(index), { x: 83, y, w: 212, h: 40 });
    }
    // The 44 px fields across the column; country and city split it with a 14 px gap.
    await expectBox(page.getByLabel("Name", { exact: true }), { x: 354, w: 662, h: 44 });
    await expectBox(page.getByRole("textbox", { name: "Username" }), { x: 354, w: 662, h: 44 });
    await expectBox(page.getByRole("combobox", { name: "Country" }), { x: 354, w: 324, h: 44 });
    await expectBox(page.getByLabel("City"), { x: 692, w: 324, h: 44 });
    // Continue: 48 px, at least 120 wide, on the column's right edge.
    const cta = await box(page.getByRole("button", { name: "Continue" }));
    expect(Math.abs(cta.height - 48)).toBeLessThanOrEqual(1);
    expect(cta.width).toBeGreaterThanOrEqual(120);
    expect(Math.abs(cta.x + cta.width - 1016)).toBeLessThanOrEqual(1);
    await expectBox(page.locator("[data-profile-preview]"), { x: 1056, y: 120, w: 320 });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/production/wf0-1440x980.png", fullPage: true });
  });

  test("WF1: segments, goals, the three and two field rows, Back / Finish, summary", async ({
    page,
  }) => {
    await openStep(page, "profile", PROFILE);
    await expectFrame(page, 1440);
    await expectBox(page.getByRole("heading", { level: 1, name: "Your boxing profile" }), {
      x: 354,
      y: 142,
      h: 40,
    });
    // Experience: five 36 px segments in a 4 px padded well across the column.
    const experience = page.locator('[data-field="experience_level"]');
    await expectBox(experience, { x: 354, w: 662 });
    for (const segment of await experience.locator("label").all()) {
      await expectBox(segment, { h: 36 });
    }
    // Stance (3 segments) beside Amateur bouts, 14 px apart.
    await expectBox(page.locator('[data-field="stance"]'), { x: 354, w: 324 });
    await expectBox(page.getByLabel("Amateur bouts · optional"), { x: 692, w: 324, h: 44 });
    // Weight class | weight | height in thirds; date | event in halves.
    const third = (662 - 28) / 3;
    await expectBox(page.locator('[data-field="weight_class"]'), { x: 354, w: third, h: 44 });
    await expectBox(page.getByLabel("Current weight · optional"), {
      x: 354 + third + 14,
      w: third,
      h: 44,
    });
    await expectBox(page.getByLabel("Height · optional"), {
      x: 354 + 2 * (third + 14),
      w: third,
      h: 44,
    });
    await expectBox(page.getByLabel("Next fight date · optional"), { x: 354, w: 324, h: 44 });
    await expectBox(page.getByLabel("Next fight event · optional"), { x: 692, w: 324, h: 44 });
    await expectBox(page.getByRole("button", { name: "Back" }), { x: 354, h: 48 });
    const finish = await box(page.getByRole("button", { name: "Finish" }));
    expect(Math.abs(finish.x + finish.width - 1016)).toBeLessThanOrEqual(1);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/production/wf1-1440x980.png", fullPage: true });
  });
});

test.describe("WF6 at its artboard size (1440 × 900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("a 560 px column centred under the header, the 40 px headline, the card and Home", async ({
    page,
  }) => {
    await openComplete(page);
    await expectBox(page.locator("header").first(), { x: 0, y: 0, w: 1440, h: 72 });
    await expect(page.getByText("Fighter · done")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save & exit" })).toHaveCount(0);
    await expectBox(page.locator("[data-complete-step]"), { x: 440, y: 72 + 96, w: 560 });
    const title = page.getByRole("heading", { level: 1, name: "You’re in, Alex." });
    expect(await title.evaluate((el) => getComputedStyle(el).fontSize)).toBe("40px");
    await expectBox(title, { x: 440, h: 44 });
    await expectBox(page.getByRole("link", { name: "Go to my home" }), { x: 440, h: 52 });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/production/wf6-1440x900.png", fullPage: true });
  });
});

for (const [width, height] of VIEWPORTS) {
  test.describe(`${width} × ${height}`, () => {
    test.use({ viewport: { width, height } });

    for (const step of ["basics", "profile"] as const) {
      test(`${step === "basics" ? "WF0" : "WF1"}: the same three columns, full-bleed, actions reachable`, async ({
        page,
      }) => {
        await openStep(page, step, step === "basics" ? BASICS : PROFILE);
        await expectFrame(page, width);
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        // Taller than the window only by its own content: the page scrolls, nothing is clipped.
        const action = page.getByRole("button", {
          name: step === "basics" ? "Continue" : "Finish",
        });
        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeInViewport();
        await expect(page.getByRole("button", { name: "Save & exit" })).toBeVisible();
        await page.screenshot({
          path: `test-results/production/wf${step === "basics" ? 0 : 1}-${width}x${height}.png`,
          fullPage: true,
        });
      });
    }

    test("WF6: the centred 560 px column", async ({ page }) => {
      await openComplete(page);
      await expectBox(page.locator("[data-complete-step]"), { x: (width - 560) / 2, w: 560 });
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.getByRole("link", { name: "Go to my home" }).scrollIntoViewIfNeeded();
      await expect(page.getByRole("link", { name: "Go to my home" })).toBeInViewport();
    });
  });
}
