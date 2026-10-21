import { expect, test, type Page } from "@playwright/test";

import { axeViolations, box, overflow, VIEWPORTS } from "./harness";
import { onboardingApi } from "./onboarding-api";
import { FIGHTER_DONE, trainingApi } from "./training-api";

/*
 * The Fighter Home's Training card on the production build (SF-68), against
 * Claude Design 1792578392-00ac (FRW1 `FirstRunWebF.dc.html`, training=… /
 * recent=…): under the Pro note, the backend's first upcoming session and
 * the latest completed ones. Every SF-40 card keeps its place, the
 * first-run record is never written, a training failure stays inside the
 * card, and a completion on Training shows on Home after it reads again.
 * The SF-63 endpoints are the stateful double of `training-api.ts`.
 */

test.use({ timezoneId: "America/New_York" });

async function home(page: Page, options: { firstRun?: boolean } = {}) {
  const api = await onboardingApi(
    page,
    options.firstRun ? { fields: FIGHTER_DONE.fields, completed: true } : FIGHTER_DONE,
  );
  const training = await trainingApi(page);
  await page.goto("/en/app/home");
  await page.evaluate(() => document.fonts.ready);
  return { api, training };
}

const card = (page: Page) => page.getByRole("region", { name: "Training" });
/** Writes to the product API (the session refresh on load is the auth bootstrap, not a write). */
const writes = (requests: { method: string; path: string }[]) =>
  requests.filter((request) => request.method !== "GET" && request.path.startsWith("/api/v1/"));
const near = (actual: number, expected: number, tolerance = 2) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

test.describe("at the artboard size (1440 × 900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the card sits under the Pro note; every SF-40 card keeps its place", async ({ page }) => {
    const { api } = await home(page);
    await expect(card(page).getByRole("link", { name: /Pads with coach/ })).toBeVisible();

    const checklist = await box(page.locator("[data-setup-checklist]"));
    const app = await box(page.locator("[data-home-app]"));
    const note = await box(page.locator('[data-slot="notice"]').first());
    const training = await box(page.locator("[data-home-training]"));
    near(checklist.x, 272);
    near(checklist.y, 101);
    near(app.x, 933.1);
    near(app.y, 101);
    near(training.x, app.x, 1);
    near(training.width, app.width, 1);
    near(training.y, note.y + note.height + 16);
    expect(await overflow(page)).toBe(0);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/sf68-home-1440.png" });

    // The backend's first upcoming session (ses-1 started and is past due: History).
    const next = page.locator("[data-home-next]");
    await expect(next).toHaveAttribute("href", "/en/app/training/ses-2");
    await expect(next).toContainText("05:30 PM");
    await expect(next).toContainText("Fri, Oct 23 · Europe/Warsaw");
    await expect(next).toContainText("Pads · Coach not shared · 45 min");
    await expect(page.locator("[data-home-recent=ses-3]")).toContainText("Roadwork intervals");
    await expect(card(page)).not.toContainText(/\d+ (sessions|upcoming|completed)/i);
    expect(writes(api.requests)).toEqual([]);
  });

  test("next opens WFT2; All training opens WFT1; Back returns Home", async ({ page }) => {
    await home(page);
    await card(page)
      .getByRole("link", { name: /Pads with coach/ })
      .click();
    await page.waitForURL("**/en/app/training/ses-2");
    await expect(page.getByRole("heading", { level: 1, name: "Pads with coach" })).toBeVisible();
    await page.goBack();
    await page.waitForURL("**/en/app/home");
    await card(page).getByRole("link", { name: "All training →" }).click();
    await page.waitForURL("**/en/app/training");
    await page.goBack();
    await expect(card(page).locator("[data-home-next]")).toBeVisible();
  });

  test("a completion on Training reaches Home, once, without touching the first run", async ({
    page,
  }) => {
    const { api, training } = await home(page);
    await expect(page.locator("[data-home-recent]")).toHaveCount(1);
    await page.goto("/en/app/training/ses-1");
    await page.getByRole("button", { name: "Mark as completed" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Mark as completed" }).click();
    await expect(page.locator("[data-status=completed]")).toBeVisible();
    await page.getByRole("complementary").getByRole("link", { name: "Home", exact: true }).click();
    await page.waitForURL("**/en/app/home");
    await expect(page.locator("[data-home-recent]")).toHaveCount(2);
    await expect(page.locator("[data-home-recent=ses-1]")).toContainText("Technical boxing");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(training.filter((request) => request.method === "POST")).toHaveLength(1);
    expect(
      api.requests.filter(
        (request) => request.path.startsWith("/api/v1/me/first-run") && request.method !== "GET",
      ),
    ).toEqual([]);
  });

  test("during the first run the card loads, the checklist stays 0 / 6 and the tour is not opened", async ({
    page,
  }) => {
    const { api } = await home(page, { firstRun: true });
    await expect(
      page.getByRole("heading", { level: 1, name: /Welcome to SimpleFit/ }),
    ).toBeVisible();
    await expect(card(page).locator("[data-home-next]")).toBeVisible();
    const checklist = page.getByRole("region", { name: "Set up your corner" });
    await expect(checklist.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    await expect(checklist.getByText("Not available yet")).toHaveCount(6);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(writes(api.requests)).toEqual([]);
  });

  test("a failed read stays in the card, is never an empty schedule, and retries", async ({
    page,
  }) => {
    await onboardingApi(page, FIGHTER_DONE);
    await trainingApi(page);
    let failing = true;
    await page.route(
      (url) => url.port !== "3100" && url.pathname === "/api/v1/me/training-sessions",
      (route) => (failing ? route.abort("internetdisconnected") : route.fallback()),
    );
    await page.goto("/en/app/home");
    await expect(card(page).getByRole("alert")).toHaveCount(2, { timeout: 15_000 });
    await expect(card(page)).not.toContainText("No training scheduled yet");
    await expect(page.getByRole("region", { name: "Set up your corner" })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    failing = false;
    await card(page).getByRole("button", { name: "Try again" }).first().click();
    await expect(card(page).locator("[data-home-next]")).toBeVisible();
  });

  test("not available without a fighter profile; nothing scheduled is its own state", async ({
    page,
  }) => {
    await onboardingApi(page, FIGHTER_DONE);
    await trainingApi(page, { profile: false });
    await page.goto("/en/app/home");
    await expect(card(page)).toContainText("Training isn’t available");
    await expect(card(page)).not.toContainText("No training scheduled yet");

    const fresh = await page.context().newPage();
    await onboardingApi(fresh, FIGHTER_DONE);
    await fresh.goto("/en/app/home");
    await expect(card(fresh)).toContainText("No training scheduled yet");
    await expect(card(fresh)).toContainText("No completed sessions yet.");
    expect(await axeViolations(fresh)).toEqual([]);
  });
});

test.describe("across the laptop and desktop matrix", () => {
  for (const [width, height] of VIEWPORTS) {
    test(`${width} × ${height}: the card under the Pro note, nothing clipped`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await home(page);
      await expect(card(page).locator("[data-home-next]")).toBeVisible();
      const app = await box(page.locator("[data-home-app]"));
      const training = await box(page.locator("[data-home-training]"));
      near(training.x, app.x, 1);
      near(training.width, app.width, 1);
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
    test(`${width} px: Home with the card fits, axe clean`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await home(page);
      await expect(card(page).locator("[data-home-next]")).toBeVisible();
      expect(await overflow(page)).toBe(0);
      expect(await axeViolations(page)).toEqual([]);
      await page.screenshot({ path: `test-results/sf68-home-${width}.png`, fullPage: true });
    });
  }
});
