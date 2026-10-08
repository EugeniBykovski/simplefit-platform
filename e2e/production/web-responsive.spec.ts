import { expect, test, type Locator, type Page } from "@playwright/test";

/*
 * Responsive composition on the actual production routes (SF-42; `next
 * start` on the production build). Canonical web compositions are
 * viewport-fluid but topology-invariant across desktop and laptop sizes
 * (docs/design-system.md, "Responsive composition"): every width below
 * renders the same composition as the 1440 artboards, with the same
 * anchoring; only the free space changes.
 *
 * The backend is mocked at the network edge: the session restore answers 401
 * (a signed-out visitor), and the Google and Apple scripts are replaced by
 * minimal stand-ins of the APIs the page calls (Google's button is drawn as
 * its documented large size: the requested width × 40 px), so the routes render
 * their signed-out composition, provider row included, without live services.
 */

/** `google.accounts.id` and `AppleID.auth`: only what the provider buttons call. */
const PROVIDER_STUBS = {
  google: `window.google = { accounts: { id: {
    initialize() {}, disableAutoSelect() {},
    renderButton(parent, options) {
      const button = document.createElement("div");
      button.dataset.gsiStub = "";
      button.style.cssText = "width:" + options.width + "px;height:40px;outline:1px dashed;border-radius:20px";
      parent.append(button);
    },
  } } };`,
  apple: `window.AppleID = { auth: { init() {}, signIn: () => new Promise(() => {}) } };`,
};

const VIEWPORTS = [
  [1280, 800],
  [1366, 768],
  [1440, 900],
  [1512, 982],
  [1728, 1117],
  [1920, 1080],
] as const;

async function open(page: Page, route: string, ready: Locator) {
  await page.route(
    (url) => url.pathname.startsWith("/api/") && url.port !== "3100",
    (call) =>
      call.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "unauthorized", message: "", details: {}, request_id: null },
        }),
      }),
  );
  await page.route(/accounts\.google\.com/, (call) =>
    call.fulfill({ contentType: "text/javascript", body: PROVIDER_STUBS.google }),
  );
  await page.route(/appleid\.cdn-apple\.com/, (call) =>
    call.fulfill({ contentType: "text/javascript", body: PROVIDER_STUBS.apple }),
  );
  await page.goto(route);
  await ready.waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error("element is not visible");
  return rect;
}

/** Within 1 px: browsers place fractional boxes on device pixels. */
async function expectBox(
  locator: Locator,
  expected: Partial<Record<"x" | "y" | "w" | "h", number>>,
) {
  const r = await box(locator);
  const actual = { x: r.x, y: r.y, w: r.width, h: r.height };
  for (const [key, value] of Object.entries(expected) as [keyof typeof actual, number][]) {
    expect(
      Math.abs(actual[key] - value),
      `${key} ${JSON.stringify(actual)} vs ${value}`,
    ).toBeLessThanOrEqual(1);
  }
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

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
  for (const [name, x] of [
    ["Product", 404],
    ["Business", 537.6],
    ["Partners", 692.1],
    ["Company", 897.4],
  ] as const) {
    await expectBox(footer.getByRole("navigation", { name }), { x });
  }
  await expectBox(page.locator("[data-site-frame]"), { x: 0, w: width });
}

for (const [width, height] of VIEWPORTS) {
  test.describe(`${width} × ${height}`, () => {
    test.use({ viewport: { width, height } });

    test("WA1 /login: a full-viewport 50 / 50 split with the artboard content in each half", async ({
      page,
    }) => {
      await open(page, "/en/login", page.getByRole("heading", { level: 1, name: "Sign in" }));
      await page.locator("[data-gsi-stub]").waitFor();
      const half = width / 2;
      await expectBox(page.locator("[data-auth-frame=split]"), { x: 0, y: 0, w: width });
      await expectBox(page.locator("[data-auth-panel]"), { x: 0, y: 0, w: half });
      await expectBox(page.locator("main"), { x: half, y: 0, w: half });
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await expectBox(page.locator("[data-auth-panel] a").first(), { x: 64, y: 56, h: 36 });
      await expectBox(page.locator("[data-auth-hero]"), { x: 64, y: 439 });
      await expectBox(page.locator("[data-auth-panel] [data-auth-info-list]"), {
        x: 64,
        y: 553,
        w: 498,
      });
      await expectBox(page.locator("[data-auth-column]"), {
        x: half + (half - 440) / 2,
        y: 230,
        w: 440,
      });
      await page.screenshot({ path: `test-results/production/login-${width}.png` });
    });

    test("O02w /signup: the site shell and the 1 : 1.25 sign-up grid", async ({ page }) => {
      await open(page, "/en/signup", page.getByRole("heading", { level: 1 }));
      await expectSiteShell(page, width);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      const frame = page.locator("[data-auth-frame=signup]");
      await expectBox(frame, { x: 0, y: 76, w: width });
      // Content between the 64 px gutters: the left track is (content − 72) / 2.25,
      // then the 64 px gap and the 8 px inset of the role section.
      const content = width - 128;
      const left = (content - 72) / 2.25;
      await expectBox(page.getByRole("heading", { level: 1 }), { x: 64 });
      const roles = page.getByRole("region", { name: "How will you use SimpleFit?" });
      const rolesBox = await box(roles);
      expect(Math.abs(rolesBox.x - (64 + left + 64))).toBeLessThanOrEqual(1);
      expect(Math.abs(rolesBox.x + rolesBox.width - (width - 64))).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: `test-results/production/signup-${width}.png`,
        fullPage: true,
      });
    });

    test("/ : the public site shell (the page body is the SF-43 placeholder)", async ({ page }) => {
      await open(page, "/en", page.locator("[data-site-frame]"));
      await expectSiteShell(page, width);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/production/home-${width}.png`, fullPage: true });
    });
  });
}
