import { expect, test, type Page } from "@playwright/test";

import {
  axeViolations,
  box,
  expectBox,
  open,
  overflow,
  verticalOverflow,
  VIEWPORTS,
} from "./harness";

/*
 * The public website (SF-43) on the actual production routes (`next start`):
 * every approved Public Website artboard as its route renders it, measured
 * against Claude Design at the 1440 frame, then at every supported width.
 *
 * Geometry: an artboard is header 76 + body + footer 190, and its body is the
 * 56 / 64 px padding around one content column. The artboards draw fixed frame
 * heights (LandHome is 2180) with the footer pinned to the bottom, which leaves
 * empty space under short content; a page does not reproduce that space, so
 * the measured value is the content column itself (`[data-site-page]` minus
 * its 2 × 56 px padding), compared with the artboard's content column.
 */

type PublicRoute = {
  path: string;
  /** The artboard (Claude Design) and its content column height at 1440. */
  artboard: string;
  designHeight: number;
  /** The approved SF-43 deviations from that height, with the reason. */
  deviation?: { px: number; why: string };
  h1: string;
  /** The site navigation item marked current, if any. */
  nav?: string;
};

const ROUTES: readonly PublicRoute[] = [
  {
    path: "/en",
    artboard: "LandHome",
    designHeight: 1290,
    // The 48K / 312 / 5 stat row is not shown (no live figures): the hero is the
    // board's height (430) instead of the copy column's (457).
    deviation: { px: -20, why: "stat row omitted" },
    h1: "Train, coach and run your gym — in one place.",
  },
  {
    path: "/en/fighters",
    artboard: "LandFighters",
    designHeight: 1010.2,
    h1: "Your boxing, tracked. Free forever.",
    nav: "Fighters",
  },
  {
    path: "/en/coaches",
    artboard: "LandCoaches",
    designHeight: 1091.7,
    h1: "Run your coaching business from one place.",
    nav: "Coaches",
  },
  {
    path: "/en/gyms",
    artboard: "LandGyms",
    designHeight: 1091.7,
    h1: "Members, timetable and money — one console.",
    nav: "Gyms",
  },
  {
    path: "/en/marketplace",
    artboard: "LandMarket",
    designHeight: 729,
    // The listings are tagged as examples (their own label row) and say that
    // search is not open yet; the system badge and button sizes add 4 px a row.
    deviation: { px: 39, why: "example listings label and note" },
    h1: "Find a coach, gym or program in your city",
    nav: "Marketplace",
  },
  {
    path: "/en/pricing",
    artboard: "PricingPublic",
    designHeight: 1067.5,
    h1: "Pricing",
    nav: "Pricing",
  },
  {
    path: "/en/pricing?role=fighter",
    artboard: "PricingFighter",
    designHeight: 936.1,
    h1: "Pricing",
    nav: "Pricing",
  },
  {
    path: "/en/pricing?role=gym",
    artboard: "PricingGym",
    designHeight: 997.4,
    h1: "Pricing",
    nav: "Pricing",
  },
  {
    path: "/en/pricing?role=enterprise",
    artboard: "PricingEnterprise",
    designHeight: 861.5,
    // The 54 px xl action (the artboard's 50) and the system input rows.
    deviation: { px: 10, why: "system form controls" },
    h1: "Pricing",
    nav: "Enterprise",
  },
  {
    path: "/en/pricing/compare",
    artboard: "PlanCompare",
    designHeight: 910.5,
    deviation: { px: 10, why: "table header and title line heights" },
    h1: "Compare gym plans",
    nav: "Pricing",
  },
  {
    path: "/en/white-label",
    artboard: "WhiteLabel",
    designHeight: 597.5,
    deviation: { px: 7.5, why: "list rows at 8 px (artboard 7)" },
    h1: "Your brand. Our boxing infrastructure.",
    // White label belongs to the Enterprise item (SF-42 navigation model).
    nav: "Enterprise",
  },
  {
    path: "/en/partners",
    artboard: "PartnersLanding",
    designHeight: 727,
    // No reach figures (one-column hero), the download says it is not
    // published yet, and the campaigns are tagged as examples.
    deviation: { px: 40, why: "one-column hero, download note, example tag" },
    h1: "Partner with the global boxing community.",
    nav: "Partners",
  },
  {
    path: "/en/partners/apply",
    artboard: "BecomeSponsor",
    designHeight: 420,
    // The application cannot start yet, and the page says so under the action.
    deviation: { px: 28, why: "application unavailable note" },
    h1: "Apply in 5 minutes. No account needed to start.",
    nav: "Partners",
  },
];

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const sitePage = (page: Page) => page.locator("[data-site-page]");
const footer = (page: Page) => page.locator("[data-site-footer]");

/**
 * The footer closes the page: right after the content, or at the window's
 * bottom. It is 190 px from the desktop composition up; narrower, its columns
 * stack (SF-42), so its own height is used. The document ends with it
 * (`scrollHeight` is whole pixels: the content bottom is rounded up).
 */
async function expectFooterAfterContent(page: Page, width: number, height: number) {
  const body = await box(sitePage(page));
  const foot = await box(footer(page));
  const footerY = Math.max(height - foot.height, body.y + body.height);
  if (width >= 1180) expect(foot.height).toBeCloseTo(190, 0);
  await expectBox(footer(page), { y: footerY });
  expect(await verticalOverflow(page)).toBeLessThanOrEqual(
    Math.max(0, Math.ceil(footerY + foot.height) - height),
  );
}

test.describe("public website routes at 1440 × 900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const route of ROUTES) {
    test(`${route.artboard} ${route.path}: the page, its geometry and accessibility`, async ({
      page,
    }) => {
      await open(page, route.path, heading(page));
      await expect(heading(page)).toHaveText(route.h1);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      // A real page: never the SF-32 placeholder.
      await expect(page.locator("[data-feature-placeholder]")).toHaveCount(0);
      await expect(page.getByRole("main")).toHaveCount(1);
      const nav = page.getByRole("navigation", { name: "Site" });
      if (route.nav) {
        await expect(nav.getByRole("link", { name: route.nav })).toHaveAttribute(
          "aria-current",
          "page",
        );
      } else {
        await expect(nav.locator("[aria-current=page]")).toHaveCount(0);
      }

      // Full width, top-aligned under the header, on the artboard's 56 / 64 padding.
      await expectBox(sitePage(page), { x: 0, y: 76, w: 1440 });
      await expectBox(heading(page), { x: 64 });
      const body = await box(sitePage(page));
      const content = body.height - 2 * 56;
      const expected = route.designHeight + (route.deviation?.px ?? 0);
      expect(
        Math.abs(content - expected),
        `${route.artboard}: content ${content} vs ${route.designHeight}` +
          (route.deviation ? ` + ${route.deviation.px} (${route.deviation.why})` : ""),
      ).toBeLessThanOrEqual(4);
      await expectFooterAfterContent(page, 1440, 900);
      expect(await overflow(page)).toBeLessThanOrEqual(0);

      expect(await axeViolations(page)).toEqual([]);
      await page.screenshot({
        path: `test-results/production/site-${route.artboard}-1440.png`,
        fullPage: true,
      });
    });
  }

  test("titles and descriptions are the page's own, in the visitor's language", async ({
    page,
  }) => {
    await open(page, "/pl/pricing?role=gym", heading(page));
    await expect(page).toHaveTitle(/^Cennik/);
    await expect(heading(page)).toHaveText("Cennik");
    await expect(page.locator("html")).toHaveAttribute("lang", "pl");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "Za darmo dla zawodników. Uczciwie dla trenerów. Stworzone, by klub rósł.",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/pl\/pricing$/);
    await expect(page.locator('link[rel="alternate"][hreflang="de"]')).toHaveAttribute(
      "href",
      /\/de\/pricing$/,
    );
  });
});

test.describe("pricing state lives in the URL", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const current = (page: Page, nav: string) =>
    page.getByRole("navigation", { name: nav }).locator("[aria-current=page]");

  test("tabs and billing navigate; Back, Forward and reload restore the state", async ({
    page,
  }) => {
    await open(page, "/en/pricing", heading(page));
    await expect(current(page, "Plans for")).toHaveText("Coach");
    await expect(current(page, "Billing")).toHaveText("Monthly");

    await page
      .getByRole("navigation", { name: "Plans for" })
      .getByRole("link", { name: "Fighter" })
      .click();
    await expect(page).toHaveURL(/\/en\/pricing\?role=fighter$/);
    await expect(current(page, "Plans for")).toHaveText("Fighter");
    await expect(page.getByText("€7.99")).toBeVisible();

    await page
      .getByRole("navigation", { name: "Billing" })
      .getByRole("link", { name: /Annual/ })
      .click();
    await expect(page).toHaveURL(/role=fighter&billing=annual$/);
    await expect(current(page, "Billing")).toHaveText(/Annual/);
    await expect(page.getByText("€6.39", { exact: true })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/en\/pricing\?role=fighter$/);
    await expect(current(page, "Billing")).toHaveText("Monthly");
    await page.goBack();
    await expect(page).toHaveURL(/\/en\/pricing$/);
    await expect(current(page, "Plans for")).toHaveText("Coach");
    await page.goForward();
    await page.goForward();
    await expect(page).toHaveURL(/billing=annual$/);
    await page.reload();
    await expect(current(page, "Plans for")).toHaveText("Fighter");
    await expect(current(page, "Billing")).toHaveText(/Annual/);
  });

  test("an unknown role or billing value shows the default state", async ({ page }) => {
    await open(page, "/en/pricing?role=admin&billing=weekly", heading(page));
    await expect(current(page, "Plans for")).toHaveText("Coach");
    await expect(current(page, "Billing")).toHaveText("Monthly");
  });

  test("plan actions start sign-up with the role's journey, never a checkout", async ({ page }) => {
    await open(page, "/en/pricing?role=gym", heading(page));
    await page.getByRole("link", { name: "Start trial" }).click();
    await expect(page).toHaveURL(/\/en\/signup\?intent=gym$/);
  });

  test("the enterprise and white label forms cannot send anything", async ({ page }) => {
    for (const [path, name] of [
      ["/en/pricing?role=enterprise", "Talk to Sales"],
      ["/en/white-label", "Request White Label"],
    ] as const) {
      await open(page, path, heading(page));
      const form = page.getByRole("form", { name });
      await expect(form.getByRole("button", { name })).toBeDisabled();
      for (const field of await form.getByRole("textbox").all()) await expect(field).toBeDisabled();
    }
  });
});

/** Desktop and laptop windows (harness) and the tablet and phone widths. */
const WIDTHS = [
  ...VIEWPORTS,
  [1024, 768],
  [768, 1024],
  [430, 932],
  [390, 844],
  [375, 667],
  [320, 640],
] as const;

for (const [width, height] of WIDTHS) {
  test.describe(`public website at ${width} × ${height}`, () => {
    test.use({ viewport: { width, height } });

    test("every route: full width, no sideways scroll, the footer after the content", async ({
      page,
    }) => {
      const gutter = width >= 1180 ? 64 : width >= 768 ? 32 : width >= 640 ? 24 : 16;
      for (const route of ROUTES) {
        await open(page, route.path, heading(page));
        expect(await overflow(page), route.path).toBeLessThanOrEqual(0);
        await expectBox(sitePage(page), { x: 0, y: 76, w: width });
        await expectBox(heading(page), { x: gutter });
        await expectFooterAfterContent(page, width, height);
      }
      if (width >= 1180) {
        // Desktop and laptop: the 1440 composition, fluid. The hero keeps the
        // board to the right of the copy at every width.
        await open(page, "/en", heading(page));
        const board = await box(page.getByRole("figure", { name: /An example Live Board/ }));
        expect(board.width).toBeCloseTo(560, 0);
        expect(board.x + board.width).toBeCloseTo(width - 64, 0);
        const title = await box(heading(page));
        expect(title.x + title.width).toBeLessThanOrEqual(board.x - 64 + 1);
      }
      await page.screenshot({
        path: `test-results/production/site-home-${width}.png`,
        fullPage: true,
      });
    });
  });
}

test.describe("public website accessibility on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const route of ROUTES) {
    test(`${route.artboard} at 390: no axe violations`, async ({ page }) => {
      await open(page, route.path, heading(page));
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});
