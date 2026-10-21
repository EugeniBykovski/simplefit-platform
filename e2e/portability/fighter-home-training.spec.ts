import { expect, test } from "@playwright/test";

import { onboardingApi } from "../production/onboarding-api";
import { FIGHTER_DONE, trainingApi } from "../production/training-api";

/*
 * The Fighter Home's Training card (SF-68) in every engine, on the
 * production build: the next session's day and time come from each
 * engine's Intl zone data, the card links to WFT2 and back, a failed read
 * retries in place, and the first run is never reopened.
 */

test.use({ viewport: { width: 1440, height: 900 }, timezoneId: "Pacific/Kiritimati" });

test("the next session, its link and Back; a failure retries; the tour stays closed", async ({
  page,
}) => {
  const api = await onboardingApi(page, FIGHTER_DONE);
  await trainingApi(page);
  let failing = true;
  await page.route(
    (url) =>
      url.port !== "3100" &&
      url.pathname === "/api/v1/me/training-sessions" &&
      url.searchParams.get("view") === "upcoming",
    (route) => (failing ? route.abort("internetdisconnected") : route.fallback()),
  );
  await page.goto("/en/app/home");
  const card = page.getByRole("region", { name: "Training" });
  await expect(card.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  await expect(card.locator("[data-home-recent=ses-3]")).toBeVisible();
  failing = false;
  await card.getByRole("button", { name: "Try again" }).click();

  const next = card.locator("[data-home-next]");
  // The session's own zone, whatever the browser's: Fri, Oct 23 in Warsaw.
  await expect(next).toContainText("05:30 PM");
  await expect(next).toContainText("Fri, Oct 23 · Europe/Warsaw");
  await next.click();
  await page.waitForURL("**/en/app/training/ses-2");
  await page.goBack();
  await page.waitForURL("**/en/app/home");
  await expect(card.locator("[data-home-next]")).toBeVisible();
  await page.reload();
  await expect(card.locator("[data-home-next]")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    api.requests.filter(
      (request) => request.path.startsWith("/api/v1/") && request.method !== "GET",
    ),
  ).toEqual([]);
});
