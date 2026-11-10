import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * The partner portal and the sponsor rows of WCX1 (SF-117) on the static
 * Storybook build: each story renders the production route composition
 * (session gate, SPONSOR_WORKSPACE gate, the portal of the organization in
 * the path) with no request leaving the page (the API is a per-story double;
 * mock-only, not backend E2E). Every state passes axe (WCAG 2.2 AA tags),
 * fits from 375 to 1920 px without horizontal scrolling, and the
 * organization switcher works from the keyboard. 1440 px screenshots are kept
 * for the Design QA.
 */

const STORYBOOK = "http://127.0.0.1:6007";

async function story(page: Page, id: string) {
  const outside: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      if (!url.hostname.endsWith("fonts.gstatic.com")) outside.push(request.url());
    }
  });
  await page.goto(`${STORYBOOK}/iframe.html?id=${id}&viewMode=story&globals=theme:Dark`);
  await page.waitForFunction(() =>
    ["sb-show-main", "sb-show-errordisplay"].some((name) => document.body.classList.contains(name)),
  );
  expect(await page.evaluate(() => document.body.classList.contains("sb-show-errordisplay"))).toBe(
    false,
  );
  return outside;
}

async function axe(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await page.evaluate(async () => {
        const { violations } = await (
          window as unknown as {
            axe: {
              run: (
                context: Element,
                options: object,
              ) => Promise<{ violations: { id: string; nodes: unknown[] }[] }>;
            };
          }
        ).axe.run(document.querySelector("#storybook-root") ?? document.body, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
          },
        });
        return violations.map((violation) => `${violation.id} (${violation.nodes.length})`);
      });
    } catch (error) {
      if (attempt >= 20 || !String(error).includes("Axe is already running")) throw error;
      await page.waitForTimeout(250);
    }
  }
}

const STATES: [string, string][] = [
  ["sponsor-portal-overview--owner", "Reviewed by SimpleFit"],
  ["sponsor-portal-overview--member", "Your role: Member"],
  ["sponsor-portal-overview--suspended", "This organization is suspended."],
  ["sponsor-portal-overview--not-available", "We can’t find that page"],
  ["sponsor-portal-overview--failure", "Try again"],
  ["context-selection-choose-where-to-continue--sponsors", "Northside Agency"],
];

test.use({ viewport: { width: 1440, height: 900 } });

for (const [id, text] of STATES) {
  test(`${id}: renders, keeps every request local, passes axe and fits 375–1920`, async ({
    page,
  }) => {
    const outside = await story(page, id);
    await expect(page.getByText(text).first()).toBeVisible();
    expect(outside).toEqual([]);
    expect(await axe(page)).toEqual([]);
    await page.screenshot({ path: `test-results/sponsor-portal/${id}-1440.png`, fullPage: true });
    for (const width of [375, 390, 768, 1024, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const extra = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(extra, `${id} at ${width}`).toBeLessThanOrEqual(0);
    }
  });
}

test("the organization switcher opens, moves and closes from the keyboard", async ({ page }) => {
  await story(page, "sponsor-portal-overview--owner");
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  const trigger = page
    .getByRole("button", { name: "Haymaker Drinks, Owner. Switch organization or profile" })
    .first();
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemradio", { name: /Haymaker Drinks/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(menu.getByRole("menuitemradio", { name: /Northside Agency/ })).toBeVisible();
  await expect(menu.getByRole("menuitemradio", { name: /Fighter/ })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(menu.locator('[role="menuitemradio"]:focus')).toHaveCount(1);
  expect(await axe(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("the overview's 1440 composition: a 240 px sidebar, two columns, no figures", async ({
  page,
}) => {
  await story(page, "sponsor-portal-overview--owner");
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  const aside = await page.locator("[data-shell='web.sponsor'] aside").boundingBox();
  expect(aside?.width).toBe(240);
  const organization = await page.getByRole("region", { name: "Organization" }).boundingBox();
  const notYet = await page.getByRole("region", { name: "Not available yet" }).boundingBox();
  expect(organization && notYet && notYet.x > organization.x + organization.width).toBe(true);
  await expect(page.getByText(/\d+(\.\d+)?%|€|reach/i)).toHaveCount(0);
  // Only real nav: the overview; application and settings marked Soon; no campaigns.
  const nav = page.getByRole("navigation").first();
  await expect(nav.getByRole("link")).toHaveCount(1);
  await expect(nav.getByText(/Campaigns|Invoices|Analytics/)).toHaveCount(0);
});
