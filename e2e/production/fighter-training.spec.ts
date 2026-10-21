import { expect, test, type Page } from "@playwright/test";

import { axeViolations, box, overflow, VIEWPORTS } from "./harness";
import { onboardingApi } from "./onboarding-api";
import { FIGHTER_DONE, trainingApi, type Options, type Recorded } from "./training-api";

/*
 * Fighter Training on the production build (SF-67), against Claude Design
 * 1792573853-9116: WFT1 Training, WFT2 Session with its completion dialog,
 * and FighterWebNav with Training linked. The SF-62 / SF-63 fighter session
 * endpoints are mocked at the network edge as a small stateful backend whose
 * clock decides what has started; everything else is the real route, gate,
 * shell and screen. The browser is in New York, the sessions in Warsaw.
 */

test.use({ timezoneId: "America/New_York" });

async function open(page: Page, path: string, options: Options = {}) {
  await onboardingApi(page, FIGHTER_DONE);
  const requests = await trainingApi(page, options);
  await page.goto(`/en${path}`);
  await page.evaluate(() => document.fonts.ready);
  return requests;
}

async function dialogViolations(page: Page) {
  const dialog = page.locator("[role=dialog], [role=alertdialog]");
  await dialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  return (await axeViolations(page)).filter((rule) => !rule.startsWith("region "));
}

const near = (actual: number, expected: number, tolerance = 2) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

const writes = (requests: Recorded[]) => requests.filter((request) => request.method !== "GET");

test.describe("WFT1 at the artboard size (1440 × 900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the Fighter nav's Training opens the agenda; it and its 320 px aside sit top-aligned", async ({
    page,
  }) => {
    const requests = await open(page, "/app/home");
    const nav = page.getByRole("complementary");
    await expect(nav.getByRole("link", { name: "Fight camp" })).toHaveCount(0);
    await nav.getByRole("link", { name: "Training", exact: true }).click();
    await page.waitForURL("**/en/app/training");
    await page.getByRole("link", { name: "Pads with coach" }).waitFor();
    await expect(nav.getByRole("link", { name: "Training", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page).toHaveTitle(/Training/);

    const header = await box(page.locator("header").filter({ hasText: "Fighter · Training" }));
    near(header.height, 76);
    const list = await box(page.getByRole("region", { name: "Upcoming" }));
    const aside = await box(page.locator("[data-training-aside]"));
    near(list.x, 272);
    near(list.y, aside.y);
    near(aside.width, 320);
    near(aside.x + aside.width, 1408);
    near(aside.x - (list.x + list.width), 20);
    // Rows show the start in the session's zone, grouped by its day, with the coach.
    const row = page.locator("[data-session-row=ses-2]");
    await expect(row).toContainText("05:30 PM");
    await expect(row).toContainText("Europe/Warsaw");
    await expect(row).toContainText("Coach not shared");
    await expect(page.getByRole("heading", { level: 3, name: "Fri, Oct 23, 2026" })).toBeVisible();
    expect(await overflow(page)).toBe(0);
    expect(await axeViolations(page)).toEqual([]);
    expect(requests.map((r) => r.path)).toContain(
      "/api/v1/me/training-sessions?view=upcoming&limit=50",
    );
    expect(writes(requests)).toEqual([]);
  });

  test("History is the query view, narrowed by status, with a former coach and a started session kept planned", async ({
    page,
  }) => {
    const requests = await open(page, "/app/training");
    await page.getByRole("link", { name: "History" }).click();
    await page.waitForURL("**/en/app/training?view=history");
    await expect(page.locator("[data-session-row=ses-1]")).toContainText("Planned");
    await expect(page.locator("[data-session-row=ses-4]")).toContainText(
      "Former coach · Tomasz M.",
    );
    await page.getByRole("link", { name: "Completed" }).click();
    await page.waitForURL("**/en/app/training?view=history&status=completed");
    await expect(page.getByRole("link", { name: "Roadwork intervals" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sparring rounds" })).toHaveCount(0);
    expect(requests.map((r) => r.path)).toContain(
      "/api/v1/me/training-sessions?view=history&status=completed&limit=50",
    );
    expect(await axeViolations(page)).toEqual([]);
  });

  test("not available without a fighter profile: never an empty list", async ({ page }) => {
    const requests = await open(page, "/app/training", { profile: false });
    await expect(page.getByText("Training isn’t available")).toBeVisible();
    await expect(page.getByText("No upcoming training")).toHaveCount(0);
    expect(writes(requests)).toEqual([]);
    expect(await axeViolations(page)).toEqual([]);
  });
});

test.describe("WFT2 and its completion", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("completes a started session only after confirmation, with no body, and shows the stored time", async ({
    page,
  }) => {
    const requests = await open(page, "/app/training");
    await page.goto("/en/app/training?view=history");
    await page.getByRole("link", { name: "Technical boxing" }).click();
    await page.waitForURL("**/en/app/training/ses-1");
    await page.getByRole("heading", { level: 1, name: "Technical boxing" }).waitFor();
    await expect(page).toHaveTitle(/Session/);
    await expect(
      page.getByText("Wed, Oct 21, 2026, 06:00 PM · Europe/Warsaw (UTC+02:00)"),
    ).toBeVisible();
    await expect(page.getByText("Wed, Oct 21, 2026, 12:00 PM · America/New_York")).toBeVisible();
    await expect(page.getByText("Julia N. · North Gym")).toBeVisible();
    expect(await overflow(page)).toBe(0);
    expect(await axeViolations(page)).toEqual([]);

    await page.getByRole("button", { name: "Mark as completed" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Mark this session completed?" });
    await expect(dialog).toContainText("Julia N. sees it as completed");
    expect(await dialogViolations(page)).toEqual([]);
    await dialog.getByRole("button", { name: "Not yet" }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes(requests)).toEqual([]);

    await page.getByRole("button", { name: "Mark as completed" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Mark as completed" }).click();
    await expect(page.locator("[data-status=completed]")).toBeVisible();
    await expect(page.getByText("Wed, Oct 21, 2026, 01:12 PM")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark as completed" })).toHaveCount(0);
    expect(writes(requests)).toEqual([
      { method: "POST", path: "/api/v1/me/training-sessions/ses-1/complete", body: null },
    ]);
  });

  test("a lost answer says it may already be saved; trying again shows the one stored completion", async ({
    page,
  }) => {
    const requests = await open(page, "/app/training/ses-1", { lose: true });
    await page.getByRole("heading", { level: 1, name: "Technical boxing" }).waitFor();
    await page.getByRole("button", { name: "Mark as completed" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Mark as completed" }).click();
    await expect(dialog.getByRole("alert")).toContainText("It may already be saved");
    await expect(page.locator("[data-status=planned]")).toHaveCount(1);
    await dialog.getByRole("button", { name: "Mark as completed" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("[data-status=completed]")).toBeVisible();
    await expect(page.getByText("Wed, Oct 21, 2026, 01:12 PM")).toBeVisible();
    expect(writes(requests)).toHaveLength(2);
  });

  test("before its start the backend refuses, and nothing changes", async ({ page }) => {
    await open(page, "/app/training/ses-2");
    await page.getByRole("heading", { level: 1, name: "Pads with coach" }).waitFor();
    await page.getByRole("button", { name: "Mark as completed" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Mark as completed" }).click();
    await expect(page.locator("[data-refusal=notStarted]")).toContainText(
      "This session hasn’t started yet.",
    );
    await expect(page.locator("[data-status=planned]")).toBeVisible();
    // Measured once the dialog has finished closing (its fade would be measured too).
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(await axeViolations(page)).toEqual([]);
  });

  test("terminal sessions are read-only; an unknown one is not available", async ({ page }) => {
    await open(page, "/app/training/ses-4");
    await expect(page.locator("[data-status=cancelled]")).toBeVisible();
    await expect(page.getByText(/the coaching relationship ended/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark as completed" })).toHaveCount(0);
    await page.goto("/en/app/training/someone-elses");
    await expect(page.getByText("This session isn’t available")).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });
});

test.describe("the FIGHTER gate", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("a Coach-only account never reaches Training or its API", async ({ page }) => {
    await onboardingApi(page, {
      coachFields: {
        display_name: "Alex Novak",
        brand_name: null,
        country_code: "PL",
        city: "Warsaw",
        bio: "Footwork-first boxing.",
        languages: ["en"],
        coaching_formats: ["personal_training"],
        competition_levels: ["amateur"],
      },
      coachCompleted: true,
      lastContext: "coach",
      tour: "completed",
    });
    const requests = await trainingApi(page);
    await page.goto("/en/app/training/ses-1");
    await page.waitForURL((url) => !url.pathname.startsWith("/en/app/training"));
    await expect(page.getByRole("heading", { name: "Technical boxing" })).toHaveCount(0);
    expect(requests).toEqual([]);
  });
});

test.describe("across the laptop and desktop matrix", () => {
  for (const [width, height] of VIEWPORTS) {
    test(`${width} × ${height}: two top-aligned columns, nothing clipped`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page, "/app/training");
      await page.getByRole("link", { name: "Pads with coach" }).waitFor();
      const list = await box(page.getByRole("region", { name: "Upcoming" }));
      const aside = await box(page.locator("[data-training-aside]"));
      near(list.y, aside.y);
      near(aside.width, 320);
      expect(list.width).toBeGreaterThan(aside.width);
      expect(await overflow(page)).toBe(0);

      await page.goto("/en/app/training/ses-1");
      await page.getByRole("heading", { level: 1, name: "Technical boxing" }).waitFor();
      const card = await box(page.getByRole("region", { name: "Session" }));
      const note = await box(page.locator("[data-training-aside]"));
      near(card.y, note.y);
      expect(card.width).toBeLessThanOrEqual(720 + 1);
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
    test(`${width} px: list, session and dialog fit, axe clean`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page, "/app/training?view=history");
      await page.getByRole("link", { name: "Roadwork intervals" }).waitFor();
      expect(await overflow(page)).toBe(0);
      expect(await axeViolations(page)).toEqual([]);

      await page.goto("/en/app/training/ses-1");
      await page.getByRole("heading", { level: 1, name: "Technical boxing" }).waitFor();
      expect(await overflow(page)).toBe(0);
      expect(await axeViolations(page)).toEqual([]);
      await page.getByRole("button", { name: "Mark as completed" }).click();
      await page.getByRole("alertdialog").waitFor();
      expect(await overflow(page)).toBe(0);
      expect(await dialogViolations(page)).toEqual([]);
      await page.screenshot({ path: `test-results/sf67-wft2-${width}.png`, fullPage: true });
    });
  }
});
