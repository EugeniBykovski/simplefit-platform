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
 * SF-124: the sponsor application review console (AS1, AS2) on the production build
 * against a real simplefit-api and PostgreSQL (playwright.real-api.config.ts), Chrome
 * only (virtual security keys over CDP), with storage on the local S3 stand-in
 * (e2e/real-api/fixtures/s3-stub.mjs: no signatures checked, so not a real-S3 test).
 * Applications are made and submitted by their applicants through public context
 * functions (fixtures/sponsor-review-seed.exs); every decision goes through the UI, the
 * backend's preview and the SF-111 command, and is checked in the disposable database
 * (status, organization, membership, audit, notification intent). SQL only resets rate
 * limits and reads results. Setup: e2e/real-api/README.md, "Control Plane"; every run
 * needs a freshly migrated disposable database.
 */

const API_URL = process.env.E2E_REAL_API_URL ?? "";
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";
const STORAGE = {
  AWS_S3_BUCKET: process.env.E2E_S3_BUCKET ?? "",
  AWS_REGION: "us-east-1",
  AWS_ACCESS_KEY_ID: process.env.E2E_S3_ACCESS_KEY_ID ?? "",
  AWS_SECRET_ACCESS_KEY: process.env.E2E_S3_SECRET_ACCESS_KEY ?? "",
  AWS_S3_ENDPOINT: process.env.E2E_S3_ENDPOINT ?? "",
};

test.skip(
  !API_URL || !STORAGE.AWS_S3_ENDPOINT,
  "needs a running API and storage on a disposable database",
);
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
    env: { ...process.env, ...STORAGE, MIX_ENV: "dev", DATABASE_URL: disposableDatabase() },
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

function applicant(email: string, company: string, document = false) {
  const out = mix([
    "run",
    resolve("e2e/real-api/fixtures/sponsor-review-seed.exs"),
    "applicant",
    email,
    company,
    ...(document ? ["document"] : []),
  ]);
  const match = /APPLICATION ([0-9a-f-]{36}) USER ([0-9a-f-]{36})/.exec(out);
  if (!match) throw new Error("no application was submitted");
  return { id: match[1]!, user: match[2]!, email, company };
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

const status = (id: string) => sql(`SELECT status FROM sponsor_applications WHERE id = '${id}'`);
const organizations = (id: string) =>
  n(`SELECT count(*) FROM sponsor_organizations WHERE source_application_id = '${id}'`);
const audits = (command: string, target: string) =>
  n(
    `SELECT count(*) FROM operator_audit_events WHERE command = '${command}' AND target_id = '${target}' AND outcome = 'allowed'`,
  );

/**
 * Runs one action through its dialog: reason (if asked), review, a key check if the
 * backend wants one, then the confirm button. Returns the dialog.
 */
async function act(
  page: Page,
  button: string,
  confirm: string,
  { reason, prepare }: { reason?: string; prepare?: (box: Locator) => Promise<void> } = {},
) {
  await page.getByRole("button", { name: button, exact: true }).click();
  const box = page.getByRole("dialog");
  if (reason) {
    await box.getByRole("combobox", { name: /Reason code/ }).click();
    await page.getByRole("option", { name: reason }).click();
  }
  if (prepare) await prepare(box);
  await box.getByRole("button", { name: "Review" }).click();
  const key = box.getByRole("button", { name: "Use security key" });
  const confirmButton = box.getByRole("button", { name: confirm, exact: true });
  await expect(key.or(confirmButton)).toBeVisible();
  if (await key.isVisible()) await key.click();
  await confirmButton.click();
  return box;
}

async function done(box: Locator) {
  await expect(box.getByText("Done. Recorded in the audit log.")).toBeVisible();
  await box.getByRole("button", { name: "Close" }).first().click();
}

const stamp = Date.now().toString(36);
const OPERATOR = `sf124-operator-${stamp}@e2e.example`;
const PERMISSIONS = [
  "sponsors.applications.read",
  "sponsors.applications.claim",
  "sponsors.applications.request_changes",
  "sponsors.applications.approve",
  "sponsors.applications.reject",
  "sponsors.applications.read_files",
  "sponsors.restrict",
];

test.use({ baseURL: "http://localhost:3100" });

test("SF-124 sponsor application review against the real backend", async ({
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

  const approve = applicant(`sf124-a-${stamp}@e2e.example`, `SF124 Approve ${stamp}`, true);
  const reject = applicant(`sf124-r-${stamp}@e2e.example`, `SF124 Reject ${stamp}`);
  const changes = applicant(`sf124-c-${stamp}@e2e.example`, `SF124 Changes ${stamp}`);
  const race = applicant(`sf124-e-${stamp}@e2e.example`, `SF124 Race ${stamp}`);
  const unknown = applicant(`sf124-u-${stamp}@e2e.example`, `SF124 Unknown ${stamp}`);
  const operatorId = operatorAccount(OPERATOR);

  await test.step("F: an applicant is not an operator; nothing of the review shows", async () => {
    const own = await otherSession(browser, approve.email);
    await own.goto("/en/admin/sponsors");
    await expect(own.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await own.goto(`/en/admin/sponsors/${approve.id}`);
    await expect(own.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await expect(own.locator("body")).not.toContainText(reject.company);
    await own.context().close();
  });

  bootstrap(operatorId, PERMISSIONS, info.outputDir);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");

  await test.step("A: the queue lists the real submissions; filter; open one", async () => {
    await emailSignIn(
      page,
      OPERATOR,
      `/en/login?returnTo=${encodeURIComponent("/admin/sponsors")}`,
    );
    await page.getByRole("button", { name: "Register keys" }).click();
    const first = await securityKey(cdp);
    await page.getByRole("button", { name: "Register first key" }).click();
    await expect(page.getByRole("heading", { name: "Now your backup key" })).toBeVisible();
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: first });
    await securityKey(cdp);
    await page.getByRole("button", { name: "Register backup key" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((url) => url.pathname === "/en/admin/sponsors");

    for (const application of [approve, reject, changes, race, unknown]) {
      await expect(page.locator(`[data-application="${application.id}"]`)).toContainText(
        application.company,
      );
    }
    await page.getByRole("combobox", { name: "Status" }).click();
    await page.getByRole("option", { name: "Approved" }).click();
    await expect(page.getByText("No applications match")).toBeVisible();
    await page.getByRole("combobox", { name: "Status" }).click();
    await page.getByRole("option", { name: "Submitted" }).click();
    await page.getByRole("link", { name: approve.company }).click();
    await page.waitForURL((url) => url.pathname === `/en/admin/sponsors/${approve.id}`);
    await expect(page.getByRole("region", { name: "Submitted answers" })).toContainText(
      approve.company,
    );
    expect(audits("sponsor_applications.detail", approve.id)).toBeGreaterThanOrEqual(1);
  });

  await test.step("G: a submitted document downloads once, through a short link, recorded", async () => {
    const link = page.waitForRequest((request) => request.url().includes(":4566/"));
    await page.route(/127\.0\.0\.1:4566\//, (route) =>
      route.fulfill({ status: 200, body: "ok", contentType: "text/plain" }),
    );
    await page.getByRole("button", { name: "Download" }).click();
    const request = await link;
    expect(new URL(request.url()).pathname).toContain(approve.id);
    await page.unroute(/127\.0\.0\.1:4566\//);
    expect(
      n(
        `SELECT count(*) FROM operator_audit_events WHERE action = 'sponsor_application.file_downloaded' AND outcome = 'allowed'`,
      ),
    ).toBe(1);
    await expect(page.locator("body")).not.toContainText("X-Amz");
  });

  await test.step("B: claim, then approve: the organization and the owner exist, nothing else", async () => {
    await page.goto(`/en/admin/sponsors/${approve.id}`);
    await done(await act(page, "Claim", "Claim"));
    await expect(page.locator("[data-review-application]")).toHaveAttribute(
      "data-application-status",
      "under_review",
    );
    const box = await act(page, "Approve", "Approve");
    await done(box);
    await expect(page.locator("[data-review-application]")).toHaveAttribute(
      "data-application-status",
      "approved",
    );
    await expect(page.getByRole("region", { name: "Organization" })).toContainText("Active");

    expect(status(approve.id)).toBe("approved");
    expect(organizations(approve.id)).toBe(1);
    expect(
      sql(
        `SELECT m.role || ':' || m.status FROM sponsor_workspace_memberships m JOIN sponsor_organizations o ON o.id = m.organization_id WHERE o.source_application_id = '${approve.id}'`,
      ),
    ).toBe(`owner:active`);
    expect(
      sql(
        `SELECT m.user_id FROM sponsor_workspace_memberships m JOIN sponsor_organizations o ON o.id = m.organization_id WHERE o.source_application_id = '${approve.id}'`,
      ),
    ).toBe(approve.user);
    expect(audits("sponsor_application.approve", approve.id)).toBe(1);
    expect(
      n(
        `SELECT count(*) FROM sponsor_application_notifications WHERE application_id = '${approve.id}' AND kind = 'application_approved'`,
      ),
    ).toBe(1);
  });

  await test.step("H: suspend, then reinstate the organization; both recorded", async () => {
    await done(await act(page, "Suspend organization", "Suspend", { reason: "Policy concern" }));
    await expect(page.getByRole("region", { name: "Organization" })).toContainText("Suspended");
    expect(
      sql(`SELECT status FROM sponsor_organizations WHERE source_application_id = '${approve.id}'`),
    ).toBe("suspended");
    expect(status(approve.id)).toBe("approved");

    await done(
      await act(page, "Reinstate organization", "Reinstate", { reason: "Concern resolved" }),
    );
    expect(
      sql(`SELECT status FROM sponsor_organizations WHERE source_application_id = '${approve.id}'`),
    ).toBe("active");
    expect(audits("sponsor_application.suspend_organization", approve.id)).toBe(1);
    expect(audits("sponsor_application.reinstate_organization", approve.id)).toBe(1);
  });

  await test.step("C: reject: final, nothing created", async () => {
    await page.goto(`/en/admin/sponsors/${reject.id}`);
    await done(await act(page, "Claim", "Claim"));
    await done(await act(page, "Reject…", "Reject", { reason: "Not a business" }));
    await expect(page.locator("[data-review-application]")).toHaveAttribute(
      "data-application-status",
      "rejected",
    );
    expect(status(reject.id)).toBe("rejected");
    expect(organizations(reject.id)).toBe(0);
    expect(audits("sponsor_application.reject", reject.id)).toBe(1);
  });

  await test.step("D: request changes: the applicant's open request, nothing approved", async () => {
    await page.goto(`/en/admin/sponsors/${changes.id}`);
    await done(await act(page, "Claim", "Claim"));
    await done(
      await act(page, "Request changes", "Send request", {
        reason: "Missing information",
        prepare: async (box) => {
          await box.getByRole("checkbox", { name: "Goals" }).click();
          await box
            .getByRole("textbox", { name: /Message to the applicant/ })
            .fill("Which events?");
        },
      }),
    );
    expect(status(changes.id)).toBe("changes_requested");
    expect(
      sql(
        `SELECT fields::text || '|' || message FROM sponsor_application_change_requests WHERE application_id = '${changes.id}' AND resolved_at IS NULL`,
      ),
    ).toBe("{goals}|Which events?");
    expect(organizations(changes.id)).toBe(0);
    expect(
      n(
        `SELECT count(*) FROM sponsor_application_notifications WHERE application_id = '${changes.id}' AND kind = 'changes_requested'`,
      ),
    ).toBe(1);
  });

  await test.step("E: a stale tab can't decide after another tab approved; it shows the truth", async () => {
    await page.goto(`/en/admin/sponsors/${race.id}`);
    await done(await act(page, "Claim", "Claim"));
    const stale = await page.context().newPage();
    await stale.goto(`/en/admin/sponsors/${race.id}`);
    await expect(stale.locator("[data-review-application]")).toHaveAttribute(
      "data-application-status",
      "under_review",
    );

    await page.reload();
    await done(await act(page, "Approve", "Approve"));

    await stale.getByRole("button", { name: "Reject…", exact: true }).click();
    const box = stale.getByRole("dialog");
    await box.getByRole("combobox", { name: /Reason code/ }).click();
    await stale.getByRole("option", { name: "Not a business" }).click();
    await box.getByRole("button", { name: "Review" }).click();
    await expect(box.getByText(/Someone else changed this application first/)).toBeVisible();
    await box.getByRole("button", { name: "Reload" }).click();
    await expect(stale.locator("[data-review-application]")).toHaveAttribute(
      "data-application-status",
      "approved",
    );
    await stale.close();

    expect(status(race.id)).toBe("approved");
    expect(organizations(race.id)).toBe(1);
    expect(audits("sponsor_application.reject", race.id)).toBe(0);
  });

  await test.step("J: an approval whose answer is lost: checking reconciles, once", async () => {
    await page.goto(`/en/admin/sponsors/${unknown.id}`);
    await done(await act(page, "Claim", "Claim"));
    // The request reaches the backend and commits; only its answer is lost.
    let dropped = false;
    await page.route(
      `**/api/v1/admin/sponsor-applications/${unknown.id}/approve`,
      async (route) => {
        if (dropped) return route.continue();
        dropped = true;
        await route.fetch();
        await route.abort("connectionreset");
      },
    );
    const box = await act(page, "Approve", "Approve");
    await expect(box.getByText(/We don’t know whether this went through/)).toBeVisible();
    expect(status(unknown.id)).toBe("approved");
    await box.getByRole("button", { name: "Check the outcome" }).click();
    await done(box);
    await page.unroute(`**/api/v1/admin/sponsor-applications/${unknown.id}/approve`);

    expect(organizations(unknown.id)).toBe(1);
    expect(audits("sponsor_application.approve", unknown.id)).toBe(1);
  });

  await test.step("K: at 390 px the queue reads without page overflow; decisions are hidden", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/admin/sponsors");
    await expect(page.locator(`[data-application="${approve.id}"]`)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await page.goto(`/en/admin/sponsors/${approve.id}`);
    await expect(page.getByText("High-risk actions need a larger screen")).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await test.step("I: another person signs in on this browser: none of the review shows", async () => {
    await page.goto("/en/app");
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await page.waitForURL(/\/en\/login/);
    await emailSignIn(page, reject.email, "/en/login");
    await page.waitForURL((url) => !url.pathname.endsWith("/login/code"));
    await page.goto(`/en/admin/sponsors/${approve.id}`);
    await expect(page.getByRole("heading", { name: "We can’t find that page" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(approve.company);
  });
});
