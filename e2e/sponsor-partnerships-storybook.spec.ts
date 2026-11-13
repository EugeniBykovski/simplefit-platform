import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * SF-131: the partner portal's partnership pages (interests, opportunities,
 * requests, a new request, one request in each state) on the static Storybook
 * build, in the production route composition with a per-story API double
 * (mock-only; the real backend runs in e2e/real-api). Every state renders
 * with no request leaving the page, passes axe (WCAG 2.2 AA tags) and fits
 * from 375 to 1920 px without horizontal scrolling. 1440 px screenshots are
 * kept for the Design QA.
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

const S = "sponsor-portal-partnerships--";
const STATES: [string, string][] = [
  [`${S}interests`, "Support amateur boxing events and the clubs that run them."],
  [`${S}interests-member`, "Nothing saved yet."],
  [`${S}opportunities`, "No sponsorship opportunities"],
  [`${S}requests`, "Spring amateur events"],
  [`${S}requests-empty-member`, "No requests yet"],
  [`${S}new-request`, "Your request"],
  [`${S}new-request-member`, "You can’t start a request"],
  [`${S}draft`, "Only your organization can see this draft. Submit it when it’s ready."],
  [`${S}draft-incomplete`, "Before submitting, add: Summary"],
  [`${S}changes-requested`, "Could you say which clubs or event formats you have in mind?"],
  [`${S}under-review`, "SimpleFit is looking at your request. Nothing is agreed yet."],
  [`${S}accepted`, "Nothing is agreed, booked or paid."],
  [`${S}declined`, "SimpleFit isn’t taking this request further. Nothing was agreed."],
  [`${S}unknown-status`, "Unknown status"],
  [`${S}not-found`, "Request not found"],
  [`${S}suspended`, "This organization is suspended."],
  [`${S}failure`, "Try again"],
];

test.use({ viewport: { width: 1440, height: 900 } });

for (const [id, text] of STATES) {
  test(`${id}: renders, keeps every request local, passes axe and fits 375–1920`, async ({
    page,
  }) => {
    const outside = await story(page, id);
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 10_000 });
    expect(outside).toEqual([]);
    expect(await axe(page)).toEqual([]);
    await page.screenshot({
      path: `test-results/sponsor-partnerships/${id}-1440.png`,
      fullPage: true,
    });
    for (const width of [375, 390, 768, 1024, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const extra = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(extra, `${id} at ${width}`).toBeLessThanOrEqual(0);
    }
  });
}

test("the interests form is operable from the keyboard and passes axe while editing", async ({
  page,
}) => {
  await story(page, `${S}interests`);
  await page.getByRole("button", { name: "Edit" }).click({ timeout: 10_000 });
  const save = page.getByRole("button", { name: "Save interests" });
  await expect(save).toBeVisible({ timeout: 10_000 });
  const first = page.getByRole("checkbox").first();
  const before = await first.isChecked();
  await first.focus();
  await expect(first).toBeFocused();
  await page.keyboard.press("Space");
  await expect(first).toBeChecked({ checked: !before });
  expect(await axe(page)).toEqual([]);
});

test("status filters are links reached with Tab; the current one is marked", async ({ page }) => {
  await story(page, `${S}requests`);
  const filters = page.getByRole("navigation", { name: "Filter by status" });
  await expect(filters.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
  await filters.getByRole("link", { name: "All" }).focus();
  await page.keyboard.press("Tab");
  await expect(filters.getByRole("link", { name: "Draft" })).toBeFocused();
});

test("withdrawing asks first in a dialog that keeps focus and closes with Escape", async ({
  page,
}) => {
  await story(page, `${S}under-review`);
  const withdraw = page.getByRole("button", { name: "Withdraw" });
  await expect(withdraw).toBeVisible({ timeout: 10_000 });
  await withdraw.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Withdraw this request?" });
  await expect(dialog).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(withdraw).toBeFocused();
});

test("the 1440 composition: 240 px sidebar, eight portal links, readable column, no figures", async ({
  page,
}) => {
  await story(page, `${S}changes-requested`);
  await expect(page.getByText("Could you say which clubs").first()).toBeVisible({
    timeout: 10_000,
  });
  const aside = await page.locator("[data-shell='web.sponsor'] aside").boundingBox();
  expect(aside?.width).toBe(240);
  const nav = page.getByRole("navigation").first();
  await expect(nav.getByRole("link")).toHaveCount(8);
  const card = await page.getByRole("region", { name: "Your request" }).boundingBox();
  expect(card && card.width <= 800).toBe(true);
  // Nonbinding: no amount, reach or percentage anywhere.
  await expect(page.getByText(/€|\$|\d+(\.\d+)?%|reach|ROI/)).toHaveCount(0);
});
