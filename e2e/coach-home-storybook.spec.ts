import { expect, test, type Page } from "@playwright/test";

/*
 * The Coach workspace and context-selection stories (SF-54) on the static
 * Storybook build: each renders the production route composition in its
 * state, through its play function, with no request leaving the page (the
 * API is a per-story double).
 */

async function story(page: Page, id: string) {
  const outside: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      if (!url.hostname.endsWith("fonts.gstatic.com")) outside.push(request.url());
    }
  });
  await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:Dark`);
  await page.waitForFunction(() =>
    ["sb-show-main", "sb-show-errordisplay"].some((name) => document.body.classList.contains(name)),
  );
  expect(await page.evaluate(() => document.body.classList.contains("sb-show-errordisplay"))).toBe(
    false,
  );
  return outside;
}

test.use({ viewport: { width: 1440, height: 900 } });

const HOME = "coach-home-dashboard--";
const CHOOSER = "context-selection-choose-where-to-continue--";

for (const [id, text] of [
  [`${HOME}dashboard`, "Welcome, Alex Novak"],
  [`${HOME}coach-only`, "Set up a fighter profile"],
  [`${HOME}failure`, "Try again"],
  [`${HOME}switcher-open`, "One account. We open your last choice next time."],
  [`${HOME}switch-pending`, "Your profiles"],
  [`${HOME}switch-failed`, "We couldn’t switch."],
  [`${HOME}fighter-only`, "Continue coach setup"],
  [`${HOME}phone`, "Welcome, Alex Novak"],
  [`${HOME}long-german`, "Willkommen, Alex Novak"],
  [`${CHOOSER}completed`, "Where do you want to go?"],
  [`${CHOOSER}setup`, "Which setup do you want to continue?"],
  [`${CHOOSER}pending`, "Opening…"],
  [`${CHOOSER}failed`, "We couldn’t open that."],
  [`${CHOOSER}phone`, "Alex Novak · Coach dashboard"],
] as const) {
  test(`${id}: ${text}`, async ({ page }) => {
    const outside = await story(page, id);
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
    expect(outside).toEqual([]);
  });
}

test("loading, unauthorized and expired-session stories render without leaving the page", async ({
  page,
}) => {
  for (const id of [`${HOME}loading`, `${HOME}unauthorized`, `${HOME}session-expired`]) {
    const outside = await story(page, id);
    await expect(page.getByText("Welcome, Alex Novak")).toHaveCount(0);
    expect(outside).toEqual([]);
  }
});
