import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * The member join, invitation and My gyms stories (SF-134) on the static Storybook build:
 * each renders the production composition in its state with no request
 * leaving the page, in the dark and light themes, without accessibility
 * violations, and at every width from 375 to 1920 px without horizontal
 * overflow; the answer works from the keyboard.
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
  await page.goto(`${STORYBOOK}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`);
  await page.waitForFunction(() =>
    ["sb-show-main", "sb-show-errordisplay"].some((name) => document.body.classList.contains(name)),
  );
  expect(await page.evaluate(() => document.body.classList.contains("sb-show-errordisplay"))).toBe(
    false,
  );
  return outside;
}

async function axe(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await page.evaluate(async () => {
        const { violations } = await (
          window as unknown as {
            axe: {
              run: (
                context: Element,
                options: object,
              ) => Promise<{ violations: { id: string; nodes: unknown[] }[] }>;
            };
          }
        ).axe.run(document.querySelector("main") ?? document.body, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
          },
        });
        return violations.map((violation) => `${violation.id} (${violation.nodes.length})`);
      });
    } catch (error) {
      if (attempt >= 20 || !String(error).includes("Axe is already running")) throw error;
      await page.waitForTimeout(250);
    }
  }
}

test.use({ viewport: { width: 1440, height: 900 } });

const INVITE = "gym-member-invitation-recipient--";
const MEMBER = "gym-member-membership--";
const STATES = [
  [`${INVITE}signed-out`, "Join Ring One Boxing on SimpleFit."],
  [`${INVITE}signed-out-unavailable`, "This invitation isn't available"],
  [`${INVITE}signed-out-limited`, "Too many attempts."],
  [`${INVITE}backend-unavailable`, "We couldn't confirm that."],
  [`${INVITE}network-retry`, "We couldn't confirm that."],
  [`${INVITE}no-token`, "Open the invitation from your email"],
  [`${INVITE}pending`, "Accept invitation"],
  [`${INVITE}registration`, "Finish your account first."],
  [`${INVITE}wrong-account`, "This invitation is for another email."],
  [`${INVITE}verifying`, "Back to the invitation"],
  [`${INVITE}accepting`, "Accepting…"],
  [`${INVITE}confirm-decline`, "Keep the invitation"],
  [`${INVITE}declined-just-now`, "You declined this invitation"],
  [`${INVITE}expired`, "This invitation has expired"],
  [`${INVITE}revoked`, "This invitation was withdrawn"],
  [`${INVITE}declined`, "You declined this invitation"],
  [`${INVITE}already-accepted`, "You're a member of Ring One Boxing"],
  [`${INVITE}access-ended`, "This membership has ended"],
  [`${INVITE}already-member`, "You're already a member of Ring One Boxing"],
  [`${INVITE}accept-failed`, "We couldn't confirm that."],
  [`${INVITE}unavailable`, "This invitation isn't available"],
  [`${MEMBER}gyms-every-status`, "Waiting for approval"],
  [`${MEMBER}gyms-empty`, "You’re not a member of a gym"],
  [`${MEMBER}gyms-failed`, "Try again"],
  [`${MEMBER}leave-confirm`, "your upcoming bookings at this gym are cancelled"],
  [`${MEMBER}cancel-request-confirm`, "Keep the request"],
  [`${MEMBER}join-code`, "Gym code"],
  [`${MEMBER}join-not-found`, "We couldn't find a gym with that code."],
  [`${MEMBER}join-limited`, "Too many attempts"],
  [`${MEMBER}join-preview-approval`, "Send join request"],
  [`${MEMBER}join-preview-instant`, "Join gym"],
  [`${MEMBER}join-requested`, "Request sent to Ring One Boxing"],
  [`${MEMBER}join-active`, "You're a member of Ring One Boxing"],
  [`${MEMBER}join-already`, "You're already a member of this gym"],
  [`${MEMBER}inbox-list`, "Invited by Yauheni"],
  [`${MEMBER}inbox-empty`, "No invitations right now"],
  [`${MEMBER}inbox-failed`, "Try again"],
  [`${MEMBER}inbox-decline-confirm`, "Keep the invitation"],
] as const;

for (const theme of ["Dark", "Light"] as const) {
  for (const [id, text] of STATES) {
    test(`${theme} · ${id}: ${text}`, async ({ page }) => {
      const outside = await story(page, id, theme);
      await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
      expect(outside).toEqual([]);
    });
  }
}

test("loading says what it waits for", async ({ page }) => {
  await story(page, `${INVITE}loading`, "Dark");
  await expect(page.getByRole("status", { name: "Loading the invitation" })).toBeVisible({
    timeout: 15_000,
  });
});

for (const [id, text] of STATES) {
  test(`no accessibility violations · ${id}`, async ({ page }) => {
    await story(page, id, "Dark");
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(300);
    expect(await axe(page)).toEqual([]);
  });
}

for (const [id, text] of [
  [`${INVITE}pending`, "Accept invitation"],
  [`${INVITE}wrong-account`, "This invitation is for another email."],
  [`${MEMBER}gyms-every-status`, "Waiting for approval"],
  [`${MEMBER}join-code`, "Gym code"],
  [`${MEMBER}join-preview-approval`, "Send join request"],
  [`${MEMBER}inbox-list`, "Invited by Yauheni"],
] as const) {
  test(`no accessibility violations in the light theme · ${id}`, async ({ page }) => {
    await story(page, id, "Light");
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
    // The theme's colour transition settles first, as in every axe test here.
    await page.waitForTimeout(300);
    expect(await axe(page)).toEqual([]);
  });
}

for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1280, 720],
  [1024, 768],
  [768, 1024],
  [430, 932],
  [390, 844],
  [375, 667],
] as const) {
  test(`no horizontal overflow at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const [id, text] of [
      [`${INVITE}pending`, "Accept invitation"],
      [`${INVITE}wrong-account`, "This invitation is for another email."],
      [`${MEMBER}gyms-every-status`, "Waiting for approval"],
      [`${MEMBER}join-preview-approval`, "Send join request"],
      [`${MEMBER}inbox-list`, "Invited by Yauheni"],
    ] as const) {
      await story(page, id, "Dark");
      await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(200);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });
}

test("keyboard: Tab reaches the answer, and declining keeps focus on the choice", async ({
  page,
  browserName,
}) => {
  // Desktop Safari's default Tab skips links and buttons unless the system says otherwise.
  const forward = browserName === "webkit" ? "Alt+Tab" : "Tab";
  await story(page, `${INVITE}pending`, "Dark");
  const accept = page.getByRole("button", { name: "Accept invitation" });
  await expect(accept).toBeVisible({ timeout: 15_000 });
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press(forward);
    if (await accept.evaluate((node) => node === document.activeElement)) break;
  }
  await expect(accept).toBeFocused();
  await page.keyboard.press(forward);
  const decline = page.getByRole("button", { name: "Decline" });
  await expect(decline).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Decline" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Keep the invitation" })).toBeVisible();
});

test("keyboard: the code form submits with Enter and its error is announced", async ({ page }) => {
  await story(page, `${MEMBER}join-code`, "Dark");
  const field = page.getByLabel("Gym code");
  await expect(field).toBeFocused({ timeout: 15_000 });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Enter your gym's code.");
});
