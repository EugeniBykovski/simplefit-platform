import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test, type Browser, type CDPSession, type Page } from "@playwright/test";

/*
 * SF-126: system health (AD17) on the production build against a real simplefit-api,
 * PostgreSQL and Oban (playwright.real-api.config.ts), Chrome only (virtual security
 * keys over CDP). Jobs are inserted through Oban by fixtures/operations-seed.exs with a
 * canary in their arguments, meta and error, in states the API never runs; the page
 * must show their real states and counts and never the canary. SQL only reads results
 * and revokes a grant (the client's answer is under test). Setup: e2e/real-api/README.md,
 * "Control Plane"; a freshly migrated disposable database.
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

function operatorAccount(email: string): string {
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

async function emailSignIn(page: Page, email: string, path: string) {
  resetRateLimits();
  await page.goto(path);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((url) => url.pathname.endsWith("/login/code"));
  await page.locator('[data-slot="code-input"]').pressSequentially(emailedCode(email));
}

async function otherSession(browser: Browser, email: string) {
  const context = await browser.newContext({ baseURL: "http://localhost:3100" });
  await context.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());
  const page = await context.newPage();
  await emailSignIn(page, email, "/en/login");
  await page.waitForURL((url) => !url.pathname.endsWith("/login/code"));
  return page;
}

const n = (query: string) => Number(sql(query));
const refocus = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));

const stamp = Date.now().toString(36);
const OPERATOR = `sf126-operator-${stamp}@e2e.example`;
const CANARY = `SF126-CANARY-${stamp}`;

test.use({ baseURL: "http://localhost:3100" });

test("SF-126 system health and jobs against the real backend", async ({
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
  const operatorId = operatorAccount(OPERATOR);
  const discarded = /DISCARDED (\d+)/.exec(
    mix(["run", resolve("e2e/real-api/fixtures/operations-seed.exs"), "jobs", stamp]),
  )?.[1];
  if (!discarded) throw new Error("no job was seeded");

  await test.step("E: someone who isn't an operator gets the not-found page", async () => {
    const own = await otherSession(browser, OPERATOR);
    await own.goto("/en/admin/integrations");
    await expect(own.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await own.context().close();
  });

  bootstrap(operatorId, ["system.health.read", "system.jobs.read"], info.outputDir);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");

  await test.step("A/B: measured checks, real queue counts and jobs; the canary never shows", async () => {
    await emailSignIn(
      page,
      OPERATOR,
      `/en/login?returnTo=${encodeURIComponent("/admin/integrations")}`,
    );
    await page.getByRole("button", { name: "Register keys" }).click();
    const first = await securityKey(cdp);
    await page.getByRole("button", { name: "Register first key" }).click();
    await expect(page.getByRole("heading", { name: "Now your backup key" })).toBeVisible();
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: first });
    await securityKey(cdp);
    await page.getByRole("button", { name: "Register backup key" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((url) => url.pathname === "/en/admin/integrations");

    await expect(page.locator('[data-check="database"]')).toHaveAttribute("data-status", "healthy");
    await expect(page.locator('[data-check="api"]')).toHaveAttribute("data-status", "healthy");
    await expect(page.locator('[data-check="storage"]')).toHaveAttribute(
      "data-status",
      "no_telemetry",
    );
    await expect(page.locator('[data-check="error_monitoring"]')).toHaveAttribute(
      "data-status",
      "no_telemetry",
    );
    await expect(page.locator('[data-check="email"]')).toHaveAttribute("data-status", "degraded");
    await expect(page.locator('[data-check="background_jobs"]')).toHaveAttribute(
      "data-status",
      "degraded",
    );

    const mailers = n(
      "SELECT count(*) FROM oban_jobs WHERE queue = 'mailers' AND state = 'discarded'",
    );
    await expect(page.locator('[data-queue="mailers"] td').nth(6)).toHaveText(String(mailers));
    expect(sql("SELECT max(version) FROM schema_migrations")).toBe(
      (await page.getByText(/applied · latest/).textContent())?.match(/latest (\d+)/)?.[1],
    );

    const row = page.locator(`[data-job="${discarded}"]`);
    await expect(row).toContainText("Email.DeliveryWorker");
    await expect(row).toContainText("Oban.PerformError");
    await expect(row).toContainText("5 of 5");
    await row.getByRole("button", { name: `#${discarded}` }).click();
    await expect(page.getByText(/no worker has an approved retry policy/)).toBeVisible();
    await expect(page.getByRole("button", { name: /retry/i })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(CANARY);
    expect(
      n(
        `SELECT count(*) FROM operator_audit_events WHERE action = 'jobs.listed' AND outcome = 'allowed'`,
      ),
    ).toBeGreaterThanOrEqual(1);
    expect(
      n(
        `SELECT count(*) FROM operator_audit_events WHERE action = 'job.viewed' AND outcome = 'allowed'`,
      ),
    ).toBe(1);
  });

  await test.step("J: at 390 px the page fits without page overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.locator('[data-check="database"]')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await test.step("G: job access revoked: the next focus hides the jobs, the backend refuses them", async () => {
    sql(
      `UPDATE operator_permission_grants SET revoked_at = now(), revoke_reason_code = 'e2e_revocation' WHERE permission = 'system.jobs.read' AND operator_id = (SELECT id FROM platform_operators WHERE user_id = '${operatorId}')`,
    );
    await refocus(page);
    await expect(page.getByRole("region", { name: "Background jobs" })).toHaveCount(0);
    await expect(page.getByText("The job list needs job access.")).toBeVisible();
    await expect(page.locator('[data-check="database"]')).toBeVisible();
  });

  await test.step("H: another person signs in on this browser: nothing of the page shows", async () => {
    await page.goto("/en/app");
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await page.waitForURL(/\/en\/login/);
    const other = `sf126-other-${stamp}@e2e.example`;
    operatorAccount(other);
    await emailSignIn(page, other, "/en/login");
    await page.waitForURL((url) => !url.pathname.endsWith("/login/code"));
    await page.goto("/en/admin/integrations");
    await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await expect(page.locator("[data-check]")).toHaveCount(0);
  });
});
