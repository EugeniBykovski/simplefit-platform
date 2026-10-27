import { expect, test, type Page } from "@playwright/test";

/*
 * The Gym owner registration stories (SF-86) on the static Storybook build:
 * each renders the production widget in its state, through its play
 * function, with no request leaving the page (the API is a per-story double).
 */

const STORYBOOK = "http://127.0.0.1:6007";

async function story(page: Page, id: string) {
  const outside: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      if (!url.hostname.endsWith("fonts.gstatic.com")) outside.push(request.url());
    }
  });
  await page.goto(
    `${STORYBOOK}/iframe.html?id=gym-onboarding-registration--${id}&viewMode=story&globals=theme:Dark`,
  );
  await page.waitForFunction(() =>
    ["sb-show-main", "sb-show-errordisplay"].some((name) => document.body.classList.contains(name)),
  );
  expect(await page.evaluate(() => document.body.classList.contains("sb-show-errordisplay"))).toBe(
    false,
  );
  return outside;
}

test.use({ viewport: { width: 1440, height: 900 } });

for (const [id, text] of [
  ["create-empty", "Gym name & type"],
  ["create-another", "You already have a gym in SimpleFit."],
  ["create-resumed", "Simple Boxing Gym"],
  ["create-invalid", "Check the highlighted fields."],
  ["creating", "Creating…"],
  ["create-offline", "We couldn’t confirm your gym was created."],
  ["create-rate-limited", "You’ve started several gyms today."],
  ["create-discarded", "That gym draft was discarded."],
  ["type-conflict", "This gym changed on another device or tab."],
  ["save-and-exit", "Saving…"],
  ["session-expired", "Your session ended."],
  ["location-empty", "Add the address"],
  ["location-invalid", "Enter the street address."],
  ["location-saved", "ul. Ząbkowska 31, 03-736"],
  ["location-conflict", "This gym changed on another device or tab."],
  ["branding-empty", "Cover photo upload isn’t available yet."],
  ["branding-chosen", "Boxing for everyone. Fighters welcome."],
  ["branding-missing-location", "Your gym is missing details."],
  ["created", "Simple Boxing Gym is created."],
  ["created-open-failure", "We couldn’t open your gym."],
  ["loading", "Loading your gym setup…"],
  ["load-failure", "We couldn’t load your gym setup."],
  ["load-offline", "We couldn’t load your gym setup."],
  ["light-branding", "Box on."],
  ["draft-gone", "This gym draft is no longer available."],
  ["german-location", "Standort"],
  ["phone-create", "Gym name & type"],
] as const) {
  test(`${id}: ${text}`, async ({ page }) => {
    const outside = await story(page, id);
    const shown =
      id === "loading" ? page.getByRole("status", { name: text }) : page.getByText(text).first();
    await expect(shown).toBeVisible({ timeout: 15_000 });
    expect(outside).toEqual([]);
  });
}
