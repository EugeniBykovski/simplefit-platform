import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * SF-157 on the static Storybook build, on a per-story API double (mock-only, not
 * backend E2E): the Control Plane email and password sign-in, setting a password,
 * and the Control Plane opened for a pending operator. axe (WCAG 2.2 AA tags),
 * 375–1920 fit without horizontal overflow, and keyboard-only sign-in.
 */

const STORYBOOK = "http://127.0.0.1:6007";
const PREFIX = "control-plane-password-sign-in--";

async function story(page: Page, id: string) {
  const outside: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      if (!url.hostname.endsWith("fonts.gstatic.com")) outside.push(request.url());
    }
  });
  await page.goto(`${STORYBOOK}/iframe.html?id=${PREFIX}${id}&viewMode=story&globals=theme:Dark`);
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
              ) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }>;
            };
          }
        ).axe.run(document.body, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
          },
        });
        return violations.map(
          (violation) =>
            `${violation.id} (${violation.nodes.length}): ${violation.nodes
              .map((node) => node.target.join(" "))
              .join(", ")}`,
        );
      });
    } catch (error) {
      if (attempt >= 20 || !String(error).includes("Axe is already running")) throw error;
      await page.waitForTimeout(250);
    }
  }
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.use({ viewport: { width: 1440, height: 900 } });

for (const [id, text] of [
  ["sign-in", "Sign in to continue"],
  ["sign-in-invalid", "That email address and password don’t match."],
  ["sign-in-throttled", "Too many attempts."],
  ["sign-in-suspended", "This account is suspended"],
  ["sign-in-offline", "We couldn’t reach SimpleFit."],
  ["password-email", "Set or reset your password"],
  ["password-code", "Code from the email"],
  ["password-wrong-code", "That code isn’t right."],
  ["password-weak", "Use 12 to 128 characters"],
  ["password-done", "Your password is set."],
  ["pending-operator", "security keys aren’t registered yet"],
  ["enroll-on-demand", "Back to the Control Plane"],
] as const) {
  test(`${id}: renders, stays local, passes axe and fits 375–1920`, async ({ page }) => {
    const outside = await story(page, id);
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 10_000 });
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState !== "running"),
    );
    expect(outside).toEqual([]);
    expect(await axe(page)).toEqual([]);
    await page.screenshot({
      path: `test-results/control-plane-sign-in/${id}-1440.png`,
      fullPage: true,
    });
    for (const width of [375, 390, 768, 1024, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await overflow(page), `${id} at ${width}`).toBeLessThanOrEqual(0);
    }
  });
}

test("keyboard only: email, password, show/hide and sign in, with visible focus", async ({
  page,
}) => {
  await story(page, "sign-in");
  const email = page.getByLabel("Email");
  await expect(email).toBeVisible({ timeout: 10_000 });
  await email.focus();
  await page.keyboard.type("founder@example.com");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await page.keyboard.type("correct horse battery staple");
  await page.keyboard.press("Tab");
  const toggle = page.getByRole("button", { name: "Show password" });
  await expect(toggle).toBeFocused();
  // The focused control shows a ring (box-shadow) or an outline.
  const ring = await toggle.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.boxShadow !== "none" || style.outlineStyle !== "none";
  });
  expect(ring).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeFocused();
});
