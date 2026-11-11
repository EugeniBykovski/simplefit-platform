import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test, type Browser, type CDPSession, type Page } from "@playwright/test";

/*
 * SF-122: account administration (AD7, AD8, AD9) on the production build against a real
 * simplefit-api and PostgreSQL (playwright.real-api.config.ts), Chrome only (virtual
 * security keys over CDP). The target account signs in on independent browser contexts
 * (its own real sessions); suspension, lifting and sign-out are checked in those
 * sessions and in the disposable database, never assumed from the operator's UI. SQL
 * only resets rate limits and reads results. Setup: e2e/real-api/README.md,
 * "Control Plane"; every run needs a freshly migrated disposable database.
 */

const API_URL = process.env.E2E_REAL_API_URL ?? "";
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";

test.skip(!API_URL, "needs a running API on a disposable database");
test.describe.configure({ mode: "serial" });

function disposableDatabase(): string {
  const name = new URL(DATABASE_URL).pathname.slice(1);
  if (!/e2e/.test(name) || name === "simple_fit_dev") {
    throw new Error("E2E_API_DATABASE_URL must name a disposable end-to-end database");
  }
  if (new URL(API_URL).port === "4000") throw new Error("never the development API on 4000");
  return DATABASE_URL;
}

const sql = (query: string) =>
  execFileSync("psql", [disposableDatabase(), "-Atqc", query], { encoding: "utf8" }).trim();
const n = (query: string) => Number(sql(query));

const mix = (args: string[]) =>
  execFileSync("mix", args, {
    cwd: API_DIR,
    env: { ...process.env, MIX_ENV: "dev", DATABASE_URL: disposableDatabase() },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

function emailedCode(address: string): string {
  const code = mix(["e2e.email_code", address])
    .split("\n")
    .find((line) => /^\d{6}$/.test(line.trim()));
  if (!code) throw new Error("no code was emailed");
  return code.trim();
}

const resetRateLimits = () => sql("DELETE FROM auth_rate_limits; DELETE FROM rate_limit_events");

function account(email: string, coach = false): string {
  const out = mix([
    "run",
    resolve("e2e/real-api/fixtures/control-plane-seed.exs"),
    "user",
    email,
    ...(coach ? ["coach"] : []),
  ]);
  const id = /USER ([0-9a-f-]{36})/.exec(out)?.[1];
  if (!id) throw new Error("no account was created");
  return id;
}

function bootstrap(userId: string, permissions: string[], outputDir: string) {
  const dir = join(outputDir, "ceremony");
  mkdirSync(dir, { recursive: true });
  const statement = join(dir, "statement.json");
  try {
    mix([
      "operators.dev_ceremony",
      "--user-id",
      userId,
      "--permissions",
      permissions.join(","),
      "--out",
      statement,
    ]);
    mix(["operators.ceremony", statement]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function securityKey(cdp: CDPSession): Promise<string> {
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "usb",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      defaultBackupEligibility: false,
      defaultBackupState: false,
    },
  });
  return authenticatorId;
}

async function signIn(page: Page, email: string, path: string) {
  resetRateLimits();
  await page.goto(`/en/admin/login?returnTo=${encodeURIComponent(path)}`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((url) => url.pathname.endsWith("/login/code"));
  await page.locator('[data-slot="code-input"]').pressSequentially(emailedCode(email));
}

const stamp = Date.now().toString(36);
const OPERATOR = `sf122-operator-${stamp}@e2e.example`;
const TARGET = `sf122-target-${stamp}@e2e.example`;
const PERMISSIONS = ["users.read", "users.reveal_email", "users.restrict", "users.sessions.revoke"];

const activeSessions = (userId: string) =>
  n(`SELECT count(*) FROM sessions WHERE user_id = '${userId}' AND revoked_at IS NULL`);

/** The target signs in with an emailed code in its own browser context, landing in the app. */
async function targetSession(browser: Browser, signedIn = true) {
  const context = await browser.newContext({ baseURL: "http://localhost:3100" });
  await context.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());
  const page = await context.newPage();
  resetRateLimits();
  await page.goto("/en/login");
  await page.locator('input[type="email"]').fill(TARGET);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((url) => url.pathname.endsWith("/login/code"));
  await page.locator('[data-slot="code-input"]').pressSequentially(emailedCode(TARGET));
  if (signedIn) await page.waitForURL((url) => !url.pathname.includes("/login"));
  return page;
}

async function pick(page: Page, combobox: RegExp, option: string) {
  await page.getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: option }).click();
}

async function act(page: Page, button: string, reason: string) {
  await page.getByRole("button", { name: button }).click();
  const box = page.getByRole("dialog");
  await pick(page, /Reason/, reason);
  await box.getByRole("button", { name: "Review" }).click();
  await box.getByRole("button", { name: "Confirm" }).click();
  await expect(box.getByText("Done. Recorded in the audit log.")).toBeVisible();
  await box.getByRole("button", { name: "Close" }).first().click();
}

test.use({ baseURL: "http://localhost:3100" });

test("SF-122 account administration against the real backend", async ({
  page,
  browser,
  browserName,
}, info) => {
  test.skip(
    browserName !== "chromium" || info.project.name !== "chromium-1440",
    "virtual authenticators are Chrome DevTools Protocol only; one desktop pass",
  );
  await page
    .context()
    .route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());
  const operatorId = account(OPERATOR);
  const targetId = account(TARGET);

  await test.step("E: the target itself can't use account administration", async () => {
    const own = await targetSession(browser);
    await own.goto(`/en/admin/users`);
    await expect(own.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await own.context().close();
  });

  bootstrap(operatorId, PERMISSIONS, info.outputDir);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");

  await test.step("A: search by exact email with a reason, open the account; both reads recorded", async () => {
    await signIn(page, OPERATOR, "/admin/users");
    const first = await securityKey(cdp);
    await page.getByRole("button", { name: "Register first key" }).click();
    await expect(page.getByRole("heading", { name: "Now your backup key" })).toBeVisible();
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: first });
    await securityKey(cdp);
    await page.getByRole("button", { name: "Register backup key" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Use security key" }).click();
    // The sign-in continuation brings the operator back to the search (the SF-120 first
    // visit is offered on the overview only).
    await page.waitForURL((url) => url.pathname === "/en/admin/users");

    await page.getByRole("textbox", { name: /Exact email or user ID/ }).fill(TARGET.toUpperCase());
    await pick(page, /Reason/, "Support request");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("link", { name: "E2E Operator" }).click();
    await page.waitForURL((url) => url.pathname === `/en/admin/users/${targetId}`);
    await expect(page.getByRole("region", { name: "Account and security" })).toContainText(
      TARGET.slice(0, 1) + "•••@e2e.example",
    );
    await expect(page.locator("body")).not.toContainText(TARGET);
    expect(
      n(
        `SELECT count(*) FROM operator_audit_events WHERE action IN ('user.searched', 'user.viewed') AND target_id = '${targetId}' AND reason_code = 'support_request'`,
      ),
    ).toBe(2);
  });

  const before = activeSessions(targetId);
  const laptop = await targetSession(browser);
  const phone = await targetSession(browser);
  expect(activeSessions(targetId)).toBe(before + 2);

  await test.step("B: suspend: both devices are signed out and no new sign-in is accepted", async () => {
    await page.reload();
    await act(page, "Suspend account", "Fraud");
    await expect(page.getByText(/Suspended since/)).toBeVisible();
    expect(activeSessions(targetId)).toBe(0);
    expect(
      sql(
        `SELECT reason_code FROM user_restrictions WHERE user_id = '${targetId}' AND lifted_at IS NULL`,
      ),
    ).toBe("fraud");

    for (const device of [laptop, phone]) {
      await device.reload();
      await device.waitForURL((url) => url.pathname.endsWith("/login"));
    }

    const again = await targetSession(browser, false);
    await expect(again.getByRole("alert").first()).toBeVisible();
    expect(activeSessions(targetId)).toBe(0);
    await again.context().close();
  });

  await test.step("C: lift: the old sessions stay ended; a new sign-in works", async () => {
    await act(page, "Lift suspension", "Issue resolved");
    await expect(page.getByText(/Suspended since/)).toHaveCount(0);
    await laptop.reload();
    await laptop.waitForURL((url) => url.pathname.endsWith("/login"));
    expect(activeSessions(targetId)).toBe(0);
    await phone.context().close();
  });

  await test.step("D: sign out everywhere ends a new session; the account stays active", async () => {
    const fresh = await targetSession(browser);
    expect(activeSessions(targetId)).toBe(1);
    await act(page, "Sign out everywhere", "Account compromise");
    expect(activeSessions(targetId)).toBe(0);
    await fresh.reload();
    await fresh.waitForURL((url) => url.pathname.endsWith("/login"));
    expect(sql(`SELECT status FROM user_account_states WHERE user_id = '${targetId}'`)).toBe(
      "active",
    );
    await fresh.context().close();
    await laptop.context().close();
  });

  await test.step("F: the operator's own account offers no action", async () => {
    await page.goto(`/en/admin/users/${operatorId}?reason=support_request`);
    await expect(page.getByText("This is your own account.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Suspend account" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out everywhere" })).toHaveCount(0);
  });

  await test.step("I: at 390 px reading works and high-risk actions are hidden", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/en/admin/users/${targetId}?reason=support_request`);
    await expect(page.getByRole("region", { name: "Account and security" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Suspend account" })).toBeHidden();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
