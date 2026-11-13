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
  // SF-118: SPX9 settings, the application page and SPE1's unsupported feature.
  ["sponsor-portal-overview--settings-organization", "Haymaker Drinks Sp. z o.o."],
  ["sponsor-portal-overview--settings-contact", "ada@haymaker.example"],
  [
    "sponsor-portal-overview--settings-contact-restricted",
    "Business contacts are visible to an owner or manager of this organization.",
  ],
  ["sponsor-portal-overview--settings-members", "Ola K."],
  ["sponsor-portal-overview--settings-account", "Your account"],
  ["sponsor-portal-overview--settings-suspended", "This organization is suspended."],
  ["sponsor-portal-overview--application-own", "Reviewed by SimpleFit"],
  ["sponsor-portal-overview--application-other", "Only the person who applied can see it"],
  ["sponsor-portal-overview--unsupported", "This isn’t part of SimpleFit yet"],
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

test("settings sections are links reached with Tab and opened with Enter; nothing is editable", async ({
  page,
}) => {
  await story(page, "sponsor-portal-overview--settings-organization");
  const sections = page.getByRole("navigation", { name: "Settings sections" });
  await expect(sections.getByRole("link", { name: "Organization" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await sections.getByRole("link", { name: "Organization" }).focus();
  await page.keyboard.press("Tab");
  await expect(sections.getByRole("link", { name: "Contact" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(sections.getByRole("link", { name: "Organization" })).toBeFocused();
  // Read-only: no input, no save, no member action anywhere on the page.
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /save|invite|transfer|remove/i })).toHaveCount(0);
});

test("the settings 1440 composition: the 240 px sidebar and one readable column", async ({
  page,
}) => {
  await story(page, "sponsor-portal-overview--settings-organization");
  const aside = await page.locator("[data-shell='web.sponsor'] aside").boundingBox();
  expect(aside?.width).toBe(240);
  const card = await page.getByRole("region", { name: "Company profile" }).boundingBox();
  expect(card && card.width <= 800).toBe(true);
  const nav = page.getByRole("navigation").first();
  // SF-118's five items and SF-131's Interests, Opportunities and Requests.
  await expect(nav.getByRole("link")).toHaveCount(8);
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
  // SF-118: Overview, Application, Organization, Members, Settings; SF-131:
  // Interests, Opportunities, Requests; no campaigns.
  const nav = page.getByRole("navigation").first();
  await expect(nav.getByRole("link")).toHaveCount(8);
  // FUTURE modules are listed, never linked or pressable.
  const future = page.locator("[data-sponsor-future]");
  await expect(future.getByRole("listitem")).toHaveCount(4);
  await expect(future.getByRole("link")).toHaveCount(0);
  await expect(future.getByRole("button")).toHaveCount(0);
  await expect(nav.getByText(/Campaigns|Invoices|Analytics/)).toHaveCount(0);
});
