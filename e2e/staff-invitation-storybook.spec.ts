import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * The staff invitation page's stories (SF-133) on the static Storybook build:
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
  await page.goto(
    `${STORYBOOK}/iframe.html?id=staff-invitation-recipient--${id}&viewMode=story&globals=theme:${theme}`,
  );
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

const STATES = [
  ["signed-out", "Join Ring One Boxing on SimpleFit."],
  ["signed-out-unavailable", "This invitation isn't available"],
  ["signed-out-limited", "Too many attempts."],
  ["backend-unavailable", "We couldn't confirm that."],
  ["network-retry", "We couldn't confirm that."],
  ["no-token", "Open the invitation from your email"],
  ["pending", "Accept invitation"],
  ["pending-manager", "Manager"],
  ["registration", "Finish your account first."],
  ["wrong-account", "This invitation is for another email."],
  ["verifying", "Back to the invitation"],
  ["accepting", "Accepting…"],
  ["confirm-decline", "Keep the invitation"],
  ["declined-just-now", "You declined this invitation"],
  ["expired", "This invitation has expired"],
  ["revoked", "This invitation was withdrawn"],
  ["declined", "You declined this invitation"],
  ["already-accepted", "You're on the team at Ring One Boxing"],
  ["access-ended", "You no longer have access to this gym"],
  ["already-staff", "You already work at Ring One Boxing"],
  ["accept-failed", "We couldn't confirm that."],
  ["unavailable", "This invitation isn't available"],
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
  await story(page, "loading", "Dark");
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

test("no accessibility violations in the light theme · pending", async ({ page }) => {
  await story(page, "pending", "Light");
  await expect(page.getByRole("button", { name: "Accept invitation" })).toBeVisible({
    timeout: 15_000,
  });
  // The theme's colour transition settles first, as in every axe test here.
  await page.waitForTimeout(300);
  expect(await axe(page)).toEqual([]);
});

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
      ["pending", "Accept invitation"],
      ["signed-out", "Create account"],
      ["wrong-account", "This invitation is for another email."],
      ["confirm-decline", "Keep the invitation"],
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
  await story(page, "pending", "Dark");
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
