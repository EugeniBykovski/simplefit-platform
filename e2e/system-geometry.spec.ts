import { expect, test, type Locator, type Page } from "@playwright/test";

/*
 * SF-34 geometry of the canonical web layout and system states, from the
 * Claude Design 1440 × 900 artboards (LandHome/NotFoundWeb site header,
 * FighterWebNav sidebar, WebHome/LoadingWeb page header, LoadingWebLaunch,
 * NotFoundWeb). Values in CSS px, ±1 px.
 */
async function story(page: Page, id: string) {
  await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:Dark`);
  await page.locator("#storybook-root > *").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error("element is not visible");
  return rect;
}

const near = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 0);

test.describe("public site frame (SiteHeader, site Container)", () => {
  test("76 px header and 64 px gutters at 1440", async ({ page }) => {
    await story(page, "system-errors-not-found--count");
    const header = await box(page.locator("header").first());
    near(header.height, 77); // 76 px + the 1 px hairline below
    const brand = await box(page.getByRole("link", { name: /SimpleFit/ }).first());
    near(brand.x, 64);
    const cta = await box(page.getByRole("link", { name: "Get started" }));
    near(cta.x + cta.width, 1440 - 64);
    const heading = await box(page.getByRole("heading", { level: 1 }));
    near(heading.x, 64);
    await page.screenshot({ path: "test-results/er2-count.png" });
  });

  test("the site Container centres 1440 px beyond the designed frame", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await story(page, "system-errors-not-found--count");
    const brand = await box(page.getByRole("link", { name: /SimpleFit/ }).first());
    near(brand.x, (1600 - 1440) / 2 + 64);
  });
});

test.describe("ER2 · web 404", () => {
  test("600 px text column, 64 px gap and the 560 px ring", async ({ page }) => {
    await story(page, "system-errors-not-found--count");
    const heading = page.getByRole("heading", { level: 1 });
    expect(await heading.evaluate((el) => getComputedStyle(el).fontSize)).toBe("52px");
    const column = await box(heading.locator("xpath=../.."));
    near(column.width, 600);
    const ring = await box(page.locator("svg[viewBox='0 0 560 560']"));
    near(ring.width, 560);
    near(ring.height, 560);
    // Ring centred in the second column: 64 + 600 + 64 = 728 .. 1376.
    near(ring.x + ring.width / 2, (728 + 1376) / 2);
    const beat = await box(page.getByRole("button", { name: "Beat the count" }));
    near(beat.height, 54);
  });

  test.describe("phases", () => {
    for (const [id, name] of [
      ["system-errors-not-found--knockout", "Back to my corner"],
      ["system-errors-not-found--saved", "Search"],
    ] as const) {
      test(id, async ({ page }) => {
        await story(page, id);
        await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
        await page.screenshot({ path: `test-results/${id}.png` });
      });
    }
  });
});

test.describe("workspace shell (WorkspaceShell, PageHeader, PageBody) · LD4", () => {
  test("240 px sidebar, 76 px page header, 32 px gutters, 24 px body", async ({ page }) => {
    await story(page, "system-loading--application-skeleton-in-shell");
    const sidebar = await box(page.locator("aside"));
    near(sidebar.width, 240);
    near(sidebar.height, 900);
    const header = page.locator("[data-slot=page-header]");
    near((await box(header)).height, 77); // 76 px + hairline
    near((await box(header)).x, 240);
    const headerInner = await box(header.locator("> div"));
    const padding = await header
      .locator("> div")
      .evaluate((el) => [getComputedStyle(el).paddingLeft, getComputedStyle(el).paddingRight]);
    expect(padding).toEqual(["32px", "32px"]);
    near(headerInner.height, 76);
    const body = page.locator("[data-slot=page-body]");
    const bodyStyle = await body.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.paddingTop, style.paddingLeft, style.paddingRight];
    });
    expect(bodyStyle).toEqual(["24px", "32px", "32px"]);
    const item = await box(page.getByRole("link", { name: "Home" }));
    near(item.height, 38);
    const sidebarPadding = await page
      .locator("aside")
      .evaluate((el) => [getComputedStyle(el).paddingTop, getComputedStyle(el).paddingLeft]);
    expect(sidebarPadding).toEqual(["22px", "14px"]);
    await page.screenshot({ path: "test-results/ld4.png" });
  });
});

test.describe("LD3 · web launch", () => {
  test("brand block at 190 px, 440 px progress block at 600 px, tagline 30 px from the bottom", async ({
    page,
  }) => {
    await story(page, "system-loading--launch");
    const status = page.getByRole("status", { name: "Loading SimpleFit" });
    await expect(status).toBeVisible();
    const ring = await box(page.locator("svg[viewBox='0 0 100 100']"));
    near(ring.width, 220);
    near(ring.y, 190);
    near(ring.x + ring.width / 2, 720);
    const progress = await box(page.getByText("Taping hands…").locator(".."));
    near(progress.y, 600);
    near(progress.width, 440);
    near(progress.x, 500);
    const tagline = await box(page.getByText(/one account for fighters/i));
    near(900 - (tagline.y + tagline.height), 30);
    await page.screenshot({ path: "test-results/ld3.png" });
  });
});
