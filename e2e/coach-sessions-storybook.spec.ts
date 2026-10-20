import { expect, test, type Page } from "@playwright/test";

/*
 * The Coach sessions stories (SF-64) on the static Storybook build: each
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

const ID = "coach-sessions-planner-session-and-form--";

for (const [id, text] of [
  [`${ID}upcoming`, "Pads with coach"],
  [`${ID}history`, "Roadwork intervals"],
  [`${ID}history-completed`, "Roadwork intervals"],
  [`${ID}more-pages`, "S&C circuit"],
  [`${ID}empty`, "No upcoming sessions"],
  [`${ID}history-empty`, "No past sessions yet"],
  [`${ID}unavailable`, "Sessions aren’t available yet"],
  [`${ID}failure`, "We couldn’t load your sessions."],
  [`${ID}create`, "Notes for the fighter · optional"],
  [`${ID}create-invalid`, "Enter a title of up to 80 characters."],
  [`${ID}create-gap`, "This time doesn’t exist on that day."],
  [`${ID}create-overlap`, "This time happens twice on that day."],
  [`${ID}create-saving`, "Saving…"],
  [`${ID}create-failed`, "We couldn’t save the session."],
  [`${ID}create-unavailable`, "You can’t plan for this fighter any more."],
  [`${ID}create-no-fighters`, "No fighters to plan for yet"],
  [`${ID}planned`, "Jab work and footwork. Keep the last round light."],
  [`${ID}completed`, "The fighter confirmed this session."],
  [`${ID}cancelled`, "the coaching relationship ended"],
  [`${ID}missing`, "This session isn’t available"],
  [`${ID}cancel-confirm`, "Cancel this session?"],
  [`${ID}cancel-pending`, "Cancelling…"],
  [`${ID}cancel-failed`, "Nothing changed."],
  [`${ID}edit`, "The fighter of a session can’t change."],
  [`${ID}edit-conflict`, "This session can’t be changed any more."],
  [`${ID}upcoming-german`, "Anstehend"],
  [`${ID}create-german`, "Notizen für den Athleten · optional"],
] as const) {
  test(`${id}: ${text}`, async ({ page }) => {
    const outside = await story(page, id);
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
    expect(outside).toEqual([]);
  });
}

test("the loading story shows no sessions and leaves the page alone", async ({ page }) => {
  const outside = await story(page, `${ID}loading`);
  await expect(page.getByRole("heading", { level: 1, name: "Sessions" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("status", { name: "Loading your sessions" })).toBeVisible();
  await expect(page.locator("[data-session-row]")).toHaveCount(0);
  expect(outside).toEqual([]);
});
