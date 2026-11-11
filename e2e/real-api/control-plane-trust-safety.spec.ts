import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test, type Browser, type CDPSession, type Page } from "@playwright/test";

/*
 * SF-125: Moderation (AD4) and Enforcement (AD11) on the production build against a real
 * simplefit-api and PostgreSQL (playwright.real-api.config.ts), Chrome only (virtual
 * security keys over CDP). No reports, content or enforcement domain exists (D-SA32): a
 * non-operator gets the not-found page; an operator past the key check gets the truthful
 * "not available" screens, and no moderation request ever reaches the backend. Setup:
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

const stamp = Date.now().toString(36);
const OPERATOR = `sf125-operator-${stamp}@e2e.example`;

test.use({ baseURL: "http://localhost:3100" });

test("SF-125 moderation and enforcement are truthfully unavailable", async ({
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

  await test.step("E: a signed-in person who isn't an operator gets the not-found page", async () => {
    const own = await otherSession(browser, OPERATOR);
    for (const path of ["/en/admin/moderation", "/en/admin/enforcement"]) {
      await own.goto(path);
      await expect(own.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
      await expect(own.locator("body")).not.toContainText("isn’t part of the Control Plane yet");
    }
    await own.context().close();
  });

  bootstrap(operatorId, ["users.read"], info.outputDir);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const adminCalls: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/v1/admin/")) adminCalls.push(path);
  });

  await test.step("A/I: an operator sees the truthful screens; nothing is asked of a moderation domain", async () => {
    await emailSignIn(
      page,
      OPERATOR,
      `/en/admin/login?returnTo=${encodeURIComponent("/admin/moderation")}`,
    );
    const first = await securityKey(cdp);
    await page.getByRole("button", { name: "Register first key" }).click();
    await expect(page.getByRole("heading", { name: "Now your backup key" })).toBeVisible();
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: first });
    await securityKey(cdp);
    await page.getByRole("button", { name: "Register backup key" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Use security key" }).click();
    await page.waitForURL((url) => url.pathname === "/en/admin/moderation");

    await expect(
      page.getByRole("heading", { name: "Moderation isn’t part of the Control Plane yet" }),
    ).toBeVisible();
    await expect(page.locator("[data-trust-safety=moderation]")).toHaveAttribute(
      "data-state",
      "unavailable",
    );
    await expect(page.getByRole("table")).toHaveCount(0);

    await page.goto("/en/admin/enforcement");
    await expect(
      page.getByRole("heading", {
        name: "Enforcement and appeals aren’t part of the Control Plane yet",
      }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Users", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/en/admin/users");

    const unexpected = adminCalls.filter(
      (path) => !/^\/api\/v1\/admin\/(me|credentials|step-up)/.test(path),
    );
    expect(unexpected).toEqual([]);
  });

  await test.step("J: at 390 px the screen fits without page overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/admin/moderation");
    await expect(page.locator("[data-trust-safety=moderation]")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
});
