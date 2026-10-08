import { createRequire } from "node:module";

import { expect, test, type Locator, type Page } from "@playwright/test";

/*
 * Public website shell conformance (SF-42). Expected boxes are the geometry
 * of the structured Claude Design artboards (version 1791448557-b0b9: L1
 * LandHome, L2 LandFighters, PR4 PricingEnterprise, SPX2 BecomeSponsor),
 * rendered from source with the real fonts and measured with
 * getBoundingClientRect. The header and footer are identical in every
 * public-website artboard except the current navigation item.
 *
 * The stories render the production SiteFrame around a body of the
 * artboard's content height, so the whole frame lines up with the artboard.
 * Tolerance is 2 px (text widths follow the glyph advances).
 */

const require = createRequire(import.meta.url);

async function story(page: Page, id: string) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:Dark`);
  expect(response?.ok(), `iframe for ${id}`).toBe(true);
  await page.locator("#storybook-root > *").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error("element is not visible");
  return rect;
}

type Box = [x: number, y: number, w: number, h: number];

async function expectBox(locator: Locator, expected: Partial<Record<0 | 1 | 2 | 3, number>> | Box) {
  const r = await box(locator);
  const actual = [r.x, r.y, r.width, r.height];
  const entries = Array.isArray(expected)
    ? expected.map((v, i) => [i, v] as const)
    : Object.entries(expected).map(([i, v]) => [Number(i), v] as const);
  for (const [index, value] of entries) {
    expect(
      Math.abs(actual[index]! - value!),
      `${["x", "y", "w", "h"][index]} ${actual.join(",")} vs ${value}`,
    ).toBeLessThanOrEqual(2);
  }
}

async function style(locator: Locator, ...properties: string[]) {
  return locator.evaluate(
    (el, names) => names.map((name) => getComputedStyle(el).getPropertyValue(name)),
    properties,
  );
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const header = (page: Page) => page.locator("header").first();
const siteNav = (page: Page) => header(page).getByRole("navigation", { name: "Site" });
const footer = (page: Page) => page.locator("[data-site-footer]");

const BONE = "rgb(237, 239, 231)";
const STONE_500 = "rgb(167, 173, 159)";
const STONE_550 = "rgb(132, 139, 128)";
const OLIVE_300 = "rgb(201, 209, 126)";
const OLIVE_400 = "rgb(174, 185, 90)";
const GRAPHITE_950 = "rgb(17, 19, 18)";
const GRAPHITE_975 = "rgb(13, 14, 13)";

/** Header items that do not depend on the current page (every public-website artboard). */
async function expectHeaderFrame(page: Page) {
  await expectBox(header(page), [0, 0, 1440, 76]);
  expect(await style(header(page), "border-bottom-width", "border-bottom-color")).toEqual([
    "1px",
    "rgb(31, 35, 32)",
  ]);
  const brand = header(page).getByRole("link", { name: /SimpleFit/ });
  await expectBox(brand.locator("> span").first(), [64, 21.5, 32, 32]);
  await expectBox(brand.getByText("SimpleFit", { exact: false }).last(), { 0: 106, 2: 154.2 });
  const signIn = header(page).getByRole("link", { name: "Sign in" });
  await expectBox(signIn, [1179.2, 28, 46, 19]);
  expect(await style(signIn, "font-size", "font-weight", "color")).toEqual(["14px", "700", BONE]);
  const cta = header(page).getByRole("link", { name: "Get started" });
  await expectBox(cta, [1261.2, 16.5, 114.8, 42]);
  expect(
    await style(cta, "font-size", "font-weight", "border-radius", "background-color", "color"),
  ).toEqual(["14px", "800", "14px", OLIVE_400, GRAPHITE_950]);
}

/** The seven site links: x, width and the 26 px rhythm, with or without a current item. */
async function expectSiteLinks(page: Page, current: string | undefined, xs: number[]) {
  const links = siteNav(page).getByRole("link");
  await expect(links).toHaveText([
    "Fighters",
    "Coaches",
    "Gyms",
    "Pricing",
    "Marketplace",
    "Partners",
    "Enterprise",
  ]);
  for (const [index, x] of xs.entries()) {
    const link = links.nth(index);
    const name = (await link.textContent()) ?? "";
    // With a current item every link stretches to its 25 px box (19 + 4 + 2); without, 19 px.
    await expectBox(link, current === undefined ? { 0: x, 1: 28, 3: 19 } : { 0: x, 1: 25, 3: 25 });
    if (name === current) {
      await expect(link).toHaveAttribute("aria-current", "page");
      expect(
        await style(
          link,
          "font-weight",
          "color",
          "border-bottom-width",
          "border-bottom-color",
          "padding-bottom",
        ),
      ).toEqual(["800", BONE, "2px", OLIVE_300, "4px"]);
    } else {
      await expect(link).not.toHaveAttribute("aria-current");
      expect(await style(link, "font-size", "font-weight", "color")).toEqual([
        "14px",
        "600",
        STONE_500,
      ]);
    }
  }
}

/** The footer of every public-website artboard, at `top` in the frame. */
async function expectFooter(page: Page, top: number) {
  await expectBox(footer(page), [0, top, 1440, 190]);
  expect(
    await style(footer(page), "background-color", "border-top-width", "border-top-color"),
  ).toEqual([GRAPHITE_975, "1px", "rgb(31, 35, 32)"]);
  await expectBox(footer(page).locator("div > span").first(), [64, top + 37, 30, 30]);
  const blurb = footer(page).getByText("The boxing operating system", { exact: false });
  await expectBox(blurb, { 0: 64, 1: top + 77, 3: 38.4 });
  expect(await style(blurb, "font-size", "color")).toEqual(["12px", STONE_550]);
  const columns: [name: string, x: number, rows: string[]][] = [
    ["Product", 404, ["Fighters", "Coaches", "Gyms", "Sign in"]],
    ["Business", 537.6, ["Pricing", "Marketplace", "Enterprise", "White label"]],
    ["Partners", 692.1, ["Become a sponsor", "Partnership overview", "Sponsor sign in"]],
    ["Company", 897.4, ["About", "Careers", "Privacy", "Terms"]],
  ];
  for (const [name, x, rows] of columns) {
    const column = footer(page).getByRole("navigation", { name });
    const label = column.getByText(name, { exact: true });
    await expectBox(label, { 0: x, 1: top + 37, 3: 13 });
    expect(await style(label, "font-size", "letter-spacing", "color")).toEqual([
      "10px",
      "1.4px",
      STONE_550,
    ]);
    for (const [index, row] of rows.entries()) {
      const item = column.getByText(row, { exact: true });
      await expectBox(item, { 0: x, 1: top + 58 + index * 26, 3: 18 });
      expect(await style(item, "font-size", "color")).toEqual(["13px", STONE_500]);
    }
  }
}

test.describe("public site shell at 1440 (the artboards)", () => {
  test("L1 home: header and footer, no current item", async ({ page }) => {
    expect(await story(page, "public-website-shell--home")).toEqual([]);
    await expectHeaderFrame(page);
    await expectSiteLinks(page, undefined, [308.2, 388.8, 473.9, 537.6, 610.1, 719.1, 802.4]);
    await expectFooter(page, 2180 - 190);
    await page.screenshot({ path: "test-results/site-l1-1440.png" });
  });

  test("L2 for fighters: Fighters is the current item", async ({ page }) => {
    await story(page, "public-website-shell--fighters");
    await expectHeaderFrame(page);
    await expectSiteLinks(page, "Fighters", [308.2, 390.8, 476, 539.7, 612.1, 721.2, 804.5]);
    await expectFooter(page, 1820 - 190);
    await page.screenshot({ path: "test-results/site-l2-1440.png", fullPage: true });
  });

  test("PR4 enterprise: the `?role=enterprise` state of /pricing marks Enterprise", async ({
    page,
  }) => {
    await story(page, "public-website-shell--enterprise");
    await expectHeaderFrame(page);
    const current = siteNav(page).locator("[aria-current=page]");
    await expect(current).toHaveText("Enterprise");
    await expectFooter(page, 1280 - 190);
  });

  test("SPX2 become a sponsor: Partners, and the whole 1440 × 900 frame", async ({ page }) => {
    await story(page, "public-website-shell--become-sponsor");
    await expectHeaderFrame(page);
    await expectSiteLinks(page, "Partners", [308.2, 388.8, 473.9, 537.6, 610.1, 719.1, 804.6]);
    await expectFooter(page, 710);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(900);
    await page.screenshot({ path: "test-results/site-spx2-1440.png" });
  });
});

test.describe("public site shell frame", () => {
  test("a taller window keeps the composition: nothing stretches, the footer band continues", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1080 });
    await story(page, "public-website-shell--become-sponsor");
    await expectBox(page.getByRole("main"), { 1: 76, 3: 900 - 76 - 190 });
    await expectFooter(page, 710);
    const frame = page.locator("[data-site-frame]");
    await expectBox(frame, { 1: 0, 3: 1080 });
    expect(await style(frame, "background-color")).toEqual([GRAPHITE_975]);
    expect(await style(page.getByRole("main"), "background-color")).toEqual([GRAPHITE_950]);
  });

  test("beyond 1440 the 1440 px frame stays centred on its 64 px gutters", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await story(page, "public-website-shell--fighters");
    const offset = (1920 - 1440) / 2;
    await expectBox(header(page), [0, 0, 1920, 76]);
    const brand = header(page).getByRole("link", { name: /SimpleFit/ });
    await expectBox(brand.locator("> span").first(), { 0: offset + 64 });
    await expectBox(header(page).getByRole("link", { name: "Get started" }), {
      0: offset + 1261.2,
    });
    await expectBox(footer(page).getByRole("navigation", { name: "Product" }), { 0: offset + 404 });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("public site shell, responsive", () => {
  test("tablet (768): the links move into the menu; Sign in and Get started stay", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await story(page, "public-website-shell--fighters");
    await expectBox(header(page), { 3: 76 });
    await expect(siteNav(page)).toBeHidden();
    await expect(header(page).getByRole("button", { name: "Open navigation" })).toBeVisible();
    await expect(header(page).getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(header(page).getByRole("link", { name: "Get started" })).toBeVisible();
    const cta = await box(header(page).getByRole("link", { name: "Get started" }));
    const menu = await box(header(page).getByRole("button", { name: "Open navigation" }));
    expect(menu.x + menu.width).toBeLessThanOrEqual(768 - 32 + 1);
    expect(menu.x).toBeGreaterThan(cta.x + cta.width);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: "test-results/site-768.png" });
  });

  for (const [width, height] of [
    [390, 844],
    [320, 640],
  ] as const) {
    test(`phone (${width}): brand, preferences and the menu; no horizontal scroll`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await story(page, "public-website-shell--fighters");
      await expectBox(header(page), { 3: 76 });
      await expect(header(page).getByRole("link", { name: "Sign in" })).toBeHidden();
      await expect(header(page).getByRole("link", { name: "Get started" })).toBeHidden();
      const menu = await box(header(page).getByRole("button", { name: "Open navigation" }));
      expect(menu.x + menu.width).toBeLessThanOrEqual(width - 16 + 1);
      const brand = await box(header(page).getByRole("link", { name: /SimpleFit/ }));
      expect(brand.x).toBeCloseTo(16, 0);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      // The footer columns pair up on two aligned columns within the gutters.
      const columns: Record<string, { x: number; width: number }> = {};
      for (const name of ["Product", "Business", "Partners", "Company"]) {
        columns[name] = await box(footer(page).getByRole("navigation", { name }));
        expect(columns[name].x + columns[name].width).toBeLessThanOrEqual(width - 16 + 1);
      }
      expect(columns.Product!.x).toBeCloseTo(16, 0);
      expect(columns.Partners!.x).toBeCloseTo(columns.Product!.x, 0);
      expect(columns.Company!.x).toBeCloseTo(columns.Business!.x, 0);
      await page.screenshot({ path: `test-results/site-${width}.png`, fullPage: true });
    });
  }

  test("the menu lists the site links (current marked), Sign in and Get started", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await story(page, "public-website-shell--fighters");
    await header(page).getByRole("button", { name: "Open navigation" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const menu = dialog.getByRole("navigation", { name: "Site" });
    await expect(menu.getByRole("link")).toHaveText([
      "Fighters",
      "Coaches",
      "Gyms",
      "Pricing",
      "Marketplace",
      "Partners",
      "Enterprise",
      "Sign in",
      "Get started",
    ]);
    await expect(menu.getByRole("link", { name: "Fighters" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(header(page).getByRole("button", { name: "Open navigation" })).toBeFocused();
  });
});

test.describe("public site shell, accessibility", () => {
  async function axe(page: Page) {
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    return page.evaluate(async () => {
      const { violations } = await (
        window as unknown as {
          axe: {
            run: (
              context: Document,
              options: object,
            ) => Promise<{ violations: { id: string; nodes: unknown[] }[] }>;
          };
        }
      ).axe.run(document, {
        // A shell story has no page content: the page's own <h1> is its screen's concern.
        rules: { "page-has-heading-one": { enabled: false } },
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
        },
      });
      return violations.map((violation) => `${violation.id} (${violation.nodes.length})`);
    });
  }

  for (const [label, width, height] of [
    ["desktop", 1440, 900],
    ["phone", 390, 844],
  ] as const) {
    test(`axe finds no violations (${label})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await story(page, "public-website-shell--fighters");
      expect(await axe(page)).toEqual([]);
    });
  }

  test("axe finds no violations with the menu open", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await story(page, "public-website-shell--fighters");
    await header(page).getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // Measure the settled sheet, not its opening transition.
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState === "finished"),
    );
    expect(await axe(page)).toEqual([]);
  });

  test("keyboard: every header control is reachable in order with a visible focus ring", async ({
    page,
  }) => {
    await story(page, "public-website-shell--fighters");
    const expected = [
      /SimpleFit/,
      /^Fighters$/,
      /^Coaches$/,
      /^Gyms$/,
      /^Pricing$/,
      /^Marketplace$/,
      /^Partners$/,
      /^Enterprise$/,
    ];
    for (const name of expected) {
      await page.keyboard.press("Tab");
      const focused = page.locator(":focus");
      await expect(focused).toHaveAccessibleName(name);
      const [shadow] = await style(focused, "box-shadow");
      expect(shadow, String(name)).not.toBe("none");
    }
  });
});
