import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test, type Browser, type CDPSession, type Page } from "@playwright/test";

/*
 * SF-123: gym, coach and fighter oversight (AD2, AD12, AD7's tabs) on the production
 * build against a real simplefit-api and PostgreSQL (playwright.real-api.config.ts),
 * Chrome only (virtual security keys over CDP). The world (a set-up gym with an owner
 * and a member; a coach and a fighter in a relationship with a session note; the
 * fighter's body data) comes from fixtures/oversight-seed.exs through public context
 * functions. What the operator sees is checked against the disposable database, and
 * the canaries (member name, bio, note, weight, fight, full names, address) must never
 * appear. SQL only resets rate limits, revokes grants (the client's answer is under
 * test) and reads results. Setup: e2e/real-api/README.md, "Control Plane"; every run
 * needs a freshly migrated disposable database.
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

function operatorAccount(email: string): string {
  const out = mix(["run", resolve("e2e/real-api/fixtures/control-plane-seed.exs"), "user", email]);
  const id = /USER ([0-9a-f-]{36})/.exec(out)?.[1];
  if (!id) throw new Error("no account was created");
  return id;
}

function world(stamp: string) {
  const out = mix(["run", resolve("e2e/real-api/fixtures/oversight-seed.exs"), "world", stamp]);
  const line = (tag: string) => {
    const match = new RegExp(`^${tag} ([0-9a-f-]{36}) (.+)$`, "m").exec(out);
    if (!match) throw new Error(`the seed printed no ${tag}`);
    return { id: match[1]!, value: match[2]!.trim() };
  };
  return { gym: line("GYM"), owner: line("OWNER"), coach: line("COACH"), fighter: line("FIGHTER") };
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

async function pick(page: Page, combobox: RegExp, option: string) {
  await page.getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: option }).click();
}

const refocus = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));

const revoke = (operatorUserId: string, permissions: string[]) =>
  sql(
    `UPDATE operator_permission_grants SET revoked_at = now(), revoke_reason_code = 'e2e_revocation' WHERE revoked_at IS NULL AND permission IN (${permissions.map((p) => `'${p}'`).join(", ")}) AND operator_id = (SELECT id FROM platform_operators WHERE user_id = '${operatorUserId}')`,
  );

const audits = (action: string, target: string | null = null, reason: string | null = null) =>
  n(
    `SELECT count(*) FROM operator_audit_events WHERE action = '${action}'` +
      (target ? ` AND target_id = '${target}'` : "") +
      (reason ? ` AND reason_code = '${reason}'` : ""),
  );

const CANARIES = [
  "Memberka",
  "Canary",
  "Wiśniewska",
  "Biocanary",
  "Notecanary",
  "Fightcanary",
  "Fightercanary",
  "71.5",
  "ul. Józefa",
  "sf123-owner-",
  "sf123-member-",
  "sf123-coach-",
  "sf123-fighter-",
];

async function noCanaries(page: Page) {
  const text = await page.locator("body").innerText();
  for (const canary of CANARIES) expect(text, canary).not.toContain(canary);
}

async function otherSession(browser: Browser, email: string) {
  const context = await browser.newContext({ baseURL: "http://localhost:3100" });
  await context.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());
  const page = await context.newPage();
  await emailSignIn(page, email, "/en/login");
  await page.waitForURL((url) => !url.pathname.endsWith("/login/code"));
  return page;
}

const stamp = Date.now().toString(36);
const OPERATOR = `sf123-operator-${stamp}@e2e.example`;
const PERMISSIONS = ["gyms.read", "coaches.read", "fighters.read", "users.read"];

test.use({ baseURL: "http://localhost:3100" });

test("SF-123 gym, coach and fighter oversight against the real backend", async ({
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
  const seeded = world(stamp);
  const operatorId = operatorAccount(OPERATOR);
  const gymName = seeded.gym.value;
  const coachProfile = sql(`SELECT id FROM coach_profiles WHERE user_id = '${seeded.coach.id}'`);
  const fighterProfile = sql(
    `SELECT id FROM fighter_profiles WHERE user_id = '${seeded.fighter.id}'`,
  );

  await test.step("D0: a gym owner, a coach and a fighter are not operators", async () => {
    for (const email of [seeded.owner.value, seeded.coach.value]) {
      const own = await otherSession(browser, email);
      await own.goto("/en/admin/tenants");
      await expect(own.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
      await own.context().close();
    }
  });

  bootstrap(operatorId, PERMISSIONS, info.outputDir);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");

  await test.step("A: the gym list is real, filtered on the server, and recorded", async () => {
    await emailSignIn(
      page,
      OPERATOR,
      `/en/admin/login?returnTo=${encodeURIComponent("/admin/tenants")}`,
    );
    const first = await securityKey(cdp);
    await page.getByRole("button", { name: "Register first key" }).click();
    await expect(page.getByRole("heading", { name: "Now your backup key" })).toBeVisible();
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: first });
    await securityKey(cdp);
    await page.getByRole("button", { name: "Register backup key" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Use security key" }).click();
    await page.waitForURL((url) => url.pathname === "/en/admin/tenants");

    await page.getByRole("textbox", { name: "Name starts with" }).fill(gymName.toLowerCase());
    const row = page.locator(`[data-gym="${seeded.gym.id}"]`);
    await expect(row).toBeVisible();
    await expect(page.locator("[data-gym]")).toHaveCount(1);
    await expect(row).toContainText("Set up");
    await expect(row).toContainText("Not started");
    await expect(row).toContainText("Kraków, PL");
    expect(
      n(
        `SELECT count(*) FROM gym_staff_memberships WHERE gym_id = '${seeded.gym.id}' AND status = 'active'`,
      ),
    ).toBe(1);
    await expect(row.locator("td").nth(3)).toHaveText("1");

    await page.getByRole("combobox", { name: "Verification" }).click();
    await page.getByRole("option", { name: "Approved" }).click();
    await expect(page.getByText("No gyms match")).toBeVisible();
    expect(audits("gyms.listed")).toBeGreaterThanOrEqual(2);
    await noCanaries(page);
  });

  await test.step("A: one gym, read with a reason: counts, the owner's short name, nothing private", async () => {
    await page.goto(`/en/admin/tenants/${seeded.gym.id}`);
    await pick(page, /Reason/, "Abuse report");
    await page.getByRole("button", { name: "Open gym" }).click();
    await page.waitForURL((url) => url.search.includes("reason=abuse_report"));
    const people = page.getByRole("region", { name: "People" });
    await expect(people).toContainText("Natalia W.");
    const members = n(
      `SELECT count(*) FROM gym_members WHERE gym_id = '${seeded.gym.id}' AND status = 'active'`,
    );
    expect(members).toBe(1);
    await expect(people.locator("dd").nth(5)).toHaveText(String(members));
    await expect(page.getByRole("region", { name: "Business verification" })).toContainText(
      "Not started",
    );
    expect(audits("gym.viewed", seeded.gym.id, "abuse_report")).toBe(1);
    await noCanaries(page);
  });

  await test.step("E: the owner's account opens only through users.read, checked again", async () => {
    await page.getByRole("link", { name: "Natalia W." }).click();
    await page.waitForURL((url) => url.pathname === `/en/admin/users/${seeded.owner.id}`);
    await expect(page.getByRole("region", { name: "Account and security" })).toBeVisible();
    expect(audits("user.viewed", seeded.owner.id, "abuse_report")).toBe(1);
  });

  await test.step("B: a coach by exact email: profile, account and counts only", async () => {
    await page.goto("/en/admin/users?tab=coaches");
    await page.getByRole("textbox", { name: /Exact email or user ID/ }).fill(seeded.coach.value);
    await pick(page, /Reason/, "Support request");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: "Show profile" }).click();
    const relationships = page.getByRole("region", { name: "Coaching relationships" });
    await expect(relationships).toBeVisible();
    const active = n(
      `SELECT count(*) FROM coach_fighter_relationships WHERE coach_profile_id = '${coachProfile}' AND status = 'active'`,
    );
    expect(active).toBe(1);
    await expect(relationships.locator("dd").first()).toHaveText(String(active));
    await expect(page.locator(`[data-coach="${coachProfile}"]`)).toContainText("Coach Marek");
    expect(audits("coach.searched", coachProfile, "support_request")).toBe(1);
    expect(audits("coach.viewed", coachProfile, "support_request")).toBe(1);
    await noCanaries(page);
  });

  await test.step("C: a fighter by @username: shared fields only, no body data, goals or notes", async () => {
    await page.getByRole("tab", { name: "Fighters" }).click();
    const username = seeded.fighter.value;
    await page
      .getByRole("textbox", { name: /@username, exact email or user ID/ })
      .fill(`@${username.toUpperCase()}`);
    await pick(page, /Reason/, "Account security");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: "Show profile" }).click();
    const profile = page.locator(`[data-fighter="${fighterProfile}"]`);
    await expect(profile).toContainText("Southpaw");
    await expect(profile).toContainText("Alex K.");
    expect(audits("fighter.viewed", fighterProfile, "account_security")).toBe(1);
    expect(
      sql(`SELECT current_weight_kg FROM fighter_profiles WHERE id = '${fighterProfile}'`),
    ).toBe("71.5");
    await noCanaries(page);
  });

  await test.step("D: with people grants revoked, only the gym remains; links and reads are refused", async () => {
    revoke(operatorId, ["coaches.read", "fighters.read", "users.read"]);
    await refocus(page);
    await expect(page.getByText("You don’t have access to this section")).toBeVisible();
    await expect(page.locator(`[data-fighter="${fighterProfile}"]`)).toHaveCount(0);

    await page.goto(`/en/admin/tenants/${seeded.gym.id}?reason=support_request`);
    const people = page.getByRole("region", { name: "People" });
    await expect(people).toContainText("Natalia W.");
    await expect(people.getByRole("link")).toHaveCount(0);

    await page.goto(`/en/admin/users/${seeded.owner.id}?reason=support_request`);
    await expect(page.getByText("You don’t have access to this section")).toBeVisible();
    const refused = n(
      `SELECT count(*) FROM operator_audit_events WHERE outcome = 'refused' AND permission = 'users.read'`,
    );
    expect(refused).toBeGreaterThanOrEqual(1);
  });

  await test.step("I: at 390 px the gym list reads without page overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/admin/tenants");
    await expect(page.locator(`[data-gym="${seeded.gym.id}"]`)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await test.step("G: gyms.read revoked while a gym is open: the next focus clears it", async () => {
    await page.goto(`/en/admin/tenants/${seeded.gym.id}?reason=support_request`);
    await expect(page.getByRole("region", { name: "People" })).toBeVisible();
    revoke(operatorId, ["gyms.read"]);
    await refocus(page);
    await expect(page.getByText("You don’t have access to this section")).toBeVisible();
    await expect(page.getByRole("region", { name: "People" })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Natalia W.");
  });

  await test.step("H: another person signs in on this browser: nothing of the operator's shows", async () => {
    await page.goto("/en/app");
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await page.waitForURL(/\/en\/login/);
    await emailSignIn(page, seeded.owner.value, "/en/login");
    await page.waitForURL((url) => !url.pathname.endsWith("/login/code"));
    await page.goto(`/en/admin/tenants/${seeded.gym.id}?reason=support_request`);
    await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(gymName);
  });
});
