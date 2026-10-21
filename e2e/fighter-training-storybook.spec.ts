import { expect, test, type Page } from "@playwright/test";

/*
 * The Fighter Training stories (SF-67) on the static Storybook build: each
 * renders the production route composition in its state, through its play
 * function, with no request leaving the page (the API is a per-story double).
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

test.use({ viewport: { width: 1440, height: 900 }, timezoneId: "Europe/Warsaw" });

const ID = "fighter-training-training-and-session--";

for (const [id, text] of [
  [`${ID}upcoming`, "Julia N. · North Gym"],
  [`${ID}history`, "Former coach · Tomasz M."],
  [`${ID}history-completed`, "Roadwork intervals"],
  [`${ID}history-cancelled`, "Technical boxing"],
  [`${ID}more-pages`, "S&C circuit"],
  [`${ID}more-failed`, "We couldn’t load more sessions. Try again."],
  [`${ID}empty`, "No upcoming training"],
  [`${ID}history-empty`, "No past training yet"],
  [`${ID}unavailable`, "Training isn’t available"],
  [`${ID}failure`, "We couldn’t load your training."],
  [`${ID}planned`, "Jab work and footwork. Keep the last round light."],
  [`${ID}planned-ended`, "had already started"],
  [`${ID}completed`, "You confirmed this session."],
  [`${ID}cancelled-by-coach`, "by your coach"],
  [`${ID}cancelled-by-system`, "the coaching relationship ended"],
  [`${ID}missing`, "This session isn’t available"],
  [`${ID}detail-failure`, "We couldn’t load this session."],
  [`${ID}complete-confirm`, "Mark this session completed?"],
  [`${ID}complete-pending`, "Saving…"],
  [`${ID}complete-failed`, "It may already be saved"],
  [`${ID}complete-done`, "Session marked as completed."],
  [`${ID}not-started`, "This session hasn’t started yet."],
  [`${ID}cancelled-meanwhile`, "This session was cancelled."],
  [`${ID}upcoming-german`, "Anstehend"],
  [`${ID}planned-german`, "Als erledigt markieren"],
] as const) {
  test(`${id}: ${text}`, async ({ page }) => {
    const outside = await story(page, id);
    // Rows repeat their coach in a compact line that is hidden at this width.
    await expect(page.getByText(text).filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    expect(outside).toEqual([]);
  });
}

test("the loading story shows no sessions and leaves the page alone", async ({ page }) => {
  const outside = await story(page, `${ID}loading`);
  await expect(page.getByRole("heading", { level: 1, name: "Training" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("status", { name: "Loading your training" })).toBeVisible();
  await expect(page.locator("[data-session-row]")).toHaveCount(0);
  expect(outside).toEqual([]);
});

test("the sidebar's Training item opens WFT1 and is current on it", async ({ page }) => {
  await story(page, `${ID}upcoming`);
  const item = page.getByRole("link", { name: "Training", exact: true });
  await expect(item).toHaveAttribute("href", "/en/app/training");
  await expect(item).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Fight camp" })).toHaveCount(0);
});
