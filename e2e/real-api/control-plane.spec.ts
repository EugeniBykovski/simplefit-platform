import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test, type CDPSession, type Page } from "@playwright/test";

/*
 * SF-120: the Control Plane entry (AD0) and first visit (ARW1) on the production build
 * against a real simplefit-api and PostgreSQL (playwright.real-api.config.ts). Nothing
 * in the browser is mocked: security keys are Chrome's virtual authenticators (CDP
 * WebAuthn, CTAP2 over USB, user verification, not backup-eligible), and the API
 * verifies every ceremony itself (origin http://localhost:3100, rpId localhost).
 *
 * Setup (see e2e/real-api/README.md, "Control Plane"): the API runs with
 * SIMPLEFIT_DEV_WEBAUTHN_ORIGIN=http://localhost:3100 and CORS for that origin, on a
 * disposable database. Accounts come from fixtures/control-plane-seed.exs; the
 * operator is bootstrapped by the development ceremony (`mix operators.dev_ceremony`
 * + `mix operators.ceremony`, recorded as local_development_ceremony). Outcomes are
 * checked in the database, never assumed from the UI.
 *
 * The ceremony bootstraps the first operator of a database only (`operator_exists`
 * otherwise), so every run needs a freshly migrated disposable database.
 *
 * Revocation is applied directly in the disposable database: what's under test is
 * the web client's answer to the backend's 404 (the HTTP revocation itself is covered
 * by simplefit-api's own tests).
 */

const API_URL = process.env.E2E_REAL_API_URL ?? "";
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";
const WEB = "http://localhost:3100";

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

/** Bootstraps `userId` as a pending operator with `permissions` (development ceremony). */
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

/** A security key: a virtual CTAP2 USB authenticator with user verification. */
async function securityKey(cdp: CDPSession, backupEligible = false): Promise<string> {
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "usb",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      defaultBackupEligibility: backupEligible,
      defaultBackupState: backupEligible,
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

/** What a refetch-on-focus sees: the tab becoming visible again (TanStack Query listens on window). */
const refocus = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));

const stamp = Date.now().toString(36);
const OPERATOR = `sf120-operator-${stamp}@e2e.example`;
const OUTSIDER = `sf120-outsider-${stamp}@e2e.example`;

test.use({ baseURL: WEB });

test("SF-120 Control Plane entry, first visit, exit, expiry, revocation and account switch", async ({
  page,
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
  expect(operatorId).not.toBe(outsiderId);

  await test.step("A: an account that isn't an operator gets the one unavailable answer", async () => {
    await signIn(page, OUTSIDER, "/admin");
    await page.waitForURL((url) => url.pathname === "/en/admin");
    await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await expect(page.getByText("Exit control plane")).toHaveCount(0);
    await page.context().clearCookies();
  });

  bootstrap(operatorId, ["audit.read", "operators.read"], info.outputDir);
  expect(sql(`SELECT status FROM platform_operators WHERE user_id = '${operatorId}'`)).toBe(
    "pending_enrollment",
  );

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");

  await test.step("B: a pending operator enrols two hardware keys; a synced passkey is refused", async () => {
    await signIn(page, OPERATOR, "/admin");
    await page.waitForURL((url) => url.pathname === "/en/admin");
    await expect(page.getByRole("heading", { name: "Register two security keys" })).toBeVisible();

    const synced = await securityKey(cdp, true);
    await page.getByRole("button", { name: "Register first key" }).click();
    await expect(page.getByText(/can’t be used here/).first()).toBeVisible();
    expect(
      sql(
        `SELECT count(*) FROM operator_credentials c JOIN platform_operators o ON o.id = c.operator_id WHERE o.user_id = '${operatorId}'`,
      ),
    ).toBe("0");
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: synced });

    const first = await securityKey(cdp);
    await page.getByRole("button", { name: "Register first key" }).click();
    await expect(page.getByRole("heading", { name: "Now your backup key" })).toBeVisible();
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: first });

    await securityKey(cdp);
    await page.getByRole("button", { name: "Register backup key" }).click();
    await expect(page.getByRole("heading", { name: "Your keys are registered" })).toBeVisible();
    expect(sql(`SELECT status FROM platform_operators WHERE user_id = '${operatorId}'`)).toBe(
      "active",
    );
    expect(
      sql(
        `SELECT count(*) FROM operator_credentials c JOIN platform_operators o ON o.id = c.operator_id WHERE o.user_id = '${operatorId}' AND c.revoked_at IS NULL AND NOT c.backup_eligible`,
      ),
    ).toBe("2");
  });

  await test.step("C: the key check opens the Control Plane, and the overview forwards to ARW1", async () => {
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Use your security key" })).toBeVisible();
    await page.getByRole("button", { name: "Use security key" }).click();
    await page.waitForURL((url) => url.pathname === "/en/admin/welcome");
    await expect(page.getByRole("heading", { name: "Welcome to the Control Plane" })).toBeVisible();
    await expect(page.getByText(/Key checked · \d+ min left/).first()).toBeVisible();
    expect(
      sql(
        `SELECT count(*) FROM operator_step_ups s JOIN platform_operators o ON o.id = s.operator_id WHERE o.user_id = '${operatorId}' AND s.revoked_at IS NULL AND s.expires_at > now()`,
      ),
    ).toBe("1");
    const granted = async (row: string) =>
      page.locator(`[data-access-row=${row}]`).getAttribute("data-granted");
    expect(await granted("audit")).toBe("true");
    expect(await granted("operators")).toBe("true");
    expect(await granted("sponsorApplications")).toBe("false");
    expect(await granted("sponsorOrganizations")).toBe("false");
    const nav = page.locator("aside nav");
    await expect(nav.getByText("Audit log")).toBeVisible();
    await expect(nav.getByText("Internal access")).toBeVisible();
    await expect(nav.getByText("Sponsors")).toHaveCount(0);
  });

  await test.step("D: the tour visits three real targets; Finish is recorded once, account-wide", async () => {
    await page.getByRole("button", { name: "Take the tour" }).click();
    const tour = page.getByRole("dialog");
    await expect(tour.getByText("Tour · 1 of 3").first()).toBeVisible();
    await expect(tour).toHaveAttribute("data-tour-layout", "placed");
    await expect(page.locator("[data-tour-spotlight=welcome]")).toBeVisible();
    await tour.getByRole("button", { name: "Next" }).click();
    await expect(page.locator("[data-tour-spotlight=sensitive]")).toBeVisible();
    await tour.getByRole("button", { name: "Next" }).click();
    await expect(page.locator("[data-tour-spotlight=me]")).toBeVisible();
    expect(sql(`SELECT count(*) FROM first_run_outcomes WHERE user_id = '${operatorId}'`)).toBe(
      "0",
    );
    await tour.getByRole("button", { name: "Finish" }).click();
    await expect(tour.getByRole("heading", { name: "You’re ready" })).toBeVisible();
    expect(
      sql(
        `SELECT outcome FROM first_run_outcomes WHERE user_id = '${operatorId}' AND experience = 'control_plane_web_tour'`,
      ),
    ).toBe("completed");
    await tour.getByRole("button", { name: "Go to overview" }).click();
    await page.waitForURL((url) => url.pathname === "/en/admin");
    await page.reload();
    await expect(page.getByText(/Key checked/).first()).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/en/admin");
    // Granted, unchanged by the tour.
    expect(
      sql(
        `SELECT count(*) FROM operator_permission_grants g JOIN platform_operators o ON o.id = g.operator_id WHERE o.user_id = '${operatorId}' AND g.revoked_at IS NULL`,
      ),
    ).toBe("2");
  });

  await test.step("E: Exit control plane ends the key check on the backend", async () => {
    await page.getByRole("button", { name: "Exit control plane" }).click();
    await expect(page.getByRole("heading", { name: "Use your security key" })).toBeVisible();
    expect(
      sql(
        `SELECT count(*) FROM operator_step_ups s JOIN platform_operators o ON o.id = s.operator_id WHERE o.user_id = '${operatorId}' AND s.revoked_at IS NULL AND s.expires_at > now()`,
      ),
    ).toBe("0");
  });

  await test.step("F: a key check that lapses asks to confirm again", async () => {
    await page.getByRole("button", { name: "Use security key" }).click();
    await expect(page.getByText(/Key checked/).first()).toBeVisible();
    sql(
      `UPDATE operator_step_ups SET verified_at = now() - interval '31 minutes', expires_at = now() - interval '1 second' WHERE operator_id = (SELECT id FROM platform_operators WHERE user_id = '${operatorId}') AND revoked_at IS NULL`,
    );
    await refocus(page);
    await expect(page.getByRole("heading", { name: "Confirm it’s you again" })).toBeVisible();
    await page.getByRole("button", { name: "Use security key" }).click();
    await expect(page.getByText(/Key checked/).first()).toBeVisible();
  });

  await test.step("G: revoked meanwhile, the next read closes the Control Plane", async () => {
    sql(
      `UPDATE platform_operators SET status = 'revoked', revoked_at = now() WHERE user_id = '${operatorId}'`,
    );
    await refocus(page);
    await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await expect(page.getByText("Exit control plane")).toHaveCount(0);
    await expect(page.getByText("Welcome to the Control Plane")).toHaveCount(0);
  });

  await test.step("H: another account in the same browser sees nothing of the operator", async () => {
    await page.context().clearCookies();
    await signIn(page, OUTSIDER, "/admin");
    await page.waitForURL((url) => url.pathname === "/en/admin");
    await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await expect(page.getByText(/Key checked/)).toHaveCount(0);
  });
});
