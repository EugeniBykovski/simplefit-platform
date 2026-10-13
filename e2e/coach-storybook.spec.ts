import { expect, test, type Page } from "@playwright/test";

/*
 * The Coach registration stories (SF-52) on the static Storybook build:
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
    `/iframe.html?id=coach-onboarding-registration--${id}&viewMode=story&globals=theme:Dark`,
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
  ["profile-empty", "Suggested from your account name. Change it if you coach under another name."],
  ["profile-resumed", "Alex Boxing · Warsaw, Poland"],
  ["profile-invalid", "Check the highlighted fields."],
  ["profile-saving", "Saving…"],
  ["profile-failure", "We couldn’t save your changes."],
  ["type-empty", "Your formats appear here."],
  ["type-resumed", "Personal Training · Fight Camps · Amateur"],
  ["type-invalid", "Pick at least one format."],
  ["type-incomplete", "Your coach profile is missing details."],
  ["type-finishing", "Finishing…"],
  ["type-failure", "We couldn’t finish your coach sign-up."],
  ["completed", "Coach tools are not available yet."],
  ["completed-opening", "Opening…"],
  ["completed-open-failure", "We couldn’t open your coach home."],
  ["loading", "Loading your coach profile…"],
  ["load-failure", "We couldn’t load your coach profile."],
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
