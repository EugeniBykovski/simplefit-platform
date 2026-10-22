import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

/*
 * The SF-78 stories on the static Storybook build: each drives the
 * production WFI1 page and linking flow through its play function into its
 * state, with no request leaving the page; the flow is axe clean in each.
 */

const require = createRequire(import.meta.url);
// Absolute: the cross-engine SF-78 projects use the production base URL.
const STORYBOOK = "http://127.0.0.1:6007";

async function story(page: Page, id: string) {
  const outside: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      if (!url.hostname.endsWith("fonts.gstatic.com")) outside.push(request.url());
    }
  });
  await page.goto(`${STORYBOOK}/iframe.html?id=${id}&viewMode=story&globals=theme:Dark`);
  await page.waitForFunction(() =>
    ["sb-show-main", "sb-show-errordisplay"].some((name) => document.body.classList.contains(name)),
  );
  expect(await page.evaluate(() => document.body.classList.contains("sb-show-errordisplay"))).toBe(
    false,
  );
  return outside;
}

async function flowViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  return page.evaluate(async () => {
    const { violations } = await (
      window as unknown as {
        axe: {
          run: (
            context: object,
            options: object,
          ) => Promise<{ violations: { id: string; nodes: unknown[] }[] }>;
        };
      }
    ).axe.run(
      { include: [["[data-slot=email-identity-link]"]] },
      { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } },
    );
    return violations.map((violation) => `${violation.id} (${violation.nodes.length})`);
  });
}

const ID = "coach-invitation-verify-invited-email--";

const STORIES: [string, string, number?][] = [
  ["email-empty", "Add the invited email to this account"],
  ["email-populated", "Send code"],
  ["email-invalid", "Enter a valid email address."],
  ["request-pending", "Sending…"],
  ["request-limited", "Too many attempts. Try again shortly."],
  ["request-network-error", "Something went wrong. Check your connection and try again."],
  ["code-sent", "Code sent. Check spam if you don’t see it."],
  ["code-entry", "Enter the code"],
  ["code-incorrect", "That code isn’t right. Check the digits and try again."],
  ["code-expired", "This code no longer works. Send a new one."],
  ["code-throttled", "Resend unavailable for now"],
  ["session-expired", "No invitation to show"],
  ["ownership-conflict", "Accounts are never merged."],
  ["network-uncertain", "We couldn’t confirm the code. Check your connection and try again."],
  ["retry", "Email verified"],
  ["linked", "Email verified"],
  ["invitation-continuation", "Accept invitation"],
  ["german-code", "Konten werden nie zusammengeführt."],
  ["narrow-code", "Enter the code", 320],
  ["narrow-linked", "Email verified", 320],
];

for (const [name, text, width] of STORIES) {
  test(`SF-78 story ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: width ?? 1440, height: width ? 640 : 900 });
    const outside = await story(page, `${ID}${name}`);
    await expect(page.getByText(text, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    expect(outside).toEqual([]);
    if (!["invitation-continuation", "session-expired"].includes(name)) {
      expect(await flowViolations(page)).toEqual([]);
    }
    if (width) {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBe(0);
    }
  });
}
