import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test, type Browser, type CDPSession, type Page } from "@playwright/test";

/*
 * SF-127: billing visibility (AD13, AR2, AR4/AR5 read only) on the production build
 * against a real simplefit-api and PostgreSQL (playwright.real-api.config.ts), Chrome only
 * (virtual security keys over CDP). fixtures/billing-seed.exs makes the gyms, plan and
 * subscriptions through the real domain and records the Stripe side as rows (no Stripe
 * API, real or mocked, runs here); every expected figure is read back from the database
 * with SQL, never typed in. Stripe ids, hosted URLs and the event id carry a canary the
 * pages must never show. Setup: e2e/real-api/README.md, "Control Plane"; a freshly
 * migrated disposable database.
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
const audits = (action: string) =>
  n(
    `SELECT count(*) FROM operator_audit_events WHERE action = '${action}' AND outcome = 'allowed'`,
  );

const stamp = Date.now().toString(36);
const OPERATOR = `sf127-operator-${stamp}@e2e.example`;

test.use({ baseURL: "http://localhost:3100" });

test("SF-127 billing visibility against the real backend", async ({
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
  const seeded = mix(["run", resolve("e2e/real-api/fixtures/billing-seed.exs"), "world", stamp]);
  const gym = (key: string) => new RegExp(`GYM ${key} (\\S+) (.+)`).exec(seeded)?.[2]?.trim() ?? "";
  const sub = (key: string) => new RegExp(`SUB ${key} (\\S+)`).exec(seeded)?.[1] ?? "";
  const canary = /CANARY (\S+)/.exec(seeded)?.[1] ?? "";
  const plan = /PLAN (\S+)/.exec(seeded)?.[1] ?? "";
  expect(canary && plan && sub("alpha")).toBeTruthy();

  await test.step("F: someone who isn't an operator gets the not-found page and API answer", async () => {
    const own = await otherSession(browser, OPERATOR);
    await own.goto("/en/admin/subscriptions");
    await expect(own.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await expect(own.locator("[data-billing-state]")).toHaveCount(0);
    await own.context().close();
  });

  bootstrap(operatorId, ["billing.read", "billing.reconciliation.read"], info.outputDir);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");

  await test.step("A/E: one mode's counts and sums, equal to the database; live never in test", async () => {
    await emailSignIn(
      page,
      OPERATOR,
      `/en/admin/login?returnTo=${encodeURIComponent("/admin/subscriptions")}`,
    );
    const first = await securityKey(cdp);
    await page.getByRole("button", { name: "Register first key" }).click();
    await expect(page.getByRole("heading", { name: "Now your backup key" })).toBeVisible();
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: first });
    await securityKey(cdp);
    await page.getByRole("button", { name: "Register backup key" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Use security key" }).click();
    await page.waitForURL((url) => url.pathname === "/en/admin/subscriptions");

    const overview = page.getByRole("region", { name: "Gym subscriptions" });
    await expect(overview.locator("[data-billing-mode=test]")).toBeVisible();
    const testPaid = sql(
      "SELECT sum(amount_paid) FROM stripe_invoices WHERE mode = 'test' AND status = 'paid' AND currency = 'PLN'",
    );
    expect(testPaid).toBe("15000");
    const pln = overview.locator("[data-currency=PLN]");
    await expect(pln).toContainText("150.00");
    await expect(pln).toContainText("2 invoices");
    await expect(overview).not.toContainText("999.00");
    const active = n(
      "SELECT count(*) FROM gym_saas_subscriptions s JOIN stripe_subscriptions l ON l.subscription_id = s.id WHERE l.mode = 'test' AND s.status = 'active'",
    );
    await expect(overview.locator("dl").first()).toContainText(`Active${active}`);
    await expect(overview.getByText(/1 subscription has no provider record/)).toBeVisible();
    await expect(overview.locator("[data-billing-unavailable]")).toContainText("MRR");

    await page.getByRole("button", { name: "Live" }).click();
    await expect(overview.locator("[data-billing-mode=live]")).toBeVisible();
    await expect(overview.locator("[data-currency=PLN]")).toContainText("999.00");
    await expect(overview.locator("[data-currency=PLN]")).toContainText("1 invoice");
    await expect(page.getByRole("table", { name: /Gym subscriptions/ })).toContainText(gym("live"));
    await expect(page.getByRole("table", { name: /Gym subscriptions/ })).not.toContainText(
      gym("alpha"),
    );
    await page.getByRole("button", { name: "Test" }).click();
    await expect(overview.locator("[data-billing-mode=test]")).toBeVisible();
  });

  await test.step("B/C: one subscription: agreed version, failed payment, no secrets", async () => {
    const table = page.getByRole("table", { name: /Gym subscriptions/ });
    await table.getByRole("button", { name: `Open ${gym("alpha")}` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(`Invoice SF127-${stamp}-2`)).toBeVisible();
    await expect(dialog.getByText("Last attempt failed").first()).toBeVisible();
    await expect(dialog.getByText(/SF127 Starter · v1 · Published/)).toBeVisible();
    await expect(dialog.getByText(/Activation:/)).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /^refund|cancel subscription|retry/i }),
    ).toHaveCount(0);
    expect(audits("billing.subscription_viewed")).toBe(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  await test.step("D: reconciliation from the real link rows; a failed event without its id", async () => {
    const recon = page.getByRole("region", { name: "Reconciliation" });
    await expect(recon.getByText("Invoice for another amount")).toBeVisible();
    await expect(recon.getByText("retries_exhausted")).toBeVisible();
    const mismatch = n(
      "SELECT count(*) FROM stripe_subscriptions WHERE mode = 'test' AND discrepancy IS NOT NULL",
    );
    expect(mismatch).toBe(1);
    expect(audits("billing.reconciliation_read")).toBeGreaterThanOrEqual(1);
    await expect(page.locator("body")).not.toContainText(canary);
    await expect(page.locator("body")).not.toContainText("invoice.stripe.com");
  });

  await test.step("C: the invoices page lists the failed attempt from Stripe's record", async () => {
    await page.goto("/en/admin/transactions");
    const table = page.getByRole("table", { name: /Recorded Stripe invoices/ });
    await expect(table).toContainText(`SF127-${stamp}-2`);
    await page.getByRole("combobox", { name: "Payment issue" }).click();
    await page.getByRole("option", { name: "Last attempt failed" }).click();
    await expect(table.locator("tbody tr")).toHaveCount(
      n(
        "SELECT count(*) FROM stripe_invoices WHERE mode = 'test' AND status = 'open' AND payment_status = 'requires_payment_method'",
      ),
    );
    await expect(page.getByText(/Refunds aren’t available here/)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(canary);
  });

  await test.step("B: the plan catalog shows the published version and its mapping", async () => {
    await page.goto(`/en/admin/pricing/${plan}`);
    await expect(page.getByText("PLN 149.00")).toBeVisible();
    await expect(page.getByText("No Stripe price")).toBeVisible();
    await expect(page.getByRole("button", { name: /edit|publish|new plan/i })).toHaveCount(0);
  });

  await test.step("G: no financial write exists at the API either", async () => {
    for (const [method, path] of [
      ["POST", `/api/v1/admin/billing/subscriptions/${sub("alpha")}/cancel`],
      ["POST", "/api/v1/admin/billing/invoices/x/refund"],
      ["POST", "/api/v1/admin/billing/reconciliation"],
    ] as const) {
      const answer = await page.request.fetch(`${API_URL}${path}`, { method, data: {} });
      expect([401, 404]).toContain(answer.status());
    }
    expect(sql(`SELECT status FROM gym_saas_subscriptions WHERE id = '${sub("alpha")}'`)).toBe(
      "active",
    );
    expect(n("SELECT count(*) FROM stripe_refunds")).toBe(0);
  });

  await test.step("J: at 390 px the page fits; keyboard reaches the mode switch", async () => {
    await page.goto("/en/admin/subscriptions");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("[data-billing-state=ready]")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Live" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Live" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await test.step("H: billing access revoked: the next read is refused and the figures go", async () => {
    sql(
      `UPDATE operator_permission_grants SET revoked_at = now(), revoke_reason_code = 'e2e_revocation' WHERE permission IN ('billing.read', 'billing.reconciliation.read') AND operator_id = (SELECT id FROM platform_operators WHERE user_id = '${operatorId}')`,
    );
    await refocus(page);
    await expect(page.locator("[data-billing-state=restricted]")).toBeVisible();
    await expect(page.locator("[data-billing-state=ready]")).toHaveCount(0);
    await expect(page.locator("[data-currency]")).toHaveCount(0);
  });

  await test.step("I: another person on this browser sees nothing of it", async () => {
    await page.goto("/en/app");
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await page.waitForURL(/\/en\/login/);
    const other = `sf127-other-${stamp}@e2e.example`;
    operatorAccount(other);
    await emailSignIn(page, other, "/en/login");
    await page.waitForURL((url) => !url.pathname.endsWith("/login/code"));
    await page.goto("/en/admin/subscriptions");
    await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await expect(page.locator("[data-currency]")).toHaveCount(0);
  });
});
