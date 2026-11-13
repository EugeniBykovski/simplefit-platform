import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test, type Browser, type CDPSession, type Page } from "@playwright/test";

/*
 * SF-128: feature switches (AD6 reduced) on the production build against a real
 * simplefit-api and PostgreSQL (playwright.real-api.config.ts), Chrome only (virtual
 * security keys over CDP). The operator suspends and restores a real switch through the
 * SF-111 dialog; fixtures/configuration-seed.exs asks the real consumer
 * (`Gyms.create_member_invitation/4`) from a separate BEAM sharing the database, i.e. a
 * second application instance. SQL reads results, simulates another operator's commit
 * (a revision raised under the open dialog) and revokes grants. Setup:
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
const OPERATOR = `sf128-operator-${stamp}@e2e.example`;
const KEY = "gym.member_invitations";
const ROW = "Gym member invitation emails (E07)";

test.use({ baseURL: "http://localhost:3100" });

async function chooseReason(page: Page, reason: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: /Reason/ }).click();
  await page.getByRole("option", { name: reason }).click();
  await dialog.getByRole("button", { name: "Review the change" }).click();
  // SF-157: the first action of the session asks for the key in its dialog.
  const key = dialog.getByRole("button", { name: "Use security key" });
  const reviewed = dialog.getByRole("button", { name: /^(Suspend|Restore) now$/ });
  await expect(key.or(reviewed)).toBeVisible();
  if (await key.isVisible()) await key.click();
}

test("SF-128 feature switches against the real backend", async ({
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
  const seeded = mix([
    "run",
    resolve("e2e/real-api/fixtures/configuration-seed.exs"),
    "gym",
    stamp,
  ]);
  const owner = /OWNER (\S+)/.exec(seeded)?.[1] ?? "";
  const gym = /GYM (\S+)/.exec(seeded)?.[1] ?? "";
  let invitation = 0;
  // The seed's answer line, among the separate BEAM's own log output.
  const invite = () =>
    /^(INVITED|REFUSED .*)$/m.exec(
      mix([
        "run",
        resolve("e2e/real-api/fixtures/configuration-seed.exs"),
        "invite",
        owner,
        gym,
        `sf128-invitee-${stamp}-${(invitation += 1)}@e2e.example`,
      ]),
    )?.[1] ?? "no answer";
  const flagRow = () =>
    sql(`SELECT suspended || ' ' || revision FROM runtime_flags WHERE key = '${KEY}'`);

  await test.step("7: someone who isn't an operator gets the not-found page", async () => {
    const own = await otherSession(browser, OPERATOR);
    await own.goto("/en/admin/flags");
    await expect(own.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await own.context().close();
  });

  bootstrap(operatorId, ["config.read", "config.flags.write"], info.outputDir);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");

  await test.step("1/A: the registry as the backend has it; high-risk switches have no control", async () => {
    await emailSignIn(page, OPERATOR, `/en/login?returnTo=${encodeURIComponent("/admin/flags")}`);
    await page.getByRole("button", { name: "Register keys" }).click();
    const first = await securityKey(cdp);
    await page.getByRole("button", { name: "Register first key" }).click();
    await expect(page.getByRole("heading", { name: "Now your backup key" })).toBeVisible();
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: first });
    await securityKey(cdp);
    await page.getByRole("button", { name: "Register backup key" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((url) => url.pathname === "/en/admin/flags");

    await expect(page.locator("[data-flag]")).toHaveCount(9);
    expect(n("SELECT count(*) FROM runtime_flags")).toBe(4);
    for (const key of [
      "stripe.billing",
      "stripe.mode",
      "stripe.connect",
      "coaching.access",
      "api.docs",
    ]) {
      await expect(page.locator(`[data-flag="${key}"]`).getByRole("button")).toHaveCount(0);
    }
    await expect(page.locator(`[data-flag="${KEY}"]`)).toHaveAttribute("data-effective", "true");
    expect(invite()).toBe("INVITED");
  });

  await test.step("2/B: preview changes nothing; suspension commits and the other instance's consumer refuses", async () => {
    expect(flagRow()).toBe("false 1");
    await page.getByRole("button", { name: `Suspend ${ROW}` }).click();
    await chooseReason(page, "Incident response");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Nothing that already happened is undone.")).toBeVisible();
    expect(flagRow()).toBe("false 1");
    expect(invite()).toBe("INVITED");

    await dialog.getByRole("button", { name: "Suspend now" }).click();
    await expect(dialog.getByText(/The change is committed/)).toBeVisible();
    expect(flagRow()).toBe("true 2");
    expect(
      sql(`SELECT change || ' ' || reason_code FROM runtime_flag_revisions WHERE revision = 2`),
    ).toBe("suspend incident_response");
    expect(
      n(
        "SELECT count(*) FROM operator_audit_events WHERE action = 'config.flag_suspended' AND outcome = 'allowed'",
      ),
    ).toBe(1);
    expect(invite()).toMatch(/^REFUSED .*recipient_flow_unavailable/);
    await dialog.getByRole("button", { name: "Close" }).last().click();
    await expect(page.locator(`[data-flag="${KEY}"]`)).toHaveAttribute("data-effective", "false");
  });

  await test.step("4: another commit under an open dialog: 409, nothing applied, read again", async () => {
    await page.getByRole("button", { name: `Restore ${ROW}` }).click();
    await chooseReason(page, "Incident resolved");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Restore now" })).toBeVisible();
    // Another writer: restore then suspend again, raising the revision twice.
    sql(`UPDATE runtime_flags SET suspended = false WHERE key = '${KEY}'`);
    sql(`UPDATE runtime_flags SET suspended = true WHERE key = '${KEY}'`);
    expect(flagRow()).toBe("true 4");
    await dialog.getByRole("button", { name: "Restore now" }).click();
    await expect(dialog.getByText(/changed since you read it/)).toBeVisible();
    expect(flagRow()).toBe("true 4");
    await dialog.getByRole("button", { name: "Read the current state" }).click();
    await expect(page.locator(`[data-flag="${KEY}"]`)).toContainText("Revision 4");
  });

  await test.step("C/6: restore (the rollback) is a new revision; the consumer works again", async () => {
    await page.getByRole("button", { name: `Restore ${ROW}` }).click();
    await chooseReason(page, "Incident resolved");
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Restore now" }).click();
    await expect(dialog.getByText(/The change is committed/)).toBeVisible();
    expect(flagRow()).toBe("false 5");
    expect(n("SELECT count(*) FROM runtime_flag_revisions")).toBe(2);
    expect(invite()).toBe("INVITED");
    await dialog.getByRole("button", { name: "Close" }).last().click();
    await expect(
      page.getByRole("table", { name: /Every suspension and restore/ }).locator("tbody tr"),
    ).toHaveCount(2);
  });

  await test.step("D/E/5: unknown, read-only and invented targets are refused by the API", async () => {
    // The operator's own bearer token, taken from the app's next configuration read.
    const read = page.waitForRequest((request) =>
      request.url().endsWith("/api/v1/admin/configuration"),
    );
    await page.reload();
    const authorization = (await read).headers()["authorization"] ?? "";
    expect(authorization).toMatch(/^Bearer /);
    const post = (path: string, data: unknown) =>
      page.request.post(`${API_URL}${path}`, { headers: { authorization }, data });

    for (const path of [
      "/api/v1/admin/configuration/flags/stripe.billing/suspend/preview",
      `/api/v1/admin/configuration/flags/${randomUUID()}/suspend/preview`,
      "/api/v1/admin/configuration/stripe.billing/enable",
      "/api/v1/admin/configuration/flags/x/enable",
    ]) {
      const answer = await post(path, { reason_code: "incident_response", value: true });
      expect(answer.status(), path).toBe(404);
    }
    expect(n("SELECT count(*) FROM runtime_flags")).toBe(4);
    expect(n("SELECT count(*) FROM runtime_flag_revisions")).toBe(2);
  });

  await test.step("9: at 390 px the page fits", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.locator("[data-configuration-state=ready]")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await test.step("3: write access revoked: no controls; read access revoked: restricted", async () => {
    sql(
      `UPDATE operator_permission_grants SET revoked_at = now(), revoke_reason_code = 'e2e_revocation' WHERE permission = 'config.flags.write' AND operator_id = (SELECT id FROM platform_operators WHERE user_id = '${operatorId}')`,
    );
    await refocus(page);
    await expect(page.getByText(/needs configuration write access/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Suspend |^Restore / })).toHaveCount(0);
    sql(
      `UPDATE operator_permission_grants SET revoked_at = now(), revoke_reason_code = 'e2e_revocation' WHERE permission = 'config.read' AND operator_id = (SELECT id FROM platform_operators WHERE user_id = '${operatorId}')`,
    );
    await refocus(page);
    await expect(page.locator("[data-configuration-state=restricted]")).toBeVisible();
    await expect(page.locator("[data-flag]")).toHaveCount(0);
  });

  await test.step("7: another person on this browser sees nothing of it", async () => {
    await page.goto("/en/app");
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await page.waitForURL(/\/en\/login/);
    const other = `sf128-other-${stamp}@e2e.example`;
    operatorAccount(other);
    await emailSignIn(page, other, "/en/login");
    await page.waitForURL((url) => !url.pathname.endsWith("/login/code"));
    await page.goto("/en/admin/flags");
    await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await expect(page.locator("[data-flag]")).toHaveCount(0);
  });
});
