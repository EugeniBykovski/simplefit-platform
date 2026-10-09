import { expect, test } from "@playwright/test";

import { onboardingApi } from "../production/onboarding-api";

/*
 * The Fighter web tour (SF-40, FRW2) in every engine, on the production
 * build: the coach mark is placed from the real Live Board item's box, so
 * each engine's layout must put the spotlight on the item and the card beside
 * it; the dialog keeps focus, Escape ends the tour, and the outcome is
 * recorded once. The day count uses the engine's local calendar, checked in
 * a far-east and a far-west time zone.
 */

test.use({ viewport: { width: 1440, height: 900 } });

for (const timezoneId of ["Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });

    test("the coach mark sits on the item; Escape ends the tour once", async ({ page }) => {
      const api = await onboardingApi(page, {
        completed: true,
        fields: { display_name: "Alex K." },
      });
      await page.goto("/en/app/home");
      await expect(page.locator("hgroup p").first()).toHaveText(/ · Day \d+$/);
      await page.getByRole("button", { name: "Take the tour", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Your Live Board lives here" });
      await expect(dialog.getByRole("button", { name: "End tour" })).toBeFocused();

      const item = await page.locator("aside [data-nav-item=board]").boundingBox();
      const spot = await page.locator("[data-tour-spotlight]").boundingBox();
      const card = await dialog.boundingBox();
      if (!item || !spot || !card) throw new Error("not rendered");
      expect(Math.abs(spot.x - (item.x - 4))).toBeLessThanOrEqual(1);
      expect(Math.abs(spot.y - (item.y - 4))).toBeLessThanOrEqual(1);
      expect(Math.abs(card.x - (spot.x + spot.width + 22))).toBeLessThanOrEqual(1);
      expect(Math.abs(card.y - (item.y + item.height / 2 - 37))).toBeLessThanOrEqual(1);

      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Good /);
      expect(api.tour()).toBe("dismissed");
      expect(api.requests.filter((request) => request.method === "PUT")).toHaveLength(1);
    });
  });
}
