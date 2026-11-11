import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * AS1 and AS2 (SF-124) on the static Storybook build, on a per-story API double
 * (mock-only, not backend E2E): axe (WCAG 2.2 AA tags), 375–1920 fit, the 1440 layout,
 * high-risk actions hidden below 640 px, keyboard filters and the dialog's focus.
 */

const STORYBOOK = "http://127.0.0.1:6007";
const PREFIX = "control-plane-sponsor-review--";

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
  ["queue-ready", "Haymaker GmbH"],
  ["queue-empty", "No applications match"],
  ["queue-error", "We couldn’t load this"],
  ["queue-restricted", "You don’t have access to this section"],
  ["detail-submitted", "Nobody has claimed this yet."],
  ["detail-under-review", "Submitted answers"],
  ["detail-read-only", "Some actions aren’t shown"],
  ["detail-changes-requested", "Open change request"],
  ["detail-approved", "Suspend organization"],
  ["detail-suspended", "Reinstate organization"],
  ["detail-rejected", "Rejected. Decisions don’t reopen."],
  ["detail-party", "you’re a party to it"],
  ["detail-not-found", "No such application"],
  ["approve-preview", "The organization is created"],
  ["reject-conflict", "Someone else changed this application first"],
  ["request-changes", "Answers the applicant may change"],
] as const) {
  test(`${id}: renders, stays local, passes axe and fits 375–1920`, async ({ page }) => {
    const outside = await story(page, id);
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 10_000 });
    // A dialog fades in: measure contrast once nothing is animating.
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState !== "running"),
    );
    expect(outside).toEqual([]);
    expect(await axe(page)).toEqual([]);
    await page.screenshot({
      path: `test-results/control-plane-sponsor-review/${id}-1440.png`,
      fullPage: true,
    });
    for (const width of [375, 390, 768, 1024, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await overflow(page), `${id} at ${width}`).toBeLessThanOrEqual(0);
    }
  });
}

test("AS2 at 1440: answers beside the review panel", async ({ page }) => {
  await story(page, "detail-under-review");
  const answers = page.getByRole("region", { name: "Submitted answers" });
  const review = page.getByRole("region", { name: "Review" });
  await expect(review).toBeVisible({ timeout: 10_000 });
  const a = await answers.boundingBox();
  const b = await review.boundingBox();
  expect(a && b).toBeTruthy();
  if (a && b) {
    expect(b.x).toBeGreaterThan(a.x + a.width - 1);
    expect(Math.abs(b.y - a.y)).toBeLessThanOrEqual(1);
  }
});

test("AS2 below 640: decisions are hidden and say why; reading works", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await story(page, "detail-under-review");
  await expect(page.getByText("High-risk actions need a larger screen")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("button", { name: "Approve" })).toBeHidden();
  await expect(page.getByRole("region", { name: "Submitted answers" })).toBeVisible();
});

test("AS1 keyboard: status, from, until in order", async ({ page }) => {
  await story(page, "queue-ready");
  await page.getByRole("combobox", { name: "Status" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Submitted from")).toBeFocused();
});

test("AS2 dialog: focus moves in, Escape closes it and focus returns to the trigger", async ({
  page,
}) => {
  await story(page, "detail-under-review");
  const approve = page.getByRole("button", { name: "Approve" });
  await expect(approve).toBeVisible({ timeout: 10_000 });
  await approve.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(approve).toBeFocused();
});
