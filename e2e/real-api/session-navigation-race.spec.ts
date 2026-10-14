import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { expect, type Page, test } from "@playwright/test";

/*
 * RELEASE BLOCKER (untriaged): a full page load that starts while the
 * previous page's session restore (POST /api/auth/session/refresh) is still
 * in flight revokes the session (`refresh_reuse`). Root cause and proposed
 * fix: docs/investigations/session-refresh-navigation-race.md.
 *
 * This reproduces it deterministically against the real API: the first
 * refresh reaches the server (which rotates the cookie) but its response is
 * held until the page has navigated away, as a slow network does. The test
 * is marked as an expected failure where the defect reproduces (Chromium,
 * WebKit); once the fix lands it reports an unexpected pass, and the marker
 * is removed with the fix. It is not disabled and asserts the correct
 * behaviour: the session survives.
 */

const API_URL = process.env.E2E_REAL_API_URL;
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";

test.skip(!API_URL, "E2E_REAL_API_URL is not set: needs a running API");

function disposableDatabase(): string {
  const name = new URL(DATABASE_URL).pathname.slice(1);
  if (!/e2e/.test(name) || name === "simple_fit_dev") {
    throw new Error("E2E_API_DATABASE_URL must name a disposable end-to-end database");
  }
  return DATABASE_URL;
}

const sql = (query: string) =>
  execFileSync("psql", [disposableDatabase(), "-tAc", query], { encoding: "utf8" }).trim();

function emailedCode(address: string): string {
  const out = execFileSync("mix", ["e2e.email_code", address], {
    cwd: API_DIR,
    env: { ...process.env, MIX_ENV: "dev", DATABASE_URL: disposableDatabase() },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const code = out.split("\n").find((line) => /^\d{6}$/.test(line.trim()));
  if (!code) throw new Error("no code was emailed");
  return code.trim();
}

const ACCOUNT = "/en/app/onboarding/account";

async function signUp(page: Page, email: string) {
  sql("DELETE FROM auth_rate_limits");
  await page.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());
  await page.goto("/en/signup");
  await page.getByRole("link", { name: "Continue with Email" }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/en/signup/verify");
  await page.locator('[data-slot="code-input"]').pressSequentially(emailedCode(email));
  await page.waitForURL((url) => url.pathname === ACCOUNT);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test("a page load during an in-flight session restore keeps the session", async ({
  page,
  browserName,
}, testInfo) => {
  test.fail(
    browserName !== "firefox",
    "Release blocker: docs/investigations/session-refresh-navigation-race.md",
  );
  const email = `e2e-race-${testInfo.project.name.replace(/\W/g, "")}${Date.now().toString(36)}@example.com`;
  await signUp(page, email);
  const revoked = () =>
    Number(sql("SELECT count(*) FROM sessions WHERE revoked_reason = 'refresh_reuse'"));
  const before = revoked();

  // The next restore reaches the server, which rotates the refresh cookie; its
  // answer arrives only after the page has navigated away.
  let held = false;
  await page.route("**/api/auth/session/refresh", async (route) => {
    if (held) return route.continue();
    held = true;
    const response = await route.fetch();
    await new Promise((done) => setTimeout(done, 1500));
    await route.fulfill({ response }).catch(() => undefined);
  });
  void page.goto(ACCOUNT).catch(() => undefined);
  await expect.poll(() => held).toBe(true);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.goto(ACCOUNT).catch(() => undefined);
  await page.waitForURL((url) => url.pathname === ACCOUNT || url.pathname.startsWith("/en/login"));
  await page.waitForLoadState("networkidle");

  expect(revoked() - before).toBe(0);
  expect(new URL(page.url()).pathname).toBe(ACCOUNT);
});
