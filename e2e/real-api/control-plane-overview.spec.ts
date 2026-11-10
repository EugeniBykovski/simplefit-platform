import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test, type CDPSession, type Page } from "@playwright/test";

/*
 * SF-121: the Control Plane overview (AD1) on the production build against a real
 * simplefit-api and PostgreSQL (playwright.real-api.config.ts), Chrome only (virtual
 * security keys over CDP, as SF-120). Every number the page shows is checked against
 * the disposable database with SQL written from the metric catalog
 * (simplefit-api docs/architecture/admin-overview-metrics.md), never against the UI
 * or the API alone. SQL otherwise only revokes a grant or the operator (the client's
 * answer is under test) and resets rate limits. Setup: e2e/real-api/README.md,
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

const refocus = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));

/** The value the page shows for a metric (`data-value`), or null when it shows none. */
const shown = async (page: Page, id: string) => {
  const value = await page.locator(`[data-overview-metric=${id}]`).getAttribute("data-value");
  return value === null ? null : Number(value);
};

/** The catalog's definitions, as SQL against the database. */
const expected = {
  accounts: () =>
    n("SELECT count(*) FROM account_profiles WHERE registration_completed_at IS NOT NULL"),
  fighters: () =>
    n("SELECT count(*) FROM fighter_profiles WHERE onboarding_completed_at IS NOT NULL"),
  coaches: () => n("SELECT count(*) FROM coach_profiles WHERE onboarding_completed_at IS NOT NULL"),
  gyms: () => n("SELECT count(*) FROM gyms WHERE setup_status = 'completed'"),
  orgs: () =>
    n(
      "SELECT count(*) FROM sponsor_organizations WHERE status = 'active' AND provisioning_source = 'sponsor_application'",
    ),
  operators: () => n("SELECT count(*) FROM platform_operators WHERE status = 'active'"),
  waiting: () =>
    n("SELECT count(*) FROM sponsor_applications WHERE status IN ('submitted', 'under_review')"),
  registeredIn: (seconds: number) =>
    n(
      `SELECT count(*) FROM account_profiles WHERE registration_completed_at >= now() - interval '${seconds} seconds'`,
    ),
  jobsWaiting: () =>
    n("SELECT count(*) FROM oban_jobs WHERE state IN ('available', 'scheduled', 'retryable')"),
};

const stamp = Date.now().toString(36);
const OPERATOR = `sf121-operator-${stamp}@e2e.example`;
const OUTSIDER = `sf121-outsider-${stamp}@e2e.example`;
const BOTH = `sf121-both-${stamp}@e2e.example`;
const PERMISSIONS = [
  "platform.dashboard.read",
  "operators.read",
  "sponsors.applications.read",
  "system.health.read",
];

test.use({ baseURL: "http://localhost:3100" });

test("SF-121 Control Plane overview against the real backend", async ({
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
  const overviewCalls: { status: number; period: string | null }[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname === "/api/v1/admin/overview") {
      overviewCalls.push({ status: response.status(), period: url.searchParams.get("period") });
    }
  });

  const operatorId = account(OPERATOR);
  account(OUTSIDER);

  await test.step("B: an account that isn't an operator gets no overview, only the unavailable answer", async () => {
    await signIn(page, OUTSIDER, "/admin");
    await page.waitForURL((url) => url.pathname === "/en/admin");
    await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await expect(page.locator("[data-overview-metric]")).toHaveCount(0);
    expect(overviewCalls).toEqual([]);
    await page.context().clearCookies();
  });

  bootstrap(operatorId, PERMISSIONS, info.outputDir);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");

  await test.step("A: an operator enrols, checks the key and sees the backend's counts", async () => {
    await signIn(page, OPERATOR, "/admin");
    await page.waitForURL((url) => url.pathname === "/en/admin");
    const first = await securityKey(cdp);
    await page.getByRole("button", { name: "Register first key" }).click();
    await expect(page.getByRole("heading", { name: "Now your backup key" })).toBeVisible();
    // A different physical key: the first one leaves.
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: first });
    await securityKey(cdp);
    await page.getByRole("button", { name: "Register backup key" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Use security key" }).click();
    // SF-120: the first visit comes first; skipping it lands on the overview.
    await page.waitForURL((url) => url.pathname === "/en/admin/welcome");
    await page.getByRole("button", { name: "Skip" }).click();
    await page.waitForURL((url) => url.pathname === "/en/admin");
    await expect(page.getByRole("heading", { name: "Population" })).toBeVisible();

    expect(await shown(page, "accounts")).toBe(expected.accounts());
    expect(await shown(page, "fighter_profiles")).toBe(expected.fighters());
    expect(await shown(page, "coach_profiles")).toBe(expected.coaches());
    expect(await shown(page, "gyms")).toBe(expected.gyms());
    expect(await shown(page, "sponsor_organizations")).toBe(expected.orgs());
    expect(await shown(page, "operators")).toBe(expected.operators());
    expect(await shown(page, "sponsor_applications_waiting")).toBe(expected.waiting());
    // Real zeros are zeros, not blanks.
    expect(await shown(page, "gyms")).toBe(0);
    await expect(page.locator("[data-overview-metric=gym_verifications_waiting]")).toHaveAttribute(
      "data-state",
      "unavailable",
    );
    expect(overviewCalls.at(-1)).toEqual({ status: 200, period: "7d" });
  });

  await test.step("H: health shows real signals only", async () => {
    const health = page.locator("[data-overview-card=health]");
    await expect(health.locator("[data-overview-check=database]")).toHaveAttribute(
      "data-status",
      "healthy",
    );
    await expect(health.locator("[data-overview-check=payments_webhooks]")).toHaveAttribute(
      "data-status",
      "unknown",
    );
    await expect(health.locator("[data-overview-check=email_provider]")).toHaveAttribute(
      "data-status",
      "no_telemetry",
    );
    await expect(health.locator("[data-overview-check=background_jobs]")).toContainText(
      `${expected.jobsWaiting()} waiting`,
    );
  });

  await test.step("C: one person who is a fighter and a coach counts once as an account", async () => {
    const before = {
      accounts: await shown(page, "accounts"),
      fighters: await shown(page, "fighter_profiles"),
      coaches: await shown(page, "coach_profiles"),
    };
    account(BOTH, true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Population" })).toBeVisible();
    expect(await shown(page, "accounts")).toBe((before.accounts ?? 0) + 1);
    expect(await shown(page, "fighter_profiles")).toBe((before.fighters ?? 0) + 1);
    expect(await shown(page, "coach_profiles")).toBe((before.coaches ?? 0) + 1);
    expect(await shown(page, "accounts")).toBe(expected.accounts());
  });

  await test.step("E: the period asks the backend and labels counts with the period answered", async () => {
    await page.getByRole("button", { name: "24 hours" }).click();
    await expect(page.locator("[data-overview-metric=accounts]")).toContainText(
      `${expected.registeredIn(86_400)} registered in the last 24 hours`,
    );
    expect(overviewCalls.at(-1)).toEqual({ status: 200, period: "24h" });
  });

  await test.step("D: a revoked grant turns its count into 'No access', never zero", async () => {
    sql(
      `UPDATE operator_permission_grants SET revoked_at = now(), revoke_reason_code = 'e2e_revocation' WHERE permission = 'operators.read' AND operator_id = (SELECT id FROM platform_operators WHERE user_id = '${operatorId}')`,
    );
    await refocus(page);
    await expect(page.locator("[data-overview-metric=operators]")).toHaveAttribute(
      "data-state",
      "restricted",
    );
    await expect(page.locator("[data-overview-metric=operators]")).toContainText("No access");
    expect(await shown(page, "operators")).toBeNull();
  });

  await test.step("G: when the overview can't be read, no number is shown; retry reads again", async () => {
    await page.route("**/api/v1/admin/overview**", (route) => route.abort());
    await page.reload();
    await expect(page.getByRole("heading", { name: "We couldn’t load this" })).toBeVisible();
    await expect(page.locator("[data-overview-metric]")).toHaveCount(0);
    await page.unroute("**/api/v1/admin/overview**");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Population" })).toBeVisible();
    expect(await shown(page, "accounts")).toBe(expected.accounts());
  });

  await test.step("I: phone width fits, nothing scrolls sideways", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Population" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await test.step("F: revoked meanwhile, the next read clears every number", async () => {
    sql(
      `UPDATE platform_operators SET status = 'revoked', revoked_at = now() WHERE user_id = '${operatorId}'`,
    );
    await refocus(page);
    await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await expect(page.locator("[data-overview-metric]")).toHaveCount(0);
  });
});
