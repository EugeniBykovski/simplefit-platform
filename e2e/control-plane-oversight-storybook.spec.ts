import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * AD2, AD12 and AD7's Fighters and Coaches tabs (SF-123) on the static Storybook build,
 * on a per-story API double (mock-only, not backend E2E): axe (WCAG 2.2 AA tags),
 * 375–1920 fit, the 1440 layouts, and keyboard use of the filters and tabs.
 */

const STORYBOOK = "http://127.0.0.1:6007";
const PREFIX = "control-plane-oversight--";

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
  ["gyms-ready", "Alpha Boxing"],
  ["gyms-empty", "No gyms match"],
  ["gyms-error", "We couldn’t load this"],
  ["gyms-restricted", "You don’t have access to this section"],
  ["gym-ready", "Business verification"],
  ["gym-draft", "Setting up"],
  ["gym-reason", "Why are you opening this gym?"],
  ["gym-not-found", "No such gym"],
  ["gym-restricted", "You don’t have access to this section"],
  ["fighter-profile", "Southpaw"],
  ["coach-profile", "Coaching relationships"],
  ["coach-no-match", "No coach matches"],
  ["people-restricted", "You don’t have access to this section"],
] as const) {
  test(`${id}: renders, stays local, passes axe and fits 375–1920`, async ({ page }) => {
    const outside = await story(page, id);
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 10_000 });
    expect(outside).toEqual([]);
    expect(await axe(page)).toEqual([]);
    await page.screenshot({
      path: `test-results/control-plane-oversight/${id}-1440.png`,
      fullPage: true,
    });
    for (const width of [375, 390, 768, 1024, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await overflow(page), `${id} at ${width}`).toBeLessThanOrEqual(0);
    }
  });
}

test("AD12 at 1440: people beside verification and the gym", async ({ page }) => {
  await story(page, "gym-ready");
  const people = page.getByRole("region", { name: "People" });
  const verification = page.getByRole("region", { name: "Business verification" });
  await expect(verification).toBeVisible({ timeout: 10_000 });
  const a = await people.boundingBox();
  const b = await verification.boundingBox();
  expect(a && b).toBeTruthy();
  if (a && b) {
    expect(b.x).toBeGreaterThan(a.x + a.width - 1);
    expect(Math.abs(b.y - a.y)).toBeLessThanOrEqual(1);
  }
});

test("AD2 at 390: the table scrolls inside its card, the page doesn't", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await story(page, "gyms-ready");
  await expect(page.getByRole("table")).toBeVisible({ timeout: 10_000 });
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await expect(page.getByRole("link", { name: "Alpha Boxing" })).toBeVisible();
});

test("AD2 keyboard: name, setup, verification, country in order", async ({ page }) => {
  await story(page, "gyms-ready");
  await page.getByRole("textbox", { name: "Name starts with" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "Setup" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "Verification" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: "Country" })).toBeFocused();
});

test("AD7 keyboard: arrow keys move between the tabs", async ({ page }) => {
  await story(page, "fighter-profile");
  // The story's own play (search, open the profile) finishes first: it moves focus.
  await expect(page.getByText("Southpaw")).toBeVisible({ timeout: 10_000 });
  const fighters = page.getByRole("tab", { name: "Fighters" });
  await expect(fighters).toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
  await fighters.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Coaches" })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(fighters).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Accounts" })).toBeFocused();
});
