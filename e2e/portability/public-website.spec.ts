import { expect, test, type Page } from "@playwright/test";

import { open, overflow } from "../production/harness";

/*
 * The public website (SF-43) in every engine, on the production build: the
 * compositions rest on CSS grid tracks, table layout, `text-wrap` and system
 * font metrics, which differ between Chromium, Firefox and WebKit. Each route
 * must keep its full-width body, its gutters and its footer after the content
 * without sideways scrolling, on the 1440 frame and on a phone; the pricing
 * state must survive the engine's own history handling.
 */

const ROUTES = [
  "/en",
  "/en/fighters",
  "/en/coaches",
  "/en/gyms",
  "/en/marketplace",
  "/en/pricing",
  "/en/pricing?role=fighter",
  "/en/pricing?role=gym",
  "/en/pricing?role=enterprise",
  "/en/pricing/compare",
  "/en/white-label",
  "/en/partners",
  "/en/partners/apply",
] as const;

const heading = (page: Page) => page.getByRole("heading", { level: 1 });

for (const [width, height, gutter] of [
  [1440, 900, 64],
  [390, 844, 16],
] as const) {
  test(`every route at ${width}: full width, on the gutter, no sideways scroll`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    for (const route of ROUTES) {
      await open(page, route, heading(page));
      expect(await overflow(page), route).toBeLessThanOrEqual(0);
      const body = await page.locator("[data-site-page]").boundingBox();
      const title = await heading(page).boundingBox();
      const footer = await page.locator("[data-site-footer]").boundingBox();
      if (!body || !title || !footer) throw new Error(`${route}: page not rendered`);
      expect(body.x).toBe(0);
      expect(Math.abs(body.y - 76)).toBeLessThanOrEqual(1);
      expect(Math.abs(body.width - width)).toBeLessThanOrEqual(1);
      expect(Math.abs(title.x - gutter), route).toBeLessThanOrEqual(1);
      expect(
        Math.abs(footer.y - Math.max(height - footer.height, body.y + body.height)),
      ).toBeLessThanOrEqual(1);
    }
  });
}

test("pricing tabs and billing keep their state through Back and Forward", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const current = (nav: string) =>
    page.getByRole("navigation", { name: nav }).locator("[aria-current=page]");
  await open(page, "/en/pricing", heading(page));
  await page
    .getByRole("navigation", { name: "Plans for" })
    .getByRole("link", { name: "Gym" })
    .click();
  await expect(page).toHaveURL(/role=gym$/);
  await page
    .getByRole("navigation", { name: "Billing" })
    .getByRole("link", { name: /Annual/ })
    .click();
  await expect(page).toHaveURL(/role=gym&billing=annual$/);
  await page.goBack();
  await expect(current("Billing")).toHaveText("Monthly");
  await expect(current("Plans for")).toHaveText("Gym");
  await page.goForward();
  await expect(current("Billing")).toHaveText(/Annual/);
});
