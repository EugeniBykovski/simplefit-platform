import { expect, test, type Page } from "@playwright/test";

/*
 * The Coach fighters stories (SF-58) on the static Storybook build: each
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

test.use({ viewport: { width: 1440, height: 900 } });

const ID = "coach-fighters-roster-and-fighter--";

for (const [id, text] of [
  [`${ID}roster`, "Oleksandr Petrenko-Kowalczyk"],
  [`${ID}ended`, "Sam R."],
  [`${ID}more-pages`, "Oleksandr Petrenko-Kowalczyk"],
  [`${ID}empty`, "No fighters yet"],
  [`${ID}unavailable`, "Fighters aren’t available yet"],
  [`${ID}failure`, "We couldn’t load your fighters."],
  [`${ID}invite-composer`, "Invite a fighter"],
  [`${ID}invite-pending`, "Invitation pending"],
  [`${ID}invite-invalid`, "Enter a valid email address."],
  [`${ID}invite-limited`, "Try again in 10 minutes."],
  [`${ID}invite-blocked`, "Inviting isn’t available yet"],
  [`${ID}cancel-invitation`, "Cancel this invitation?"],
  [`${ID}fighter`, "What Alex K. shares with you"],
  [`${ID}fighter-partly-shared`, "Not shared"],
  [`${ID}end-confirm`, "End your relationship with Alex K.?"],
  [`${ID}end-failed`, "Nothing changed."],
  [`${ID}end-unavailable`, "This relationship is no longer available."],
  [`${ID}fighter-unavailable`, "This fighter isn’t available"],
  [`${ID}roster-german`, "Deine Kämpfer"],
] as const) {
  test(`${id}: ${text}`, async ({ page }) => {
    const outside = await story(page, id);
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
    expect(outside).toEqual([]);
  });
}

test("the loading story shows no roster and leaves the page alone", async ({ page }) => {
  const outside = await story(page, `${ID}loading`);
  await expect(page.getByRole("heading", { level: 1, name: "Fighters" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("table")).toHaveCount(0);
  expect(outside).toEqual([]);
});
