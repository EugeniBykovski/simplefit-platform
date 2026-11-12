import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * SF-128 feature switches on the static Storybook build, on a per-story API double
 * (mock-only, not backend E2E): axe (WCAG 2.2 AA tags), 375–1920 fit, the 1440 layout,
 * keyboard use and no control on read-only switches.
 */

const STORYBOOK = "http://127.0.0.1:6007";
const PREFIX = "control-plane-feature-switches--";

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
  ["read-only", "Suspending or restoring needs configuration write access."],
  ["editable", "Gym member invitation emails (E07)"],
  ["suspended", "Change history"],
  ["deployment-off", "Gym staff invitation emails (E06)"],
  ["unreachable", "We can’t reach the configuration."],
  ["restricted", "You don’t have access to this section"],
] as const) {
  test(`${id}: renders, stays local, passes axe and fits 375–1920`, async ({ page }) => {
    const outside = await story(page, id);
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 10_000 });
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState !== "running"),
    );
    expect(outside).toEqual([]);
    expect(await axe(page)).toEqual([]);
    // High-risk switches never offer a control.
    for (const name of ["Stripe billing", "Stripe mode", "Stripe Connect"]) {
      const row = page.getByRole("row", { name: new RegExp(name) });
      if ((await row.count()) > 0) await expect(row.getByRole("button")).toHaveCount(0);
    }
    await page.screenshot({
      path: `test-results/control-plane-configuration/${id}-1440.png`,
      fullPage: true,
    });
    for (const width of [375, 390, 768, 1024, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await overflow(page), `${id} at ${width}`).toBeLessThanOrEqual(0);
    }
  });
}

test("AD6 keyboard: open the action, pick a reason, preview; Escape returns focus", async ({
  page,
}) => {
  await story(page, "preview");
  const open = page.getByRole("button", { name: "Suspend Gym member invitation emails (E07)" });
  await expect(page.getByText("Nothing that already happened is undone.")).toBeVisible({
    timeout: 10_000,
  });
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== "running"),
  );
  expect(await axe(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: /Reason/ })).toBeFocused();
});
