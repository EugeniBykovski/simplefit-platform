import { expect, test, type Locator, type Page } from "@playwright/test";

/*
 * The WA5 Account basics stories (SF-46) on the static Storybook build: each
 * renders the route's composition (session gate, onboarding gate, widget) in
 * its state, through its play function, with no request leaving the page
 * (the API is a per-story double).
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
    `/iframe.html?id=account-registration-account-basics--${id}&viewMode=story&globals=theme:Dark`,
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

const text = (value: string) => (page: Page) => page.getByText(value).first();
const checkbox = (name: RegExp) => (page: Page) => page.getByRole("checkbox", { name });

for (const [id, shown] of [
  ["empty", text("Before you start")],
  ["loading", text("Loading your account…")],
  ["partially-completed", checkbox(/Terms of Service.*Accepted/)],
  ["resumed", checkbox(/product news/)],
  ["new-document-version", text("A new version is in force: accept it to continue.")],
  ["network-unavailable", text("We couldn’t load your account.")],
  ["missing-consent", text("Accept the Privacy Policy to continue.")],
  ["invalid-date", text("Enter a real date, not in the future.")],
  ["too-young", text("You must be 16 or older to use SimpleFit.")],
  ["missing-requirements", text("Accept the Terms of Service to continue.")],
  ["saving", (page: Page) => page.getByRole("button", { name: "Saving…" })],
  ["save-failure", text("We couldn’t save your details.")],
  ["save-offline", text("We couldn’t save your details.")],
  ["completing", (page: Page) => page.getByRole("button", { name: "Saving…" })],
  ["completed", (page: Page) => page.getByRole("status", { name: "Saving…" })],
  ["continuation-retry", (page: Page) => page.getByRole("alert").getByRole("button")],
] as const satisfies readonly (readonly [string, (page: Page) => Locator])[]) {
  test(`${id}`, async ({ page }) => {
    const outside = await story(page, id);
    await expect(shown(page)).toBeVisible({ timeout: 15_000 });
    expect(outside).toEqual([]);
  });
}

test("session-expired: no form, the visitor is on the way to sign-in", async ({ page }) => {
  const outside = await story(page, "session-expired");
  await expect(page.getByRole("heading", { level: 1, name: "Before you start" })).toHaveCount(0);
  await expect(page.getByLabel("Full name")).toHaveCount(0);
  expect(outside).toEqual([]);
});
