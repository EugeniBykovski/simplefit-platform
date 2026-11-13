import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test, type Browser, type CDPSession, type Page } from "@playwright/test";

/*
 * SF-157: the Control Plane email and password sign-in on the production build
 * against a real simplefit-api and PostgreSQL (playwright.real-api.config.ts).
 * Nothing in the browser is mocked: passwords are set through the real emailed
 * code, security keys are Chrome's virtual authenticators (CDP WebAuthn, not
 * backup-eligible), and outcomes are checked in the database.
 *
 * Setup as e2e/real-api/README.md, "Control Plane": a disposable database, the API
 * with SIMPLEFIT_DEV_WEBAUTHN_ORIGIN=http://localhost:3100 and CORS for it. The
 * operator is bootstrapped by the development ceremony on a fresh database.
 */

const API_URL = process.env.E2E_REAL_API_URL ?? "";
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";
const API_LOG = process.env.E2E_API_LOG ?? "";
const WEB = "http://localhost:3100";

test.skip(!API_URL, "needs a running API on a disposable database");
test.describe.configure({ mode: "serial" });
test.use({ baseURL: WEB });

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

function account(email: string): string {
  const out = mix(["run", resolve("e2e/real-api/fixtures/control-plane-seed.exs"), "user", email]);
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

/** Sets a password through the real flow: the page, the emailed code, the new password. */
async function setPassword(page: Page, email: string, password: string, returnTo = "/admin") {
  resetRateLimits();
  await page.goto(`/en/admin/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByRole("link", { name: /Forgot your password/ }).click();
  await page.waitForURL((url) => url.pathname === "/en/admin/login/password");
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(returnTo);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText(/we’ve emailed it a 6-digit code/)).toBeVisible();
  await page.getByLabel("Code from the email").fill(emailedCode(email));
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByText(/Your password is set/)).toBeVisible();
}

async function passwordSignIn(page: Page, email: string, password: string, returnTo = "/admin") {
  resetRateLimits();
  await page.goto(`/en/admin/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** What a refetch-on-focus sees: the tab becoming visible again. */
const refocus = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));

const stamp = Date.now().toString(36);
const OPERATOR = `sf157-operator-${stamp}@e2e.example`;
const OUTSIDER = `sf157-outsider-${stamp}@e2e.example`;
const TARGET = `sf157-target-${stamp}@e2e.example`;
const PASSWORD = `founder passphrase ${stamp}`;
const NEW_PASSWORD = `a brand new passphrase ${stamp}`;
const OUTSIDER_PASSWORD = `outsider passphrase ${stamp}`;

const operatorOf = (userId: string) =>
  sql(`SELECT status FROM platform_operators WHERE user_id = '${userId}'`);
const liveSessions = (userId: string) =>
  sql(`SELECT count(*) FROM sessions WHERE user_id = '${userId}' AND revoked_at IS NULL`);

async function withKeys(browser: Browser) {
  const context = await browser.newContext({ baseURL: WEB });
  await context.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  return { context, page, cdp };
}

test("SF-157 Control Plane email and password sign-in: entry, refusals, isolation, recovery and assurance", async ({
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
  const outsiderId = account(OUTSIDER);
  account(TARGET);
  bootstrap(operatorId, ["operators.read", "operators.manage", "audit.read"], info.outputDir);
  expect(operatorOf(operatorId)).toBe("pending_enrollment");
  const operatorsBefore = sql("SELECT count(*) FROM platform_operators");
  const grantsBefore = sql("SELECT count(*) FROM operator_permission_grants");

  await test.step("setup: the password is set only through the emailed code", async () => {
    expect(sql(`SELECT count(*) FROM password_credentials WHERE user_id = '${operatorId}'`)).toBe(
      "0",
    );
    await setPassword(page, OPERATOR, PASSWORD);
    expect(
      sql(
        `SELECT password_hash LIKE '$argon2id$%' FROM password_credentials WHERE user_id = '${operatorId}'`,
      ),
    ).toBe("t");
    expect(sql(`SELECT event FROM account_security_events WHERE user_id = '${operatorId}'`)).toBe(
      "password_set",
    );
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/en/admin/login");
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/admin");
  });

  await test.step("B: wrong password and unknown address answer alike; repeated attempts are throttled", async () => {
    await passwordSignIn(page, OPERATOR, "not the password at all");
    const alert = page.locator("main form").getByRole("alert");
    await expect(alert).toHaveText(
      "That email address and password don’t match. Check both and try again.",
    );
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    await passwordSignIn(page, `nobody-${stamp}@e2e.example`, PASSWORD);
    await expect(alert).toHaveText(
      "That email address and password don’t match. Check both and try again.",
    );
    // Five wrong answers for one address in a minute; the sixth waits, even with the right one.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await page.getByLabel("Email").fill(OPERATOR);
      await page.getByLabel("Password", { exact: true }).fill(`wrong ${attempt} attempt`);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(alert).toBeVisible();
    }
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(alert).toHaveText("Too many attempts. Wait a moment, then try again.");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(liveSessions(operatorId)).toBe("0");
  });

  await test.step("A: an operator signs in with email and password and enters the Control Plane without keys", async () => {
    await passwordSignIn(page, OPERATOR, PASSWORD);
    await page.waitForURL(
      (url) => url.pathname.startsWith("/en/admin") && !url.pathname.startsWith("/en/admin/login"),
    );
    await expect(page.getByText("Signed in · actions ask for your key").first()).toBeVisible();
    await expect(page.getByText(/security keys aren’t registered yet/)).toBeVisible();
    // Signing in provisioned nothing and granted nothing.
    expect(sql("SELECT count(*) FROM platform_operators")).toBe(operatorsBefore);
    expect(sql("SELECT count(*) FROM operator_permission_grants")).toBe(grantsBefore);
    expect(operatorOf(operatorId)).toBe("pending_enrollment");
    expect(liveSessions(operatorId)).toBe("1");

    await page.goto("/en/admin/staff");
    await expect(page.locator("[data-operator-row]")).toHaveCount(1);
    await page.reload();
    await expect(page.locator("[data-operator-row]")).toHaveCount(1);
    await expect(page.getByText(/security keys aren’t registered yet/)).toBeVisible();
  });

  await test.step("G: a privileged action needs registered keys, then a fresh key check, then confirmation", async () => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("WebAuthn.enable");

    const addOperator = async () => {
      await page.getByRole("button", { name: "Add an operator" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel(/Their account/).fill(TARGET);
      await dialog.getByLabel("audit.read").click();
      await dialog.getByRole("combobox", { name: /Reason/ }).click();
      await page.getByRole("option", { name: "Access request approved" }).click();
      await dialog.getByRole("button", { name: "Add operator" }).click();
      return dialog;
    };

    // Pending: the backend answers enrollment_required; registration replaces the page.
    await addOperator();
    await expect(page.getByRole("heading", { name: "Register two security keys" })).toBeVisible();
    expect(sql("SELECT count(*) FROM platform_operators")).toBe(operatorsBefore);
    expect(
      sql(
        `SELECT count(*) FROM operator_audit_events WHERE action = 'operator.access_refused' AND reason_code = 'enrollment_required'`,
      ),
    ).not.toBe("0");

    const first = await securityKey(cdp);
    await page.getByRole("button", { name: "Register first key" }).click();
    await expect(page.getByRole("heading", { name: "Now your backup key" })).toBeVisible();
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: first });
    await securityKey(cdp);
    await page.getByRole("button", { name: "Register backup key" }).click();
    await expect(page.getByRole("heading", { name: "Your keys are registered" })).toBeVisible();
    expect(operatorOf(operatorId)).toBe("active");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("[data-operator-row]")).toHaveCount(1);
    await expect(page.getByText(/security keys aren’t registered yet/)).toHaveCount(0);

    // Active without a key check: the dialog asks for the key, then the action runs once.
    expect(
      sql(
        `SELECT count(*) FROM operator_step_ups s JOIN platform_operators o ON o.id = s.operator_id WHERE o.user_id = '${operatorId}' AND s.revoked_at IS NULL`,
      ),
    ).toBe("0");
    const dialog = await addOperator();
    await dialog.getByRole("button", { name: "Use security key" }).click();
    await expect(dialog.getByText(/They hold nothing usable/)).toBeVisible();
    expect(sql("SELECT count(*) FROM platform_operators")).toBe(
      String(Number(operatorsBefore) + 1),
    );
    expect(
      sql(
        `SELECT count(*) FROM operator_audit_events WHERE action = 'operator.provisioned' AND outcome = 'allowed'`,
      ),
    ).toBe("1");
    await dialog.getByRole("button", { name: "Close" }).last().click();
  });

  await test.step("E: sign out, then an ordinary account in the same browser sees nothing of the operator", async () => {
    await page.goto("/en/app");
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await page.waitForURL(/\/en\/login/);
    expect(liveSessions(operatorId)).toBe("0");

    // C: an ordinary account authenticates with its own password, and the Control Plane stays closed.
    await setPassword(page, OUTSIDER, OUTSIDER_PASSWORD);
    await passwordSignIn(page, OUTSIDER, OUTSIDER_PASSWORD);
    await page.waitForURL((url) => url.pathname === "/en/admin");
    await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await expect(page.getByText("Exit control plane")).toHaveCount(0);
    await expect(page.locator("[data-operator-row]")).toHaveCount(0);
    await page.goto("/en/admin/staff");
    await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    expect(sql(`SELECT count(*) FROM platform_operators WHERE user_id = '${outsiderId}'`)).toBe(
      "0",
    );
  });

  await test.step("F: a reset with the emailed code signs out everywhere; the old password stops working", async () => {
    const other = await withKeys(browser);
    await passwordSignIn(other.page, OPERATOR, PASSWORD, "/admin/staff");
    await other.page.waitForURL((url) => url.pathname === "/en/admin/staff");
    await expect(other.page.locator("[data-operator-row]")).toHaveCount(2);
    expect(liveSessions(operatorId)).toBe("1");

    await page.context().clearCookies();
    await setPassword(page, OPERATOR, NEW_PASSWORD);
    expect(liveSessions(operatorId)).toBe("0");
    expect(
      sql(
        `SELECT count(*) FROM sessions WHERE user_id = '${operatorId}' AND revoked_reason = 'password_changed'`,
      ),
    ).toBe("1");
    // The other browser's session is gone: its next read sends it to sign in.
    await other.page.reload();
    await other.page.waitForURL(/\/login/);

    await passwordSignIn(page, OPERATOR, PASSWORD);
    await expect(page.locator("main form").getByRole("alert")).toHaveText(
      "That email address and password don’t match. Check both and try again.",
    );
    await passwordSignIn(page, OPERATOR, NEW_PASSWORD);
    await page.waitForURL(
      (url) => url.pathname.startsWith("/en/admin") && !url.pathname.startsWith("/en/admin/login"),
    );
    await expect(page.getByText("Exit control plane")).toBeVisible();
    await other.context.close();
  });

  await test.step("D: revoked meanwhile, the next read closes the Control Plane and the API refuses", async () => {
    await page.goto("/en/admin/staff");
    await expect(page.locator("[data-operator-row]")).toHaveCount(2);
    sql(
      `UPDATE platform_operators SET status = 'revoked', revoked_at = now() WHERE user_id = '${operatorId}'`,
    );
    await refocus(page);
    await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await expect(page.locator("[data-operator-row]")).toHaveCount(0);
    // A fresh password sign-in changes nothing.
    await page.context().clearCookies();
    await passwordSignIn(page, OPERATOR, NEW_PASSWORD);
    await page.waitForURL((url) => url.pathname === "/en/admin");
    await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
  });

  await test.step("H: the email-code sign-in stays one link away and still works", async () => {
    await page.context().clearCookies();
    resetRateLimits();
    await page.goto(`/en/admin/login?returnTo=${encodeURIComponent("/app")}`);
    await page.getByRole("link", { name: "sign in another way" }).click();
    await page.waitForURL((url) => url.pathname === "/en/login");
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/app");
    await page.locator('input[type="email"]').fill(OUTSIDER);
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForURL((url) => url.pathname.endsWith("/login/code"));
    await page.locator('[data-slot="code-input"]').pressSequentially(emailedCode(OUTSIDER));
    await page.waitForURL((url) => !url.pathname.includes("/login"));
    expect(liveSessions(outsiderId)).not.toBe("0");
  });

  await test.step("no password, hash or code reaches the API log", async () => {
    test.skip(!API_LOG, "E2E_API_LOG not set");
    const log = readFileSync(API_LOG, "utf8");
    for (const secret of [PASSWORD, NEW_PASSWORD, OUTSIDER_PASSWORD, "$argon2id$"]) {
      expect(log.includes(secret), `the API log holds ${secret.slice(0, 6)}…`).toBe(false);
    }
  });
});

test("I: the sign-in works by keyboard at every project width, without overflow", async ({
  page,
}) => {
  const email = `sf157-keyboard-${stamp}-${test.info().project.name}@e2e.example`;
  account(email);
  await setPassword(page, email, PASSWORD, "/app");
  resetRateLimits();
  await page.goto(`/en/admin/login?returnTo=${encodeURIComponent("/app")}`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByLabel("Email").focus();
  await page.keyboard.type(email);
  await page.keyboard.press("Tab");
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press("Enter");
  await page.waitForURL((url) => url.pathname.startsWith("/en/app"));
});
