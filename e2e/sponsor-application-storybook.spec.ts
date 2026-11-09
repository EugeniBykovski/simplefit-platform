import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * The sponsor application stories (SF-115) on the static Storybook build:
 * each renders the production widget in its state through its play
 * function, with no request leaving the page (the API is a per-story
 * double; mock-only, not backend E2E). Every state passes axe (WCAG 2.2 AA
 * tags) and fits from 375 to 1920 px without horizontal scrolling. The
 * 1440 px screenshots are kept for the side-by-side Design QA.
 */

const STORYBOOK = "http://127.0.0.1:6007";
const PREFIX = "sponsor-application-application--";

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
  ["entry-signed-out", "Sign in to start your application"],
  ["entry-registration", "First, finish your account"],
  ["entry-ready", "You’re ready to start"],
  ["entry-resume", "Continue your application?"],
  ["entry-exists", "You’ve already applied"],
  ["entry-error", "We couldn’t check your account"],
  ["company-empty", "Tell us who you are."],
  ["company-invalid", "3 answers to check"],
  ["contact-saving", "Saving…"],
  ["contact-save-failed", "We couldn’t save your last change."],
  ["interests-saved", "Saved to your account"],
  ["markets", "Where are you interested in?"],
  ["budget", "This is an estimate, not a commitment."],
  ["goals-stale", "This draft changed somewhere else."],
  ["uploads-unavailable", "Uploads aren’t available yet."],
  ["uploads-with-documents", "Upload didn’t finish"],
  ["upload-failed", "File storage isn’t available right now"],
  ["review-ready", "What submitting does:"],
  ["review-missing", "Some required answers are missing."],
  ["review-closed", "Applications can’t be submitted yet."],
  ["submitting", "Submitting…"],
  ["submit-failed", "We couldn’t submit your application."],
  ["changes-requested", "Which events would you like"],
  ["resubmit", "Send back to SimpleFit"],
  ["submitted", "Application received"],
  ["status-submitted", "We’ve received your application"],
  ["status-under-review", "We’re reviewing your application"],
  ["status-changes-requested", "We need a few changes"],
  ["status-approved", "Your application is approved"],
  ["status-draft", "Your draft isn’t submitted"],
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
    await page.screenshot({
      path: `test-results/sponsor-application/${id}-1440.png`,
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

test("the 1440 composition: rail 260, aside 320, form between", async ({ page }) => {
  await story(page, "contact-saving");
  const rail = await page.getByRole("navigation", { name: "Application steps" }).boundingBox();
  const aside = await page.getByRole("complementary", { name: "Your application" }).boundingBox();
  expect(rail?.width).toBe(260);
  expect(aside?.width).toBe(320);
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(page.getByRole("complementary", { name: "Your application" })).toBeHidden();
  expect(
    (await page.getByRole("navigation", { name: "Application steps" }).boundingBox())?.width,
  ).toBe(230);
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(page.getByRole("navigation", { name: "Application steps" })).toBeHidden();
  await expect(page.getByRole("progressbar")).toBeVisible();
});
