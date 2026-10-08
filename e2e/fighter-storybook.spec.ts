import { expect, test, type Page } from "@playwright/test";

/*
 * The Fighter registration stories (SF-38) on the static Storybook build:
 * each renders the production widget in its state, through its play
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
  await page.goto(
    `/iframe.html?id=fighter-onboarding-registration--${id}&viewMode=story&globals=theme:Dark`,
  );
  await page.waitForFunction(() =>
    ["sb-show-main", "sb-show-errordisplay"].some((name) => document.body.classList.contains(name)),
  );
  expect(await page.evaluate(() => document.body.classList.contains("sb-show-errordisplay"))).toBe(
    false,
  );
  return outside;
}

test.use({ viewport: { width: 1440, height: 980 } });

for (const [id, text] of [
  ["basics-empty", "Your fighter profile"],
  ["basics-resumed", "Alex K."],
  ["basics-invalid", "Check the highlighted fields."],
  ["basics-conflict", "That username is taken. Try another."],
  ["basics-saving", "Saving…"],
  ["basics-failure", "We couldn’t save your changes."],
  ["profile-empty", "Your boxing profile"],
  ["profile-resumed", "Goals: improve technique, competition"],
  ["profile-optional-only", "Your boxing profile"],
  ["profile-precision", "Use at most one decimal place, like 73.8."],
  ["profile-blocked", "A few details are still missing."],
  ["profile-finishing", "Finishing…"],
  ["profile-failure", "We couldn’t save your changes."],
  ["completed", "You’re in, Alex."],
  ["loading", "Loading your fighter profile…"],
  ["load-failure", "We couldn’t load your fighter profile."],
] as const) {
  test(`${id}: ${text}`, async ({ page }) => {
    const outside = await story(page, id);
    // The loading spinner is announced as a status named by its label.
    const shown =
      id === "loading" ? page.getByRole("status", { name: text }) : page.getByText(text).first();
    await expect(shown).toBeVisible({ timeout: 15_000 });
    expect(outside).toEqual([]);
  });
}
