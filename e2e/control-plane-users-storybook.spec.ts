import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * AD7, AD8 and AD9 (SF-122) on the static Storybook build, on a per-story API double
 * (mock-only, not backend E2E): axe (WCAG 2.2 AA tags), 375–1920 fit, the 1440 detail
 * layout, high-risk actions hidden below 640 px, and keyboard search.
 */

const STORYBOOK = "http://127.0.0.1:6007";
const PREFIX = "control-plane-users--";

async function story(page: Page, id: string) {
  const outside: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      if (!url.hostname.endsWith("fonts.gstatic.com")) outside.push(request.url());
    }
  });
  await page.goto(`${STORYBOOK}/iframe.html?id=${PREFIX}${id}&viewMode=story&globals=theme:Dark`);
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
        ).axe.run(document.body, {
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

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.use({ viewport: { width: 1440, height: 900 } });

for (const [id, text] of [
  ["search-idle", "Enter an exact email or user ID, and a reason."],
  ["search-result", "Natalia W."],
  ["search-no-match", "No account matches"],
  ["search-restricted", "You don’t have access to this section"],
  ["search-error", "We couldn’t load this"],
  ["account-active", "Account and security"],
  ["account-suspended", "Suspended since"],
  ["account-operator", "managed in operator administration"],
  ["account-reason", "Why are you opening this account?"],
  ["account-not-found", "No such account"],
  ["suspend-preview", "They’re signed out on every device now."],
  ["suspend-conflict", "Someone else changed this first"],
] as const) {
  test(`${id}: renders, stays local, passes axe and fits 375–1920`, async ({ page }) => {
    const outside = await story(page, id);
    await expect(page.getByText(text).first()).toBeVisible();
    expect(outside).toEqual([]);
    expect(await axe(page)).toEqual([]);
    await page.screenshot({
      path: `test-results/control-plane-users/${id}-1440.png`,
      fullPage: true,
    });
    for (const width of [375, 390, 768, 1024, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await overflow(page), `${id} at ${width}`).toBeLessThanOrEqual(0);
    }
  });
}

test("AD8 at 1440: contexts and security side by side", async ({ page }) => {
  await story(page, "account-active");
  const contexts = await page.getByRole("region", { name: "Contexts" }).boundingBox();
  const security = await page.getByRole("region", { name: "Account and security" }).boundingBox();
  expect(contexts && security).toBeTruthy();
  if (contexts && security) {
    expect(security.x).toBeGreaterThan(contexts.x + contexts.width - 1);
    expect(Math.abs(security.y - contexts.y)).toBeLessThanOrEqual(1);
  }
});

test("AD8 below 640: high-risk actions are hidden and say why; reading works", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await story(page, "account-active");
  await expect(page.getByText("High-risk actions need a larger screen")).toBeVisible();
  await expect(page.getByRole("button", { name: "Suspend account" })).toBeHidden();
  await expect(page.getByRole("region", { name: "Account and security" })).toBeVisible();
});

test("AD7 keyboard: query, reason and search without a mouse", async ({ page }) => {
  await story(page, "search-result");
  await page.getByRole("textbox", { name: /Exact email or user ID/ }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: /Reason/ })).toBeFocused();
});
