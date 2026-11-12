import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  expect,
  test,
  type Browser,
  type CDPSession,
  type Locator,
  type Page,
} from "@playwright/test";

/*
 * SF-129: operators (AD20) on the production build against a real simplefit-api and
 * PostgreSQL (playwright.real-api.config.ts), Chrome only (virtual security keys over
 * CDP). The founder adds a second operator by exact email; that operator registers their
 * own keys in their own browser context. Grants, a permission revoked (and refused on
 * the next request, in the UI and by the API), suspension, reinstatement and revocation
 * all run through the SF-111 dialogs; SQL only reads results. Setup:
 * e2e/real-api/README.md, "Control Plane"; a freshly migrated disposable database.
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

async function emailSignIn(page: Page, email: string, path: string) {
  resetRateLimits();
  await page.goto(path);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((url) => url.pathname.endsWith("/login/code"));
  await page.locator('[data-slot="code-input"]').pressSequentially(emailedCode(email));
}

/** Signs in at the Control Plane entry, registers two keys and passes the key check. */
async function enrol(page: Page, cdp: CDPSession, email: string) {
  await emailSignIn(page, email, `/en/admin/login?returnTo=${encodeURIComponent("/admin/staff")}`);
  const first = await securityKey(cdp);
  await page.getByRole("button", { name: "Register first key" }).click();
  await expect(page.getByRole("heading", { name: "Now your backup key" })).toBeVisible();
  await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: first });
  await securityKey(cdp);
  await page.getByRole("button", { name: "Register backup key" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Use security key" }).click();
  await page.waitForURL((url) => url.pathname === "/en/admin/staff");
}

async function context(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: "http://localhost:3100" });
  await ctx.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  return { page, cdp };
}

/** The bearer token the app sends on its next operator list read. */
async function bearer(page: Page) {
  const read = page.waitForRequest((request) => request.url().endsWith("/api/v1/admin/operators"));
  await page.reload();
  const authorization = (await read).headers()["authorization"] ?? "";
  expect(authorization).toMatch(/^Bearer /);
  return authorization;
}

const n = (query: string) => Number(sql(query));
const refocus = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
const operatorOf = (userId: string) =>
  `(SELECT id FROM platform_operators WHERE user_id = '${userId}')`;

/** Picks a reason, reviews, and passes a fresh key check if the backend asks for one. */
async function review(page: Page, dialog: Locator, reason: string, confirm: string) {
  await dialog.getByRole("combobox", { name: /Reason/ }).click();
  await page.getByRole("option", { name: reason }).click();
  await dialog.getByRole("button", { name: "Review" }).click();
  const confirmButton = dialog.getByRole("button", { name: confirm, exact: true });
  const key = dialog.getByRole("button", { name: "Use security key" });
  await expect(confirmButton.or(key)).toBeVisible();
  if (await key.isVisible()) await key.click();
  await expect(confirmButton).toBeVisible();
  return confirmButton;
}

const stamp = Date.now().toString(36);
const FOUNDER = `sf129-founder-${stamp}@e2e.example`;
const SECOND = `sf129-second-${stamp}@e2e.example`;

test.use({ baseURL: "http://localhost:3100" });

test("SF-129 operator governance against the real backend", async ({
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
  const founderUser = account(FOUNDER);
  const secondUser = account(SECOND);
  const founder = operatorOf(founderUser);
  const second = operatorOf(secondUser);

  await test.step("unauthorized: someone who isn't an operator gets the not-found page", async () => {
    const { page: own } = await context(browser);
    await emailSignIn(own, SECOND, "/en/login");
    await own.waitForURL((url) => !url.pathname.endsWith("/login/code"));
    await own.goto("/en/admin/staff");
    await expect(own.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await own.context().close();
  });

  bootstrap(founderUser, ["operators.read", "operators.manage", "audit.read"], info.outputDir);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");

  await test.step("inventory: the founder, marked as you, with their own security; no action on oneself", async () => {
    await enrol(page, cdp, FOUNDER);
    await expect(page.locator("[data-operator-row]")).toHaveCount(1);
    const me = page.getByRole("row", { name: /E2E O\./ });
    await expect(me.getByText("You")).toBeVisible();
    await expect(me).toContainText("2 of 2");
    const security = page.getByRole("region", { name: "Your security" });
    await expect(security.locator("[data-own-keys]")).toHaveAttribute("data-own-keys", "2");
    await expect(security.getByRole("button", { name: /Remove key/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Details for E2E O." }).click();
    const detail = page.locator("[data-operator-detail]");
    await expect(detail.getByText(/This is you/)).toBeVisible();
    await expect(detail.getByText(/From the founding ceremony/)).toHaveCount(3);
    await expect(detail.locator("[data-operator-actions]")).toHaveCount(0);
    await expect(detail.getByText("Changes to this operator")).toBeVisible();
  });

  await test.step("add an operator by exact email: an unknown address is refused, nothing added", async () => {
    await page.getByRole("button", { name: "Add an operator" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Their account/).fill(`nobody-${stamp}@e2e.example`);
    await dialog.getByLabel("operators.read").click();
    await dialog.getByLabel("operators.manage").click();
    await dialog.getByRole("combobox", { name: /Reason/ }).click();
    await page.getByRole("option", { name: "Access request approved" }).click();
    const submit = dialog.getByRole("button", { name: "Add operator" });
    await submit.click();
    const key = dialog.getByRole("button", { name: "Use security key" });
    const refused = dialog.getByText(/No account we can add matches/);
    await expect(refused.or(key)).toBeVisible();
    if (await key.isVisible()) await key.click();
    await expect(refused).toBeVisible();
    expect(n("SELECT count(*) FROM platform_operators")).toBe(1);

    await dialog.getByLabel(/Their account/).fill(SECOND.toUpperCase());
    await submit.click();
    await expect(dialog.getByText(/They hold nothing usable/)).toBeVisible();
    expect(sql(`SELECT status FROM platform_operators WHERE id = ${second}`)).toBe(
      "pending_enrollment",
    );
    expect(
      sql(
        `SELECT string_agg(permission || ':' || reason_code || ':' || (granted_by_operator_id = ${founder}), ',' ORDER BY permission) FROM operator_permission_grants WHERE operator_id = ${second} AND revoked_at IS NULL`,
      ),
    ).toBe(
      "operators.manage:access_request_approved:true,operators.read:access_request_approved:true",
    );
    await dialog.getByRole("button", { name: "Close" }).last().click();
    const row = page.getByRole("row", { name: /Setting up keys/ });
    await expect(row).toContainText("0 of 2");
    await expect(row).toContainText("Never");
  });

  const other = await context(browser);
  await test.step("the new operator registers their own keys and sees the inventory", async () => {
    await enrol(other.page, other.cdp, SECOND);
    expect(sql(`SELECT status FROM platform_operators WHERE id = ${second}`)).toBe("active");
    await expect(other.page.locator("[data-operator-row]")).toHaveCount(2);
    await expect(other.page.getByRole("button", { name: "Add an operator" })).toBeVisible();
  });

  await test.step("grant: preview changes nothing; the grant commits with its provenance", async () => {
    await refocus(page);
    const row = page.locator(`[data-operator-row]`).filter({ hasNotText: "You" });
    await expect(row).toHaveAttribute("data-status", "active");
    await row.getByRole("button", { name: /^Details for/ }).click();
    const detail = page.locator("[data-operator-detail]");
    await detail.getByRole("button", { name: "Grant a permission" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: /Permission/ }).click();
    await expect(page.getByRole("option", { name: "operators.manage" })).toHaveCount(0);
    await page.getByRole("option", { name: "audit.read" }).click();
    const confirm = await review(page, dialog, "Role change", "Grant permission");
    await expect(dialog.getByText("It works from their next request.")).toBeVisible();
    expect(
      n(
        `SELECT count(*) FROM operator_permission_grants WHERE operator_id = ${second} AND permission = 'audit.read'`,
      ),
    ).toBe(0);
    await confirm.click();
    await expect(dialog.getByText(/Granted\. It’s recorded/)).toBeVisible();
    expect(
      sql(
        `SELECT reason_code FROM operator_permission_grants WHERE operator_id = ${second} AND permission = 'audit.read' AND revoked_at IS NULL`,
      ),
    ).toBe("role_change");
    await dialog.getByRole("button", { name: "Close" }).last().click();
    await expect(detail.locator('[data-grant="audit.read"]')).toContainText("Role change");
  });

  await test.step("revoke: manage removed; refused on their next request, in the UI and by the API", async () => {
    const otherToken = await bearer(other.page);
    const detail = page.locator("[data-operator-detail]");
    await detail.getByRole("button", { name: /^Revoke operators\.manage from/ }).click();
    const dialog = page.getByRole("dialog");
    const confirm = await review(page, dialog, "Least-privilege review", "Revoke permission");
    await confirm.click();
    await expect(dialog.getByText(/stopped working immediately/)).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).last().click();
    expect(
      n(
        `SELECT count(*) FROM operator_permission_grants WHERE operator_id = ${second} AND permission = 'operators.manage' AND revoked_at IS NULL`,
      ),
    ).toBe(0);

    await refocus(other.page);
    await expect(
      other.page.getByText("You can see operators. Changing them needs operators.manage."),
    ).toBeVisible();
    await expect(other.page.getByRole("button", { name: "Add an operator" })).toHaveCount(0);
    // The founder is now the last manager: the other operator can't touch them.
    const founderId = sql(`SELECT id FROM platform_operators WHERE user_id = '${founderUser}'`);
    const answer = await other.page.request.post(
      `${API_URL}/api/v1/admin/operators/${founderId}/suspend/preview`,
      {
        headers: { authorization: otherToken },
        data: { reason_code: "security_concern", expected_revision: 1 },
      },
    );
    expect(answer.status()).toBe(403);
    expect(
      n(
        `SELECT count(*) FROM platform_operators o JOIN operator_permission_grants g ON g.operator_id = o.id AND g.permission = 'operators.manage' AND g.revoked_at IS NULL WHERE o.status = 'active'`,
      ),
    ).toBe(1);
  });

  await test.step("self: the API refuses the founder acting on themselves", async () => {
    const token = await bearer(page);
    const founderId = sql(`SELECT id FROM platform_operators WHERE user_id = '${founderUser}'`);
    const answer = await page.request.post(
      `${API_URL}/api/v1/admin/operators/${founderId}/suspend/preview`,
      {
        headers: { authorization: token },
        data: { reason_code: "security_concern", expected_revision: 1 },
      },
    );
    expect(answer.status()).toBe(409);
    expect((await answer.json()).error.details).toEqual({ target: "self" });
    expect(sql(`SELECT status FROM platform_operators WHERE id = ${founder}`)).toBe("active");
  });

  await test.step("suspend: their access ends at once; reinstate restores it", async () => {
    const row = page.locator(`[data-operator-row]`).filter({ hasNotText: "You" });
    await row.getByRole("button", { name: /^Details for/ }).click();
    const detail = page.locator("[data-operator-detail]");
    await detail.getByRole("button", { name: "Suspend" }).click();
    let dialog = page.getByRole("dialog");
    let confirm = await review(page, dialog, "Security concern", "Suspend operator");
    await expect(dialog.getByText("They can’t open the Control Plane.")).toBeVisible();
    await confirm.click();
    await expect(dialog.getByText(/Suspended\. Their access/)).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).last().click();
    expect(sql(`SELECT status FROM platform_operators WHERE id = ${second}`)).toBe("suspended");
    expect(
      n(
        `SELECT count(*) FROM operator_step_ups WHERE operator_id = ${second} AND revoked_at IS NULL`,
      ),
    ).toBe(0);
    await other.page.reload();
    await expect(other.page.locator("[data-operator-row]")).toHaveCount(0);

    await expect(detail).toHaveAttribute("data-status", "suspended");
    await detail.getByRole("button", { name: "Reinstate" }).click();
    dialog = page.getByRole("dialog");
    confirm = await review(page, dialog, "Security review cleared", "Reinstate operator");
    await confirm.click();
    await expect(dialog.getByText("Reinstated.")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).last().click();
    expect(sql(`SELECT status FROM platform_operators WHERE id = ${second}`)).toBe("active");
  });

  await test.step("revoke the operator: irreversible, every permission and key removed", async () => {
    const detail = page.locator("[data-operator-detail]");
    await expect(detail).toHaveAttribute("data-status", "active");
    await detail.getByRole("button", { name: "Revoke operator", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const confirm = await review(page, dialog, "Left the organization", "Revoke operator");
    await expect(dialog.getByText(/This can’t be undone/)).toBeVisible();
    await confirm.click();
    await expect(dialog.getByText(/Revoked\. This can’t be undone/)).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).last().click();
    expect(sql(`SELECT status FROM platform_operators WHERE id = ${second}`)).toBe("revoked");
    expect(
      n(
        `SELECT count(*) FROM operator_permission_grants WHERE operator_id = ${second} AND revoked_at IS NULL`,
      ),
    ).toBe(0);
    expect(
      n(
        `SELECT count(*) FROM operator_credentials WHERE operator_id = ${second} AND revoked_at IS NULL`,
      ),
    ).toBe(0);
    await expect(detail).toHaveAttribute("data-status", "revoked");
    await expect(detail.locator("[data-operator-actions]")).toHaveCount(0);
    await expect(detail.getByText("Changes to this operator")).toBeVisible();
    expect(
      n(
        `SELECT count(*) FROM operator_audit_events WHERE target_id = ${second} AND outcome = 'allowed' AND action IN ('operator.provisioned', 'operator.permission_granted', 'operator.permission_revoked', 'operator.suspended', 'operator.reinstated', 'operator.revoked')`,
      ),
    ).toBeGreaterThanOrEqual(6);
    await other.page.context().close();
  });

  await test.step("390 px: the page fits; high-risk actions wait for a larger screen", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.locator("[data-operators-state=ready]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add an operator" })).toBeHidden();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await test.step("account switch: another person on this browser sees nothing of it", async () => {
    await page.goto("/en/app");
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await page.waitForURL(/\/en\/login/);
    const stranger = `sf129-other-${stamp}@e2e.example`;
    account(stranger);
    await emailSignIn(page, stranger, "/en/login");
    await page.waitForURL((url) => !url.pathname.endsWith("/login/code"));
    await page.goto("/en/admin/staff");
    await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await expect(page.locator("[data-operator-row]")).toHaveCount(0);
  });
});
