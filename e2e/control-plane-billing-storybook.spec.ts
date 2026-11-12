import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * SF-127 billing visibility on the static Storybook build, on a per-story API double
 * (mock-only, not backend E2E): axe (WCAG 2.2 AA tags), 375–1920 fit, the 1440 layout,
 * keyboard use and no financial action.
 */

const STORYBOOK = "http://127.0.0.1:6007";
const PREFIX = "control-plane-billing-visibility--";

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
              ) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }>;
            };
          }
        ).axe.run(document.body, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
          },
        });
        // The failing elements are named, so a violation can be found without rerunning.
        return violations.map(
          (violation) =>
            `${violation.id} (${violation.nodes.length}): ${violation.nodes
              .map((node) => node.target.join(" "))
              .join(", ")}`,
        );
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
  ["overview", "Collected through Stripe invoices"],
  ["live-zero", "No invoice was paid in this period."],
  ["unreachable", "We can’t reach the billing records."],
  ["restricted", "You don’t have access to this section"],
  ["reconciliation-only", "Invoice for another amount"],
  ["invoices", "SF-0003"],
  ["invoices-empty", "No invoices match."],
  ["plans", "Current: v2 · 2 versions"],
  ["plan-history", "gym.member_management"],
] as const) {
  test(`${id}: renders, stays local, passes axe and fits 375–1920`, async ({ page }) => {
    const outside = await story(page, id);
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 10_000 });
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState !== "running"),
    );
    expect(outside).toEqual([]);
    expect(await axe(page)).toEqual([]);
    await expect(
      page.getByRole("button", { name: /^refund|retry|cancel subscription|edit|publish/i }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `test-results/control-plane-billing/${id}-1440.png`,
      fullPage: true,
    });
    for (const width of [375, 390, 768, 1024, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await overflow(page), `${id} at ${width}`).toBeLessThanOrEqual(0);
    }
  });
}

test("AD13 at 1440: the four flows two by two, payment issues beside collected", async ({
  page,
}) => {
  await story(page, "overview");
  await expect(page.getByText("Collected through Stripe invoices")).toBeVisible({
    timeout: 10_000,
  });
  const saas = await page.locator("[data-billing-flow=saas]").boundingBox();
  const member = await page.locator("[data-billing-flow=member]").boundingBox();
  expect(saas && member).toBeTruthy();
  if (saas && member) expect(Math.abs(saas.y - member.y)).toBeLessThanOrEqual(1);
  const issues = await page.getByRole("heading", { name: "Payment issues" }).boundingBox();
  const collected = await page
    .getByRole("heading", { name: "Collected through Stripe invoices" })
    .boundingBox();
  if (issues && collected) {
    expect(collected.x).toBeGreaterThan(issues.x);
    expect(Math.abs(collected.y - issues.y)).toBeLessThanOrEqual(1);
  }
});

test("AD13 keyboard: the mode switch, filters, then a subscription opens with Enter and closes with Escape", async ({
  page,
}) => {
  await story(page, "overview");
  const live = page.getByRole("button", { name: "Live" });
  await expect(live).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Test" }).focus();
  await page.keyboard.press("Tab");
  await expect(live).toBeFocused();
  await page.getByRole("combobox", { name: "Records" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "Status" })).toBeFocused();
  const open = page.getByRole("button", { name: "Open Alpha Boxing" });
  await open.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Disputed (not a refund)")).toBeVisible();
  // The sheet fades in: measure contrast once it has settled.
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== "running"),
  );
  expect(await axe(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
});
