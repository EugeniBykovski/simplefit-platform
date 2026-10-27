import { expect, test, type Page } from "@playwright/test";

import { gymApi } from "./gym-api";
import { axeViolations, box, expectBox, overflow } from "./harness";
import { onboardingApi } from "./onboarding-api";

/*
 * Gym owner registration geometry on the production build (SF-86), against
 * Claude Design 1792675284-1046 (GYM 5e, 1440 × 900): the 300 px setup rail,
 * the step header on the 48 px gutter, the form beside the 360 px aside and
 * the 84 px action bar. At the artboard size the anchors land on the
 * artboard's coordinates (1 px); across the desktop matrix the composition
 * keeps its topology, fluid in the form column; below the desktop range the
 * rail becomes a top bar and the columns stack. Nothing scrolls sideways.
 */

const ROUTE = "/en/app/onboarding/gym";
const LOCATION = {
  id: "loc-1",
  name: "Warsaw",
  country_code: "PL",
  city: "Warsaw",
  address_line: "ul. Ząbkowska 31, 03-736",
  entrance_note: "Entrance from the courtyard, 1st floor",
  is_primary: true,
};
const DRAFT = {
  name: "Simple Boxing Gym",
  phone: "+48 22 000 00 00",
  website: "https://simpleboxing.pl",
  location: LOCATION,
};

async function openStep(page: Page, step: "type" | "location" | "branding", empty = false) {
  await onboardingApi(page);
  await gymApi(page, empty ? {} : { gyms: [DRAFT] });
  await page.goto(`${ROUTE}?step=${step}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function openCreated(page: Page) {
  await openStep(page, "branding");
  await page.getByRole("button", { name: "Create gym" }).click();
  await page.getByRole("heading", { level: 1, name: /is created/ }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

/** The GymSetupSteps rail and the step frame at a desktop width. */
async function expectDesktopFrame(page: Page, width: number, height: number) {
  await expectBox(page.locator("[data-setup-rail]"), { x: 0, y: 0, w: 300, h: height });
  await expectBox(page.locator("#main"), { x: 300, w: width - 300 });
  const footer = page.locator("[data-step-footer]");
  await expectBox(footer, { x: 300, w: width - 300, h: 84 });
  const f = await box(footer);
  expect(Math.abs(f.y + f.height - height)).toBeLessThanOrEqual(1);
  const preview = page.locator("[data-preview]").first();
  const p = await box(preview);
  expect(Math.abs(p.x + p.width - (width - 48))).toBeLessThanOrEqual(1);
  expect(overflow(page)).resolves.toBe(0);
}

test.describe("at the artboard size (1440 × 900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("OG1: rail, header, fields, aside and action bar on the artboard", async ({ page }) => {
    await openStep(page, "type");
    await expectDesktopFrame(page, 1440, 900);
    await expectBox(page.getByText("Step 1 of 3 · Create your gym"), { x: 348 });
    const title = page.getByRole("heading", { level: 1, name: "Gym name & type" });
    await expectBox(title, { x: 348, h: 38 });
    expect(await title.evaluate((el) => getComputedStyle(el).fontSize)).toBe("30px");
    // The form column runs from the 48 px gutter to the aside, 26 px before it.
    await expectBox(page.getByRole("textbox", { name: "Gym name" }), { x: 348, w: 658, h: 44 });
    await expectBox(page.locator("[data-preview]").first(), { x: 1032, w: 360 });
    // The type pills are 36 px.
    await expectBox(page.locator('[data-field="gym_type"] label').first(), { h: 36 });
    // Continue: 48 px, 48 px from the right edge, centred in the bar.
    const cta = await box(page.getByRole("button", { name: "Continue" }));
    expect(Math.abs(cta.x + cta.width - 1392)).toBeLessThanOrEqual(1);
    expect(Math.abs(cta.y + cta.height / 2 - (900 - 42))).toBeLessThanOrEqual(1);
    // The rail: brand, progress, the three steps, then the eleven later rows, all in the window.
    const rows = page.locator("[data-setup-rail] nav li");
    await expect(rows).toHaveCount(14);
    const last = await box(rows.last());
    expect(last.y + last.height).toBeLessThanOrEqual(900);
  });

  test("OG2: three address fields on one row, the note below", async ({ page }) => {
    await openStep(page, "location");
    await expectDesktopFrame(page, 1440, 900);
    const country = await box(page.getByRole("combobox", { name: "Country" }));
    const city = await box(page.getByRole("textbox", { name: "City" }));
    const address = await box(page.getByRole("textbox", { name: "Address", exact: true }));
    expect(Math.abs(country.y - city.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(city.y - address.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(address.width - 2 * city.width)).toBeLessThanOrEqual(1);
    await expectBox(page.getByRole("textbox", { name: "Entrance note · optional" }), {
      x: 348,
      w: 658,
    });
  });

  test("OG3: logo tile, six 34 px swatches, tagline, cover and the 250 px phone", async ({
    page,
  }) => {
    await openStep(page, "branding");
    await expectDesktopFrame(page, 1440, 900);
    await expectBox(page.locator('[data-unavailable="logo"] > span').first(), { w: 140, h: 140 });
    const swatches = page.locator('[data-field="accent_color"] label');
    await expect(swatches).toHaveCount(6);
    await expectBox(swatches.first(), { w: 34, h: 34 });
    await expectBox(page.locator("[data-preview] > div").last(), { w: 250, h: 500 });
  });

  test("OG6b: the 72 px check, the 40 px headline and the 380 px list", async ({ page }) => {
    await openCreated(page);
    const title = page.getByRole("heading", { level: 1, name: "Simple Boxing Gym is created." });
    expect(await title.evaluate((el) => getComputedStyle(el).fontSize)).toBe("40px");
    await expectBox(page.locator("[data-created-step] > div > span").first(), {
      x: 364,
      y: 64,
      w: 72,
      h: 72,
    });
    const list = await box(page.locator("[data-created-step] > section"));
    expect(Math.abs(list.width - 380)).toBeLessThanOrEqual(1);
    expect(Math.abs(list.x + list.width - (1440 - 64))).toBeLessThanOrEqual(1);
  });

  for (const scheme of ["dark", "light"] as const) {
    test(`axe: every step is clean (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const step of ["type", "location", "branding"] as const) {
        await openStep(page, step);
        expect(await axeViolations(page), step).toEqual([]);
      }
      await page.getByRole("button", { name: "Create gym" }).click();
      await page.getByRole("heading", { level: 1, name: /is created/ }).waitFor();
      expect(await axeViolations(page), "complete").toEqual([]);
    });
  }

  test("axe: notices and field errors are clean", async ({ page }) => {
    await openStep(page, "type", true);
    await page.getByLabel("Phone · optional").fill("call me");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Check the highlighted fields.").waitFor();
    expect(await axeViolations(page)).toEqual([]);
  });
});

for (const [width, height] of [
  [1920, 1080],
  [1728, 1117],
  [1512, 982],
  [1366, 768],
  [1280, 720],
] as const) {
  test(`${width} × ${height}: the same composition, fluid form column`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const step of ["type", "location", "branding"] as const) {
      await openStep(page, step);
      await expectDesktopFrame(page, width, height);
      await expectBox(page.locator("[data-preview]").first(), {
        x: width - 48 - 360,
        w: 360,
      });
    }
  });
}

for (const [width, height] of [
  [1024, 768],
  [768, 1024],
  [390, 844],
  [375, 667],
  [320, 640],
] as const) {
  test(`${width} × ${height}: rail on top, stacked columns, nothing clipped`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const step of ["type", "location", "branding"] as const) {
      await openStep(page, step);
      expect(await overflow(page), step).toBe(0);
      await expectBox(page.locator("[data-setup-rail]"), { x: 0, y: 0, w: width });
      await expect(page.getByRole("navigation", { name: "Gym setup steps" })).toBeVisible();
      const heading = await box(page.getByRole("heading", { level: 1 }));
      expect(heading.x).toBeGreaterThanOrEqual(16);
      expect(heading.x + heading.width).toBeLessThanOrEqual(width - 16 + 1);
      // The action bar stays in the window while the form scrolls.
      const footer = await box(page.locator("[data-step-footer]"));
      expect(footer.y + footer.height).toBeLessThanOrEqual(height + 1);
      const primary = page
        .locator("[data-step-footer]")
        .getByRole("button", { name: step === "branding" ? "Create gym" : "Continue" });
      await expect(primary).toBeInViewport();
    }
    await page.getByRole("button", { name: "Create gym" }).click();
    await page.getByRole("heading", { level: 1, name: /is created/ }).waitFor();
    expect(await overflow(page)).toBe(0);
    await expect(page.getByRole("button", { name: "Go to gym" })).toBeVisible();
  });
}

test("all seven locales render every step without raw keys or sideways scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await onboardingApi(page);
  await gymApi(page, { gyms: [DRAFT] });
  for (const locale of ["en", "de", "es", "es-MX", "fr", "pl", "ru", "uk"]) {
    for (const step of ["type", "location", "branding"]) {
      await page.goto(`/${locale}/app/onboarding/gym?step=${step}`);
      await page.getByRole("heading", { level: 1 }).waitFor();
      const text = await page.locator("body").innerText();
      expect(text, `${locale} ${step}`).not.toMatch(/gymOnboarding\.|\{\w+\}/);
      expect(await overflow(page), `${locale} ${step}`).toBe(0);
    }
  }
});
