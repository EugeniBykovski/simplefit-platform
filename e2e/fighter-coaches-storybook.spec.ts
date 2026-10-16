import { expect, test, type Page } from "@playwright/test";

/*
 * The coach invitation and My coaches stories (SF-60) on the static
 * Storybook build: each renders the production composition in its state,
 * through its play function, with no request leaving the page.
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

const INVITE = "coach-invitation-fighter-response--";
const COACHES = "fighter-coaches-my-coaches--";

for (const [id, text] of [
  [`${INVITE}signed-out`, "Sign in to respond"],
  [`${INVITE}review`, "I agree that Coach Marek sees the fields above."],
  [`${INVITE}profile-needed`, "Continue setup"],
  [`${INVITE}accept-pending`, "Accepting…"],
  [`${INVITE}accepted`, "You’re connected with Coach Marek."],
  [`${INVITE}mismatch`, "Sign out and switch account"],
  [`${INVITE}stale`, "What you would share has changed."],
  [`${INVITE}decline-pending`, "Declining…"],
  [`${INVITE}declined`, "Invitation declined"],
  [`${INVITE}unavailable`, "This invitation isn’t available"],
  [`${INVITE}limited`, "Too many attempts."],
  [`${INVITE}network-error`, "We couldn’t load the invitation."],
  [`${INVITE}no-link`, "No invitation to show"],
  [`${COACHES}multiple`, "Alex Novak"],
  [`${COACHES}one`, "Coach Marek"],
  [`${COACHES}expanded`, "What Coach Marek sees"],
  [`${COACHES}ended`, "Sam R."],
  [`${COACHES}paginated`, "Alex Novak"],
  [`${COACHES}empty`, "No coaches yet"],
  [`${COACHES}failure`, "We couldn’t load your coaches."],
  [`${COACHES}end-confirm`, "End your relationship with Coach Marek?"],
  [`${COACHES}end-pending`, "Ending…"],
  [`${COACHES}end-failed`, "Nothing changed."],
  [`${COACHES}end-succeeded`, "Coach Marek no longer sees your profile."],
] as const) {
  test(`${id}: ${text}`, async ({ page }) => {
    const outside = await story(page, id);
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
    expect(outside).toEqual([]);
    // The fixture token never stays in the address bar.
    expect(page.url()).not.toContain("sfi_");
  });
}

test("loading stories leave the page alone", async ({ page }) => {
  for (const id of [`${INVITE}loading`, `${COACHES}loading`]) {
    expect(await story(page, id)).toEqual([]);
  }
});
