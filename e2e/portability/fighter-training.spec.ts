import { expect, test } from "@playwright/test";

import { onboardingApi } from "../production/onboarding-api";
import { FIGHTER_DONE, trainingApi } from "../production/training-api";

/*
 * Fighter Training (SF-67, WFT1 / WFT2) in every engine, on the production
 * build: day groups, starts and offsets come from each engine's Intl time
 * zone data; the row layout from its container queries; the completion
 * dialog must keep focus, close with Escape before anything is sent, and
 * send one bodiless request after the confirmation.
 */

test.use({ viewport: { width: 1440, height: 900 } });

for (const timezoneId of ["America/New_York", "Pacific/Kiritimati"]) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });

    test("days and starts follow each session's own zone; the viewer's time is its own", async ({
      page,
    }) => {
      await onboardingApi(page, FIGHTER_DONE);
      await trainingApi(page);
      await page.goto("/en/app/training");
      await expect(
        page.getByRole("heading", { level: 3, name: "Fri, Oct 23, 2026" }),
      ).toBeVisible();
      const row = page.locator("[data-session-row=ses-2]");
      await expect(row).toContainText("05:30 PM");
      // Six columns at this width: type, coach and duration sit in their own cells.
      await expect(row.getByText("Coach not shared", { exact: true })).toBeVisible();

      await page.goto("/en/app/training/ses-1");
      // Engines join date and time differently (", " or " at "); the values must match.
      const at = "(,| at)";
      await expect(
        page.getByText(
          new RegExp(`^Wed, Oct 21, 2026${at} 06:00 PM · Europe/Warsaw \\(UTC\\+02:00\\)$`),
        ),
      ).toBeVisible();
      await expect(
        page.getByText(
          new RegExp(
            timezoneId === "America/New_York"
              ? `^Wed, Oct 21, 2026${at} 12:00 PM · America/New_York$`
              : `^Thu, Oct 22, 2026${at} 06:00 AM · Pacific/Kiritimati$`,
          ),
        ),
      ).toBeVisible();
    });
  });
}

test("the completion dialog keeps focus, Escape sends nothing, and confirming sends one request", async ({
  page,
}) => {
  await onboardingApi(page, FIGHTER_DONE);
  const requests = await trainingApi(page);
  await page.goto("/en/app/training/ses-1");
  const open = page.getByRole("button", { name: "Mark as completed" });
  await open.click();
  const dialog = page.getByRole("alertdialog", { name: "Mark this session completed?" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  expect(requests.filter((request) => request.method === "POST")).toEqual([]);

  await open.click();
  await dialog.getByRole("button", { name: "Mark as completed" }).click();
  await expect(page.locator("[data-status=completed]")).toBeVisible();
  expect(requests.filter((request) => request.method === "POST")).toEqual([
    { method: "POST", path: "/api/v1/me/training-sessions/ses-1/complete", body: null },
  ]);
});
