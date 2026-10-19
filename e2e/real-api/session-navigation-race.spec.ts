import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { expect, type Page, test } from "@playwright/test";

import { loseNextRefreshResponse } from "./lost-response";

/*
 * SF-75 regression (found in SF-54): a full page load that starts after the
 * API rotated the refresh cookie but before the browser received the new
 * cookie must keep the session. The answer to the restore's refresh is held
 * by a local proxy until the page has navigated away, so the browser really
 * loses that Set-Cookie and the next page presents the consumed cookie: the
 * API recovers the lost response (ADR 0010, "Lost-response recovery") instead
 * of revoking the session as reuse.
 *
 * The spec also proves the reproduction is real: the API must record exactly
 * one recovery (a superseded, never-presented token). If a browser applied the
 * held cookie after all, there would be no recovery and the test fails.
 * Root cause and evidence: docs/investigations/session-refresh-navigation-race.md.
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

const sessionOf = (email: string) =>
  sql(`SELECT coalesce(s.revoked_reason, 'active') || ':' ||
         (SELECT count(*) FROM session_refresh_tokens t
           WHERE t.session_id = s.id AND t.superseded_at IS NOT NULL)
       FROM sessions s JOIN identities i ON i.user_id = s.user_id
       WHERE i.provider = 'email' AND i.provider_subject = '${email}'`);

test("a page load during an in-flight session restore keeps the session", async ({
  page,
}, testInfo) => {
  const email = `e2e-race-${testInfo.project.name.replace(/\W/g, "")}${Date.now().toString(36)}@example.com`;
  await signUp(page, email);
  expect(sessionOf(email)).toBe("active:0");

  // The next restore reaches the API, which rotates the refresh cookie; its
  // answer never reaches the page, which navigates away first.
  const lost = await loseNextRefreshResponse(page, API_URL ?? "");
  void page.goto(ACCOUNT).catch(() => undefined);
  await lost.committed;
  await page.goto(ACCOUNT).catch(() => undefined);
  await page.waitForURL((url) => url.pathname === ACCOUNT || url.pathname.startsWith("/en/login"));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await lost.close();

  expect(lost.outcome()).toBe("lost");
  // One lost response, recovered: the session is active and one unused token
  // was superseded; nothing was treated as reuse.
  expect(sessionOf(email)).toBe("active:1");
  expect(new URL(page.url()).pathname).toBe(ACCOUNT);

  // The recovered cookie keeps working on the next full load.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(new URL(page.url()).pathname).toBe(ACCOUNT);
  expect(sessionOf(email)).toBe("active:1");
});

const revokedFor = (email: string, reason: string) =>
  Number(
    sql(`SELECT count(*) FROM sessions s JOIN identities i ON i.user_id = s.user_id
         WHERE i.provider = 'email' AND i.provider_subject = '${email}'
           AND s.revoked_reason = '${reason}'`),
  );

const address = (testInfo: { project: { name: string } }, tag: string) =>
  `e2e-${tag}-${testInfo.project.name.replace(/\W/g, "")}${Date.now().toString(36)}@example.com`;

async function onAccount(page: Page) {
  await page.waitForURL((url) => url.pathname === ACCOUNT || url.pathname.startsWith("/en/login"));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  return new URL(page.url()).pathname;
}

test("ten rapid full reloads keep the session", async ({ page }, testInfo) => {
  const email = address(testInfo, "reloads");
  await signUp(page, email);
  // Each reload starts the moment the previous page's restore has sent its
  // refresh: the window in which that refresh's answer can be lost.
  for (let i = 0; i < 10; i += 1) {
    const refreshing = page.waitForRequest("**/api/auth/session/refresh");
    void page.reload().catch(() => undefined);
    await refreshing;
  }
  await page.goto(ACCOUNT).catch(() => undefined);
  expect(await onAccount(page)).toBe(ACCOUNT);
  expect(revokedFor(email, "refresh_reuse")).toBe(0);
});

test("consecutive document navigations and Back/Forward keep the session", async ({
  page,
}, testInfo) => {
  const email = address(testInfo, "history");
  await signUp(page, email);
  // Each document is replaced once its HTML is parsed, while its session
  // restore (which starts after hydration) is still pending or in flight.
  // Waiting for the parse, not just the commit, keeps clear of a WebKit stall
  // when a navigation interrupts a document still loading its scripts.
  const step = { waitUntil: "domcontentloaded", timeout: 15_000 } as const;
  await page.goto("/en/app/home", step).catch(() => undefined);
  await page.goto(ACCOUNT, step).catch(() => undefined);
  await page.goto("/en/app/coaches", step).catch(() => undefined);
  await page.goBack(step).catch(() => undefined);
  await page.goForward(step).catch(() => undefined);
  await page.goto(ACCOUNT).catch(() => undefined);
  expect(await onAccount(page)).toBe(ACCOUNT);
  expect(revokedFor(email, "refresh_reuse")).toBe(0);
});

test("two tabs restoring at once share one session", async ({ context, page }, testInfo) => {
  const email = address(testInfo, "tabs");
  await signUp(page, email);
  const other = await context.newPage();
  await Promise.all([page.reload(), other.goto(ACCOUNT)]);
  expect(await onAccount(page)).toBe(ACCOUNT);
  expect(await onAccount(other)).toBe(ACCOUNT);
  expect(revokedFor(email, "refresh_reuse")).toBe(0);
});

test("a sign-out during a lost refresh is final, and the next user is untouched", async ({
  context,
  page,
}, testInfo) => {
  const first = address(testInfo, "first");
  await signUp(page, first);
  const other = await context.newPage();
  await other.goto(ACCOUNT);
  await onAccount(other);

  // Tab A's restore reaches the API and rotates; A is then closed before the
  // answer arrives (the answer is lost). Tab B signs out meanwhile.
  const lost = await loseNextRefreshResponse(page, API_URL ?? "");
  void page.reload().catch(() => undefined);
  await lost.committed;
  await page.close();
  await lost.close();
  await other.getByRole("button", { name: "Sign out" }).first().click();
  await other.waitForURL(/\/en\/login/);
  // The sign-out ends the session in the browser first, then asks the API.
  await expect.poll(() => revokedFor(first, "logout")).toBe(1);
  expect(revokedFor(first, "refresh_reuse")).toBe(0);

  // Another user signs in in the same browser: only their session exists
  // there, and the signed-out session can never come back.
  const second = address(testInfo, "second");
  await signUp(other, second);
  await other.reload();
  expect(await onAccount(other)).toBe(ACCOUNT);
  expect(revokedFor(second, "logout") + revokedFor(second, "refresh_reuse")).toBe(0);
  expect(revokedFor(first, "logout")).toBe(1);
});

test("a temporary network failure during the restore does not sign out", async ({
  page,
}, testInfo) => {
  const email = address(testInfo, "offline");
  await signUp(page, email);
  // The refresh never reaches the API (connection failure).
  await page.route("**/api/auth/session/refresh", (route) => route.abort("internetdisconnected"));
  await page.reload();
  await page.waitForLoadState("networkidle");
  expect(new URL(page.url()).pathname).toBe(ACCOUNT);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.reload();
  expect(await onAccount(page)).toBe(ACCOUNT);
  expect(revokedFor(email, "refresh_reuse") + revokedFor(email, "logout")).toBe(0);
});

test("a replay of a copied cookie from an independent client is still detected", async ({
  context,
  page,
}, testInfo) => {
  const email = address(testInfo, "replay");
  await signUp(page, email);
  // An independent HTTP client with its own jar: a copy of the browser's
  // current refresh cookie (never printed).
  const copied = (await context.cookies(`${API_URL}/api/auth/session/refresh`)).find((cookie) =>
    cookie.name.endsWith("sf_refresh"),
  );
  if (!copied) throw new Error("no refresh cookie");
  const thief = (cookie: string) =>
    fetch(`${API_URL}/api/auth/session/refresh`, {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3100", "x-simplefit-csrf": "1", cookie },
    });

  // The owner restores twice: its successor was used, the copy is stale.
  await page.reload();
  await onAccount(page);
  await page.reload();
  await onAccount(page);
  expect((await thief(`${copied.name}=${copied.value}`)).status).toBe(401);
  expect(revokedFor(email, "refresh_reuse")).toBe(1);

  // Revocation is effective for the owner too: the next load asks to sign in.
  await page.reload();
  await page.waitForURL(/\/en\/login/);
});
