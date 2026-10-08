import { expect, test, type Page } from "@playwright/test";

import {
  box,
  expectAbove,
  expectBox,
  expectInView,
  expectProviderControls,
  open,
  overflow,
  verticalOverflow,
  VIEWPORTS,
} from "./harness";

/*
 * Responsive composition on the actual production routes (SF-42; `next
 * start` on the production build). Canonical web compositions are
 * viewport-fluid but topology-invariant across desktop and laptop sizes
 * (docs/design-system.md, "Responsive composition"): every width below
 * renders the same composition as the 1440 artboards, with the same
 * anchoring; only the free space changes. The network is mocked at the edge
 * (./harness).
 */

/** The public site header and footer: identical composition and anchoring at every width. */
async function expectSiteShell(page: Page, width: number) {
  const header = page.locator("header").first();
  await expectBox(header, { x: 0, y: 0, w: width, h: 76 });
  await expectBox(header.getByRole("link", { name: /SimpleFit/ }), { x: 64 });
  // The navigation is the desktop navigation at every desktop and laptop width.
  const nav = header.getByRole("navigation", { name: "Site" });
  await expect(nav).toBeVisible();
  await expect(header.getByRole("button", { name: "Open navigation" })).toBeHidden();
  await expectBox(nav.getByRole("link", { name: "Fighters" }), { x: 308.2 });
  await expectBox(nav.getByRole("link", { name: "Enterprise" }), { x: 802.4 });
  const cta = header.getByRole("link", { name: "Get started" });
  await expectBox(cta, { x: width - 64 - 114.8, y: 16.5, w: 114.8, h: 42 });
  await expectBox(header.getByRole("link", { name: "Sign in" }), {
    x: width - 64 - 114.8 - 36 - 46,
  });

  const footer = page.locator("[data-site-footer]");
  await expectBox(footer, { x: 0, w: width, h: 190 });
  // One left edge: the header brand, the page body and the footer brand sit on
  // the artboards' 64 px gutter (header `0 64px`, body `56px 64px`, footer `36px 64px`).
  await expectBox(footer.locator("svg").first().locator(".."), { x: 64 });
  for (const [name, x] of [
    ["Product", 404],
    ["Business", 537.6],
    ["Partners", 692.1],
    ["Company", 897.4],
  ] as const) {
    await expectBox(footer.getByRole("navigation", { name }), { x });
  }
  await expectBox(page.locator("[data-site-frame]"), { x: 0, y: 0, w: width });
  await expectBox(page.locator("main"), { x: 0, y: 76, w: width });
}

/**
 * The footer closes the page: at the window's bottom when the page is shorter
 * than the window, right after the content when it is longer (`contentBottom`:
 * where the page's own composition ends). `main` fills exactly the space between.
 */
async function expectFooterPlacement(page: Page, height: number, contentBottom: number) {
  const footerY = Math.max(height, contentBottom + 190) - 190;
  await expectBox(page.locator("[data-site-footer]"), { y: footerY });
  await expectBox(page.locator("main"), { h: footerY - 76 });
  expect(await verticalOverflow(page)).toBeLessThanOrEqual(
    Math.max(0, contentBottom + 190 - height),
  );
}

for (const [width, height] of VIEWPORTS) {
  test.describe(`${width} × ${height}`, () => {
    test.use({ viewport: { width, height } });

    test("WA1 /login: a full-viewport 50 / 50 split, the whole composition in the window", async ({
      page,
    }) => {
      await open(page, "/en/login", page.getByRole("heading", { level: 1, name: "Sign in" }));
      await expectProviderControls(page);
      const half = width / 2;
      await expectBox(page.locator("[data-auth-frame=split]"), { x: 0, y: 0, w: width, h: height });
      await expectBox(page.locator("[data-auth-panel]"), { x: 0, y: 0, w: half, h: height });
      await expectBox(page.locator("main"), { x: half, y: 0, w: half, h: height });
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(await verticalOverflow(page)).toBeLessThanOrEqual(0);

      // Left: the brand on the top padding; the headline, the reserved line and the
      // card bottom-anchored on the bottom padding (exactly the artboard at 900).
      const panel = page.locator("[data-auth-panel]");
      const brand = panel.getByRole("link", { name: /SimpleFit/ });
      const hero = page.locator("[data-auth-hero]");
      const card = panel.locator("[data-auth-info-list]");
      await expectBox(brand, { x: 64, y: 56, h: 36 });
      await expectBox(card, { x: 64, y: height - 56 - 292, w: 498, h: 292 });
      await expectBox(hero, { x: 64, y: height - 56 - 292 - 20 - 24 - 20 - 50, h: 50 });
      await expectAbove(brand, hero);
      await expectAbove(hero, card);
      for (const item of [brand, hero, card, ...(await card.getByRole("listitem").all())]) {
        await expectInView(item, half, height);
      }
      await expect(card.getByRole("listitem")).toHaveCount(4);

      // Right: the 440 px column centred in its half, both ways (y 229.5 at 900).
      const column = page.locator("[data-auth-column]");
      await expectBox(column, {
        x: half + (half - 440) / 2,
        y: (height - 441) / 2,
        w: 440,
        h: 441,
      });
      const order = [
        column.getByRole("heading", { level: 1, name: "Sign in" }),
        page.locator("[data-gsi-stub]"),
        column.getByRole("button", { name: "Continue with Apple" }),
        column.getByText("or with email"),
        column.getByRole("textbox", { name: "Email" }),
        column.getByRole("button", { name: "Email me a sign-in code" }),
        column.getByRole("link", { name: "Sponsor sign in" }),
      ];
      for (const item of order) await expectInView(item, width, height);
      for (const [upper, lower] of order.slice(1).map((item, index) => [order[index], item])) {
        if (upper && lower) await expectAbove(upper, lower);
      }
      await page.screenshot({ path: `test-results/production/login-${width}x${height}.png` });
    });

    test("O02w /signup: the site shell, the 1 : 1.25 grid and the footer placement", async ({
      page,
    }) => {
      await open(page, "/en/signup", page.getByRole("heading", { level: 1 }));
      await expectProviderControls(page);
      await expectSiteShell(page, width);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      const frame = page.locator("[data-auth-frame=signup]");
      // The artboard's 674 px body (940 − 76 − 190): the footer at 750 or the window's bottom.
      await expectBox(frame, { x: 0, y: 76, w: width, h: 674 });
      await expectFooterPlacement(page, height, 750);

      // Content between the 64 px gutters: the left track is (content − 72) / 2.25,
      // then the 64 px gap and the 8 px inset of the role section.
      const content = width - 128;
      const left = (content - 72) / 2.25;
      await expectBox(page.getByRole("heading", { level: 1 }), { x: 64, y: 226 });
      const roles = page.getByRole("region", { name: "How will you use SimpleFit?" });
      const rolesBox = await box(roles);
      expect(Math.abs(rolesBox.x - (64 + left + 64))).toBeLessThanOrEqual(1);
      expect(Math.abs(rolesBox.x + rolesBox.width - (width - 64))).toBeLessThanOrEqual(1);
      // The 2 × 2 cards share the track (16 px gap), on one top edge and one height
      // per row, each heading on the same line: a narrower track only wraps text.
      const cards = await roles.getByRole("listitem").all();
      expect(cards).toHaveLength(4);
      const cardWidth = (rolesBox.width - 8 - 16) / 2;
      const boxes = await Promise.all(cards.map((card) => box(card)));
      for (const [index, card] of boxes.entries()) {
        expect(Math.abs(card.width - cardWidth)).toBeLessThanOrEqual(1);
        expect(
          Math.abs(card.x - (rolesBox.x + 8 + (index % 2) * (cardWidth + 16))),
        ).toBeLessThanOrEqual(1);
      }
      const titles = await Promise.all(cards.map((card) => box(card.locator("a > span").nth(1))));
      for (const row of [0, 2]) {
        const [a, b] = [boxes[row], boxes[row + 1]];
        const [ta, tb] = [titles[row], titles[row + 1]];
        if (!a || !b || !ta || !tb) throw new Error("missing role card");
        expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(ta.y - tb.y)).toBeLessThanOrEqual(0.5);
      }
      // The methods keep their 420 px column and 54 px rows.
      for (const method of [
        page.locator("[data-gsi-stub]").locator(".."),
        page.getByRole("button", { name: "Continue with Apple" }),
        page.getByRole("link", { name: "Continue with Email" }),
      ]) {
        await expectBox(method, { x: 64, w: 420, h: 54 });
      }
      await page.screenshot({
        path: `test-results/production/signup-${width}x${height}.png`,
        fullPage: true,
      });
    });

    test("/ : the site shell, one left edge, the short page centred in main", async ({ page }) => {
      await open(page, "/en", page.locator("[data-site-frame]"));
      await expectSiteShell(page, width);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await expect(page.locator("main")).toHaveCount(1);
      await expectBox(page.getByRole("heading", { level: 1 }), { x: 64 });
      // The SF-32 placeholder (SF-43 replaces it) is a short single-screen page
      // (PageContent `center`): the footer closes the window and the composition
      // is centred in main, between header and footer, not in the window.
      const content = page.locator("[data-slot=page-content]");
      await expect(content).toHaveAttribute("data-align", "center");
      const body = await box(content);
      const footerY = height - 190;
      expect(body.height).toBeLessThan(footerY - 76);
      await expectFooterPlacement(page, height, body.y + body.height);
      const above = body.y - 76;
      const below = footerY - (body.y + body.height);
      expect(Math.abs(above - below), `${above} above, ${below} below`).toBeLessThanOrEqual(1);
      await expectBox(content, { x: 0, w: width });
      await page.screenshot({
        path: `test-results/production/home-${width}x${height}.png`,
        fullPage: true,
      });
    });
  });
}
