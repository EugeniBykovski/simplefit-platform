import { expect, test, type Page } from "@playwright/test";

/*
 * The members stories (SF-96, WG3 with OG12) on the static Storybook build:
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
    `${STORYBOOK}/iframe.html?id=gym-console-members--${id}&viewMode=story&globals=theme:${theme}`,
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
    ["owner-active", "Marta K."],
    ["empty-roster", "No members yet"],
    ["ended-members", "Igor P."],
    ["end-confirmation", "End Marta K.’s membership?"],
    ["manager", "Marta K."],
    ["front-desk", "Only the owner and managers can end a membership."],
    ["coach-restricted", "Your role can’t see this yet"],
    ["other-gym", "Ola P."],
    ["pending-requests", "Kamila L."],
    ["reject-confirmation", "Reject Kamila L.?"],
    ["stale-request", "The person cancelled this request"],
    ["invitation-pending", "k•••@example.com"],
    ["invitations-unavailable", "Nothing was created and no email was sent"],
    ["invite-rate-limited", "Too many requests"],
    ["join-code-enabled", "K7QM-4TXD"],
    ["join-code-disabled", "Joining by code is off."],
    ["rotate-confirmation", "Issue a new join code?"],
    ["auto-approval-confirmation", "Approve verified accounts automatically?"],
    ["auto-approval-on", "On: people with a completed account"],
    ["csv-selection", "No file chosen."],
    ["csv-mapping", "Map columns"],
    ["csv-valid-preview", "Validation complete. Importing member records is not available yet."],
    ["csv-invalid-rows", "Same address as line 2"],
    ["csv-size-violation", "This file is larger than 1 MB."],
    ["csv-preview-failure", "couldn’t be read as a member list"],
    ["csv-commit-unavailable", "Importing members is not available yet"],
    ["network-failure", "Couldn’t load this"],
    ["revoked-gym", "This gym isn’t available"],
    ["long-text", "Małgorzata-Aleksandra K."],
    ["german-locale", "Mitglieder"],
    ["light", "Marta K."],
    ["dark", "Marta K."],
    ["narrow", "Marta K."],
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
  await expect(page.getByRole("status", { name: "Loading members" })).toBeVisible({
    timeout: 15_000,
  });
});

test("the dry run shows masked addresses only, never the file's own values", async ({ page }) => {
  await story(page, "csv-valid-preview", "Dark");
  await expect(page.getByText("Review results")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("a•••@example.com").first()).toBeVisible();
  await expect(page.getByText("anna@example.com")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(import|commit|send)/i })).toHaveCount(0);
});

test("approving: the request leaves the list once the backend answers (its play asserts the announcement)", async ({
  page,
}) => {
  await story(page, "approve-request", "Dark");
  await expect(page.getByRole("button", { name: "Approve Kamila L." })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: "Approve Rafał T." })).toHaveCount(0, {
    timeout: 15_000,
  });
});
