import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * AD17 (SF-126) on the static Storybook build, on a per-story API double (mock-only, not
 * backend E2E): axe (WCAG 2.2 AA tags), 375–1920 fit, the 1440 layout and keyboard use.
 */

const STORYBOOK = "http://127.0.0.1:6007";
const PREFIX = "control-plane-system-health--";

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
  ["measured", "Service health"],
  ["all-healthy", "The job list needs job access."],
  ["unreachable", "We can’t reach the health checks."],
  ["queues-unavailable", "Couldn’t count the jobs."],
  ["restricted", "You don’t have access to this section"],
  ["jobs-empty", "No jobs match."],
  ["job-detail", "no worker has an approved retry policy"],
] as const) {
  test(`${id}: renders, stays local, passes axe and fits 375–1920`, async ({ page }) => {
    const outside = await story(page, id);
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 10_000 });
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState !== "running"),
    );
    expect(outside).toEqual([]);
    expect(await axe(page)).toEqual([]);
    await expect(page.getByRole("button", { name: /retry/i })).toHaveCount(0);
    await page.screenshot({
      path: `test-results/control-plane-system-health/${id}-1440.png`,
      fullPage: true,
    });
    for (const width of [375, 390, 768, 1024, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await overflow(page), `${id} at ${width}`).toBeLessThanOrEqual(0);
    }
  });
}

test("AD17 at 1440: queues beside the release", async ({ page }) => {
  await story(page, "measured");
  const queues = page.getByRole("region", { name: "Queues" });
  const release = page.getByRole("region", { name: "Release" });
  await expect(release).toBeVisible({ timeout: 10_000 });
  const a = await queues.boundingBox();
  const b = await release.boundingBox();
  expect(a && b).toBeTruthy();
  if (a && b) {
    expect(b.x).toBeGreaterThan(a.x + a.width - 1);
    expect(Math.abs(b.y - a.y)).toBeLessThanOrEqual(1);
  }
});

test("AD17 keyboard: job filters in order, then a job opens with Enter", async ({ page }) => {
  await story(page, "job-detail");
  await expect(page.getByText(/no worker has an approved retry policy/)).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("combobox", { name: "State" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "Queue" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "Worker" })).toBeFocused();
  const open = page.getByRole("button", { name: "#41" });
  await open.focus();
  await page.keyboard.press("Enter");
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(open).toHaveAttribute("aria-expanded", "true");
});
