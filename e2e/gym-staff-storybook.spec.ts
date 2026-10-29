import { expect, test, type Page } from "@playwright/test";

/*
 * The coaches & staff stories (SF-94, WG16) on the static Storybook build:
 * each renders the production route composition in its state, through its
 * play function, with no request leaving the page (the API is a per-story
 * double), in the dark and light themes.
 */

const STORYBOOK = "http://127.0.0.1:6007";

async function story(page: Page, id: string, theme: "Dark" | "Light") {
  const outside: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      if (!url.hostname.endsWith("fonts.gstatic.com")) outside.push(request.url());
    }
  });
  await page.goto(
    `${STORYBOOK}/iframe.html?id=gym-console-coaches-and-staff--${id}&viewMode=story&globals=theme:${theme}`,
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

for (const theme of ["Dark", "Light"] as const) {
  for (const [id, text] of [
    ["owner-team", "Agnieszka L."],
    ["owner-pending-invitations", "k•••@example.com"],
    ["owner-alone", "Only you so far."],
    ["expired-invitation", "Expired"],
    ["ended-empty", "No one has left"],
    ["manager", "Coaches & staff"],
    ["coach", "The owner keeps full access."],
    ["front-desk", "Michał S."],
    ["other-gym", "Ewa P."],
    ["invite-dialog", "Invite to Ring One Boxing"],
    ["invite-validation", "Enter a valid email address."],
    ["invite-pending", "Sending…"],
    ["invite-rate-limited", "Too many requests"],
    ["role-change", "Change Tomasz Z.’s role"],
    ["remove-confirmation", "Remove Michał S. from Ring One Boxing?"],
    ["cancel-invitation", "Cancel this invitation?"],
    ["backend-error", "We couldn’t load the team"],
    ["permission-denied", "Your role doesn’t include this"],
    ["revoked-gym", "This gym isn’t available"],
    ["long-text", "Małgorzata-Aleksandra K."],
    ["german-locale", "Coaches & Team"],
    ["light", "Yauheni B."],
    ["dark", "Yauheni B."],
    ["narrow", "Coaches & staff"],
  ] as const) {
    test(`${theme} · ${id}: ${text}`, async ({ page }) => {
      const outside = await story(page, id, theme);
      await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
      expect(outside).toEqual([]);
    });
  }
}

test("loading: the roster says it is loading", async ({ page }) => {
  await story(page, "loading", "Dark");
  await expect(page.getByRole("status", { name: "Loading the team" })).toBeVisible({
    timeout: 15_000,
  });
});
