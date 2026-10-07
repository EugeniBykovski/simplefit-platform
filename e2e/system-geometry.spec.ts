import { expect, test, type Locator, type Page } from "@playwright/test";

/*
 * SF-34 geometry of the canonical web layout and system states, from the
 * Claude Design 1440 × 900 artboards (LandHome/NotFoundWeb site header,
 * FighterWebNav sidebar, WebHome/LoadingWeb page header, LoadingWebLaunch,
 * NotFoundWeb). Values in CSS px, ±1 px.
 */
/**
 * Opens a story and waits for Storybook's own render signal: the preview
 * puts `sb-show-main` on <body> once the story has rendered and
 * `sb-show-errordisplay` when it failed (Storybook 10 preview runtime). A
 * failed story is reported with Storybook's error message instead of timing
 * out on an empty root.
 */
async function story(page: Page, id: string) {
  const response = await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:Dark`);
  expect(response?.ok(), `iframe for ${id}`).toBe(true);
  await page.waitForFunction(() =>
    ["sb-show-main", "sb-show-errordisplay"].some((name) => document.body.classList.contains(name)),
  );
  if (await page.evaluate(() => document.body.classList.contains("sb-show-errordisplay"))) {
    const message = await page.locator("#error-message").textContent();
    throw new Error(`Story ${id} failed to render: ${message ?? "unknown error"}`);
  }
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
    near(header.height, 76); // 76 px including the hairline (LandHome)
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

/** Computed style of the first element matching `locator`. */
async function style(locator: Locator, ...properties: string[]) {
  return locator.evaluate(
    (el, names) => names.map((name) => getComputedStyle(el).getPropertyValue(name)),
    properties,
  );
}

test.describe("SF-34 visual fixes", () => {
  test("sidebar wordmark is the 13 px brand role (FighterWebNav)", async ({ page }) => {
    await story(page, "system-loading--application-skeleton-in-shell");
    const wordmark = page.locator("aside").getByText("SimpleFit", { exact: true });
    const [size, weight, family] = await style(wordmark, "font-size", "font-weight", "font-family");
    expect([size, weight]).toEqual(["13px", "600"]);
    expect(family).toMatch(/Unbounded/i);
  });

  test("the site header keeps the designed distances next to the production controls", async ({
    page,
  }) => {
    await story(page, "system-errors-not-found--count");
    const brand = await box(page.getByRole("link", { name: /SimpleFit/ }).first());
    const firstLink = await box(page.getByRole("link", { name: "Fighters" }));
    near(firstLink.x - (brand.x + brand.width), 48);
    const signIn = await box(page.getByRole("link", { name: "Sign in" }));
    const cta = await box(page.getByRole("link", { name: "Get started" }));
    near(cta.x - (signIn.x + signIn.width), 36);
    near(cta.height, 40);
  });

  test("ER2 count, knockout and saved typography", async ({ page }) => {
    await story(page, "system-errors-not-found--count");
    expect(await style(page.locator(".type-numeral"), "font-size", "font-weight")).toEqual([
      "200px",
      "700",
    ]);
    expect(
      await style(
        page.locator(".type-count-word").filter({ visible: true }),
        "font-size",
        "letter-spacing",
      ),
    ).toEqual(["12px", "3.6px"]);
    await story(page, "system-errors-not-found--knockout");
    expect(await style(page.locator(".type-numeral-ko"), "font-size")).toEqual(["168px"]);
    expect(
      await style(
        page.getByText("KO · Page not found").filter({ visible: true }),
        "font-size",
        "font-weight",
        "font-family",
      ),
    ).toEqual(["11px", "600", expect.stringMatching(/JetBrains/i)]);
  });

  test("LD3 BOXING label is mono 600 with the wide tracking", async ({ page }) => {
    await story(page, "system-loading--launch");
    const [size, weight, spacing] = await style(
      page.getByText("Boxing", { exact: true }),
      "font-size",
      "font-weight",
      "letter-spacing",
    );
    expect([size, weight, spacing]).toEqual(["11px", "600", "6.82px"]);
  });

  test("failure-state action: 44 px, full card width, amber on Offline", async ({ page }) => {
    await story(page, "system-errors-error-state--offline");
    const card = await box(page.getByRole("alert"));
    near(card.width, 380);
    const action = page.getByRole("button", { name: "Try again" });
    const button = await box(action);
    near(button.height, 44);
    near(button.width, 380 - 2 * 20 - 2);
    const [background, warning] = await action.evaluate((el) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--warning)";
      document.body.append(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return [getComputedStyle(el).backgroundColor, resolved];
    });
    expect(background).toBe(warning);
  });
});
