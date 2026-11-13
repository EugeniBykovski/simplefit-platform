import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * SF-129 operators (AD20) on the static Storybook build, on a per-story API double
 * (mock-only, not backend E2E): axe (WCAG 2.2 AA tags), 375–1920 fit, the 1440 layout,
 * keyboard use, no control without operators.manage and none on oneself.
 */

const STORYBOOK = "http://127.0.0.1:6007";
const PREFIX = "control-plane-operators--";

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
  ["ready", "Setting up keys"],
  ["read-only", "You can see operators. Changing them needs operators.manage."],
  ["detail", "Changes to this operator"],
  ["self", "This is you. You can’t change your own permissions or status."],
  ["unreachable", "Couldn’t load operators"],
  ["restricted", "You don’t have access to the operator list"],
] as const) {
  test(`${id}: renders, stays local, passes axe and fits 375–1920`, async ({ page }) => {
    const outside = await story(page, id);
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 10_000 });
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState !== "running"),
    );
    expect(outside).toEqual([]);
    expect(await axe(page)).toEqual([]);
    if (id === "read-only" || id === "self") {
      await expect(page.locator("[data-operator-actions]")).toHaveCount(0);
      await expect(page.locator("[data-add-operator-open]")).toHaveCount(id === "self" ? 1 : 0);
    }
    await page.screenshot({
      path: `test-results/control-plane-operators/${id}-1440.png`,
      fullPage: true,
    });
    for (const width of [375, 390, 768, 1024, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await overflow(page), `${id} at ${width}`).toBeLessThanOrEqual(0);
    }
  });
}

test("AD20 keyboard: preview a suspension; Escape returns focus to the action", async ({
  page,
}) => {
  await story(page, "preview");
  await expect(page.getByText("They can’t open the Control Plane.")).toBeVisible({
    timeout: 10_000,
  });
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== "running"),
  );
  expect(await axe(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const open = page.locator('[data-operator-action-open="suspend"]');
  await expect(open).toBeFocused();
  await open.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: /Reason/ })).toBeFocused();
});

test("AD20 add-operator dialog passes axe; phone hides high-risk actions", async ({ page }) => {
  await story(page, "add-operator");
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== "running"),
  );
  expect(await axe(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await story(page, "detail");
  await expect(page.getByText("Changes to this operator")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("[data-operator-actions]")).toBeHidden();
  await expect(page.getByText(/High-risk actions need a larger screen/)).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("SF-132: the add-operator dialog scrolls on a short screen; its submit button is reachable", async ({
  page,
}) => {
  // The permission list grows with the catalog (SF-130 added five); a dialog taller
  // than the viewport must scroll, never hide its submit button.
  await page.setViewportSize({ width: 1280, height: 560 });
  await story(page, "add-operator");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  const box = await dialog.boundingBox();
  expect(box && box.height <= 560).toBe(true);
  const submit = dialog.getByRole("button", { name: "Add operator" });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport();
});
