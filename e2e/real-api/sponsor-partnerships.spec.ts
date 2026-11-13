import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test, type Browser, type CDPSession, type Page } from "@playwright/test";

/*
 * SF-131: the partner portal's partnership pages on the production build against a
 * real simplefit-api (SF-130) and PostgreSQL (playwright.real-api.config.ts), nothing
 * mocked. Sponsor members use the web pages only. Organization A is made by a real
 * SF-116 approval of a submitted application; organization B, the extra member and
 * the revocation come from `mix sponsors.fixture` (the local fixture authority,
 * development builds only). SimpleFit's side of the review has no web console yet, so
 * the operator signs in on the web, registers virtual security keys and passes the key
 * check (Chrome DevTools Protocol, no bypass), then sends the SF-111 commands with the
 * page's own session: claim, request changes, accept, and suspending the organization.
 * Results are checked in the disposable database. Setup: e2e/real-api/README.md,
 * "Sponsor partnerships"; every run needs a freshly migrated disposable database.
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

function account(email: string): string {
  const out = mix(["run", resolve("e2e/real-api/fixtures/control-plane-seed.exs"), "user", email]);
  const id = /USER ([0-9a-f-]{36})/.exec(out)?.[1];
  if (!id) throw new Error("no account was created");
  return id;
}

function applicant(email: string, company: string) {
  const out = mix([
    "run",
    resolve("e2e/real-api/fixtures/sponsor-review-seed.exs"),
    "applicant",
    email,
    company,
  ]);
  const match = /APPLICATION ([0-9a-f-]{36}) USER ([0-9a-f-]{36})/.exec(out);
  if (!match) throw new Error("no application was submitted");
  return { id: match[1]!, user: match[2]!, email, company };
}

function fixture(args: string[]): string {
  return mix(["sponsors.fixture", ...args]);
}

function provision(ownerId: string, name: string): string {
  fixture([
    "provision",
    "--owner-user-id",
    ownerId,
    "--legal-name",
    `${name} Sp. z o.o.`,
    "--display-name",
    name,
    "--country",
    "PL",
    "--contact-name",
    "Ada Nowak",
    "--contact-email",
    `contact-${Date.now()}@e2e.example`,
  ]);
  const id = sql(`SELECT id FROM sponsor_organizations WHERE display_name = '${name}'`);
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("no organization was provisioned");
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
  await page.waitForURL((url) => !url.pathname.endsWith("/login/code"));
}

/** A signed-in browser context of `email` (its own cookies), at `path`. */
async function member(browser: Browser, email: string, path: string) {
  const context = await browser.newContext({ baseURL: "http://localhost:3100" });
  await context.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());
  const page = await context.newPage();
  await emailSignIn(page, email, `/en/login?returnTo=${encodeURIComponent(path)}`);
  await page.goto(`/en${path}`);
  return page;
}

type Reply = { status: number; body: Record<string, unknown> | null };

/**
 * One operator API call with the operator page's own session (its refresh cookie gives
 * this session's access token; the key check is bound to the session).
 */
async function operatorCall(page: Page, method: string, path: string, body?: object) {
  return page.evaluate(
    async ({ api, method, path, body }): Promise<Reply> => {
      const refreshed = await fetch(`${api}/api/auth/session/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-simplefit-csrf": "1" },
        body: "{}",
      });
      if (!refreshed.ok) return { status: refreshed.status, body: { refresh: "failed" } };
      const { access_token } = (await refreshed.json()) as { access_token: string };
      const response = await fetch(`${api}${path}`, {
        method,
        headers: { "content-type": "application/json", authorization: `Bearer ${access_token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        body: (await response.json().catch(() => null)) as Record<string, unknown> | null,
      };
    },
    { api: API_URL, method, path, body },
  );
}

const revisionOf = (reply: Reply, key: "proposal" | "application") =>
  ((reply.body?.[key] as { revision: number } | undefined)?.revision ?? 0) as number;

/** An SF-111 action without confirmation (claim, request changes). */
async function act(page: Page, base: string, action: string, revision: number, params: object) {
  const reply = await operatorCall(page, "POST", `${base}/${action}`, {
    ...params,
    expected_revision: revision,
    operation_id: crypto.randomUUID(),
  });
  expect(reply.status, `${action}: ${JSON.stringify(reply.body)}`).toBe(200);
  return reply;
}

/** An SF-111 action that needs the preview's one-time confirmation. */
async function confirmed(page: Page, base: string, action: string, reason: string) {
  const preview = await operatorCall(page, "POST", `${base}/${action}/preview`, {
    reason_code: reason,
  });
  expect(preview.status, `${action} preview: ${JSON.stringify(preview.body)}`).toBe(200);
  const p = preview.body?.preview as {
    expected_revision: number;
    confirmation: { token: string };
  };
  const reply = await operatorCall(page, "POST", `${base}/${action}`, {
    reason_code: reason,
    expected_revision: p.expected_revision,
    operation_id: crypto.randomUUID(),
    confirmation_token: p.confirmation.token,
  });
  expect(reply.status, `${action}: ${JSON.stringify(reply.body)}`).toBe(200);
  return reply;
}

const stamp = Date.now().toString(36);
const OPERATOR = `sf131-operator-${stamp}@e2e.example`;
const PERMISSIONS = [
  "sponsors.applications.read",
  "sponsors.applications.claim",
  "sponsors.applications.approve",
  "sponsors.restrict",
  "sponsors.proposals.read",
  "sponsors.proposals.claim",
  "sponsors.proposals.request_changes",
  "sponsors.proposals.accept",
  "sponsors.proposals.decline",
];

test.use({ baseURL: "http://localhost:3100", navigationTimeout: 30_000, actionTimeout: 20_000 });

test("SF-131 partnership interests, opportunities and requests against the real backend", async ({
  page,
  browser,
  browserName,
}, info) => {
  test.skip(
    browserName !== "chromium" || info.project.name !== "chromium-1440",
    "virtual authenticators are Chrome DevTools Protocol only; one desktop pass",
  );
  test.setTimeout(600_000);
  await page
    .context()
    .route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());

  const a = applicant(`sf131-owner-${stamp}@e2e.example`, `SF131 Haymaker ${stamp}`);
  const operatorId = account(OPERATOR);
  const viewerEmail = `sf131-member-${stamp}@e2e.example`;
  const viewerId = account(viewerEmail);
  const ownerBEmail = `sf131-other-${stamp}@e2e.example`;
  const orgB = provision(account(ownerBEmail), `SF131 Northside ${stamp}`);
  bootstrap(operatorId, PERMISSIONS, info.outputDir);

  // The operator: real sign-in, two registered virtual keys, the key check.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await emailSignIn(
    page,
    OPERATOR,
    `/en/admin/login?returnTo=${encodeURIComponent("/admin/sponsors")}`,
  );
  const first = await securityKey(cdp);
  await page.getByRole("button", { name: "Register first key" }).click();
  await expect(page.getByRole("heading", { name: "Now your backup key" })).toBeVisible();
  await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: first });
  await securityKey(cdp);
  await page.getByRole("button", { name: "Register backup key" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Use security key" }).click();
  await page.waitForURL((url) => url.pathname === "/en/admin/sponsors");

  // Organization A from a real approval (SF-116): claim, then confirmed approval.
  const app = `/api/v1/admin/sponsor-applications/${a.id}`;
  const shown = await operatorCall(page, "GET", app);
  await act(page, app, "claim", revisionOf(shown, "application"), {
    reason_code: "review_started",
  });
  await confirmed(page, app, "approve", "review_complete");
  const orgA = sql(`SELECT id FROM sponsor_organizations WHERE source_application_id = '${a.id}'`);
  expect(orgA).toMatch(/^[0-9a-f-]{36}$/);
  fixture(["add-member", "--organization-id", orgA, "--user-id", viewerId, "--role", "member"]);
  // A second active organization keeps the owner's partner portal capability once A is
  // suspended (SF-117: a suspended organization stays readable by link, never chosen).
  provision(a.user, `SF131 Second ${stamp}`);
  const organizationsBefore = n("SELECT count(*) FROM sponsor_organizations");

  const owner = await member(browser, a.email, `/sponsor/${orgA}/interests`);

  await test.step("interests: the application's answers, then real preferences that persist", async () => {
    await expect(
      owner.getByRole("heading", { level: 1, name: "Partnership interests" }),
    ).toBeVisible();
    const fromApplication = owner.getByRole("region", { name: "From your application" });
    await expect(fromApplication.getByText("Support amateur boxing events.")).toBeVisible();
    await owner.getByRole("button", { name: "Add interests" }).click();
    await owner.getByRole("checkbox", { name: "Content" }).check({ force: true });
    await owner.getByRole("radio", { name: "Global" }).check({ force: true });
    await owner.getByRole("textbox", { name: "Goals" }).fill("Grow amateur boxing in spring.");
    await owner.getByRole("button", { name: "Save interests" }).click();
    const current = owner.getByRole("region", { name: "Your current interests" });
    await expect(current.getByText("Grow amateur boxing in spring.")).toBeVisible();
    await owner.reload();
    await expect(current.getByText("Grow amateur boxing in spring.")).toBeVisible();
    expect(
      sql(
        `SELECT revision || ':' || goals FROM sponsor_partnership_preferences WHERE organization_id = '${orgA}'`,
      ),
    ).toBe("1:Grow amateur boxing in spring.");
    // The application's snapshot is untouched.
    expect(
      n(`SELECT count(*) FROM sponsor_application_submissions WHERE application_id = '${a.id}'`),
    ).toBe(1);
  });

  await test.step("a stale copy in another tab is refused, nothing overwritten", async () => {
    const other = await owner.context().newPage();
    await other.goto(`/en/sponsor/${orgA}/interests`);
    await other.getByRole("button", { name: "Edit" }).click();
    await owner.getByRole("button", { name: "Edit" }).click();
    await owner.getByRole("textbox", { name: "Goals" }).fill("Saved first.");
    await owner.getByRole("button", { name: "Save interests" }).click();
    await expect(owner.getByText("Saved first.")).toBeVisible();
    await other.getByRole("textbox", { name: "Goals" }).fill("Saved from a stale copy.");
    await other.getByRole("button", { name: "Save interests" }).click();
    await expect(other.locator('[data-slot="notice"][role="alert"]')).toContainText(
      "changed this in the meantime",
    );
    await other.getByRole("button", { name: "Load the latest" }).click();
    await expect(other.getByText("Saved first.")).toBeVisible();
    expect(
      sql(`SELECT goals FROM sponsor_partnership_preferences WHERE organization_id = '${orgA}'`),
    ).toBe("Saved first.");
    await other.close();
  });

  await test.step("opportunities: the backend's no-inventory answer, nothing invented", async () => {
    await owner.goto(`/en/sponsor/${orgA}/opportunities`);
    await expect(
      owner.getByRole("heading", { name: "No sponsorship opportunities" }),
    ).toBeVisible();
    await expect(owner.getByRole("button", { name: /apply|partner now/i })).toHaveCount(0);
  });

  let requestId = "";
  await test.step("a request: draft, submitted, persisted across a reload", async () => {
    await owner.goto(`/en/sponsor/${orgA}/requests`);
    await expect(owner.getByText("No requests yet")).toBeVisible();
    await owner.getByRole("link", { name: "New request" }).click();
    await owner.getByRole("textbox", { name: /Title/ }).fill("Spring amateur events");
    await owner.getByRole("checkbox", { name: "Sponsored events" }).check({ force: true });
    await owner.getByRole("radio", { name: "Global" }).check({ force: true });
    await owner
      .getByRole("textbox", { name: /What would you like to explore/ })
      .fill("Support amateur boxing nights in spring.");
    await owner.getByRole("button", { name: "Save draft" }).click();
    await owner.waitForURL((url) => /\/requests\/[0-9a-f-]{36}$/.test(url.pathname));
    requestId = owner.url().split("/").pop()!;
    await expect(owner.locator('[data-proposal-status="draft"]')).toBeVisible();
    await owner.getByRole("button", { name: "Submit to SimpleFit" }).click();
    await expect(owner.locator('[data-proposal-status="submitted"]')).toBeVisible();
    await owner.reload();
    await expect(owner.locator('[data-proposal-status="submitted"]')).toBeVisible();
    expect(sql(`SELECT status FROM sponsor_partnership_proposals WHERE id = '${requestId}'`)).toBe(
      "submitted",
    );
    expect(
      n(
        `SELECT count(*) FROM sponsor_partnership_proposal_submissions WHERE proposal_id = '${requestId}'`,
      ),
    ).toBe(1);
  });

  const viewer = await member(browser, viewerEmail, `/sponsor/${orgA}/requests`);
  await test.step("a member reads the same requests, read-only", async () => {
    await expect(viewer.getByRole("link", { name: /Spring amateur events/ })).toBeVisible();
    await expect(viewer.getByRole("link", { name: "New request" })).toHaveCount(0);
    await viewer.goto(`/en/sponsor/${orgA}/requests/${requestId}`);
    await expect(viewer.locator('[data-proposal-status="submitted"]')).toBeVisible();
    await expect(viewer.getByRole("button", { name: /Submit|Withdraw|Edit/ })).toHaveCount(0);
    await viewer.goto(`/en/sponsor/${orgA}/interests`);
    await expect(viewer.getByText("Saved first.")).toBeVisible();
    await expect(viewer.getByRole("button", { name: "Edit" })).toHaveCount(0);
  });

  const proposalPath = `/api/v1/admin/sponsor-proposals/${requestId}`;
  await test.step("changes requested by SimpleFit, answered and resubmitted", async () => {
    const read = await operatorCall(page, "GET", proposalPath);
    expect(read.status).toBe(200);
    const claimed = await act(page, proposalPath, "claim", revisionOf(read, "proposal"), {
      reason_code: "review_started",
    });
    await act(page, proposalPath, "request-changes", revisionOf(claimed, "proposal"), {
      reason_code: "unclear_request",
      fields: ["summary"],
      message: "Which cities and clubs do you have in mind?",
    });
    await owner.goto(`/en/sponsor/${orgA}/requests/${requestId}`);
    await expect(owner.getByText("Which cities and clubs do you have in mind?")).toBeVisible();
    await expect(owner.getByText("Answers you can change: Summary")).toBeVisible();
    await owner.getByRole("button", { name: "Edit" }).click();
    await expect(owner.getByRole("textbox", { name: /Title/ })).toHaveAttribute("readonly", "");
    await owner
      .getByRole("textbox", { name: /What would you like to explore/ })
      .fill("Boxing nights in Warsaw and Kraków with two amateur clubs.");
    await owner.getByRole("button", { name: "Save changes" }).click();
    await owner.getByRole("button", { name: "Submit again" }).click();
    await expect(owner.locator('[data-proposal-status="submitted"]')).toBeVisible();
    await expect(owner.getByText(/· SimpleFit/).first()).toBeVisible();
    expect(
      n(
        `SELECT count(*) FROM sponsor_partnership_proposal_submissions WHERE proposal_id = '${requestId}'`,
      ),
    ).toBe(2);
    expect(
      n(
        `SELECT count(*) FROM sponsor_partnership_change_requests WHERE proposal_id = '${requestId}' AND resolved_at IS NOT NULL`,
      ),
    ).toBe(1);
  });

  await test.step("accepted for follow-up: final, nonbinding, nothing created", async () => {
    const read = await operatorCall(page, "GET", proposalPath);
    await act(page, proposalPath, "claim", revisionOf(read, "proposal"), {
      reason_code: "review_started",
    });
    await confirmed(page, proposalPath, "accept", "follow_up_planned");
    await owner.reload();
    await expect(owner.getByText("Accepted for follow-up").first()).toBeVisible();
    await expect(
      owner.getByText(
        "SimpleFit will follow up with you about this request. Nothing is agreed, booked or paid.",
      ),
    ).toBeVisible();
    await expect(owner.getByRole("button", { name: /Submit|Withdraw|Edit/ })).toHaveCount(0);
    expect(n("SELECT count(*) FROM sponsor_organizations")).toBe(organizationsBefore);
  });

  await test.step("withdrawal asks first and is final", async () => {
    await owner.goto(`/en/sponsor/${orgA}/requests/new`);
    await owner.getByRole("textbox", { name: /Title/ }).fill("Gym equipment");
    await owner.getByRole("button", { name: "Save draft" }).click();
    await owner.waitForURL((url) => /\/requests\/[0-9a-f-]{36}$/.test(url.pathname));
    const id = owner.url().split("/").pop()!;
    await expect(owner.getByRole("button", { name: "Submit to SimpleFit" })).toBeDisabled();
    await owner.getByRole("button", { name: "Withdraw" }).click();
    const dialog = owner.getByRole("dialog", { name: "Withdraw this request?" });
    await dialog.getByRole("button", { name: "Withdraw request" }).click();
    await expect(owner.locator('[data-proposal-status="withdrawn"]')).toBeVisible();
    expect(sql(`SELECT status FROM sponsor_partnership_proposals WHERE id = '${id}'`)).toBe(
      "withdrawn",
    );
  });

  await test.step("organization B sees none of A, and A's ids show nothing there", async () => {
    const other = await member(browser, ownerBEmail, `/sponsor/${orgA}/requests`);
    await expect(
      other.getByRole("heading", { level: 1, name: "Organization not available" }),
    ).toBeVisible();
    await expect(other.locator("body")).not.toContainText("Spring amateur events");
    await other.goto(`/en/sponsor/${orgB}/requests/${requestId}`);
    await expect(other.getByText("Request not found")).toBeVisible();
    await other.goto(`/en/sponsor/${orgB}/requests`);
    await expect(other.getByText("No requests yet")).toBeVisible();
    await other.goto(`/en/sponsor/${orgB}/interests`);
    await expect(other.getByText("Saved first.")).toHaveCount(0);
    await other.context().close();
  });

  await test.step("a suspension makes the open form read-only: the save is refused", async () => {
    await owner.goto(`/en/sponsor/${orgA}/interests`);
    await owner.getByRole("button", { name: "Edit" }).click();
    await owner.getByRole("textbox", { name: "Goals" }).fill("After the suspension.");
    await confirmed(
      page,
      `/api/v1/admin/sponsor-applications/${a.id}`,
      "suspend-organization",
      "policy_concern",
    );
    await owner.getByRole("button", { name: "Save interests" }).click();
    await expect(owner.locator('[data-slot="notice"][role="alert"]')).toContainText(
      "read-only right now",
    );
    await owner.reload();
    await expect(owner.getByText("This organization is suspended.")).toBeVisible();
    await expect(owner.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await owner.goto(`/en/sponsor/${orgA}/requests`);
    await expect(owner.getByRole("link", { name: "New request" })).toHaveCount(0);
    expect(
      sql(`SELECT goals FROM sponsor_partnership_preferences WHERE organization_id = '${orgA}'`),
    ).toBe("Saved first.");
  });

  await test.step("a revoked member loses the portal on the next read", async () => {
    const membership = sql(
      `SELECT id FROM sponsor_workspace_memberships WHERE organization_id = '${orgA}' AND user_id = '${viewerId}'`,
    );
    fixture(["revoke-membership", "--membership-id", membership, "--reason", "e2e_check"]);
    await viewer.goto(`/en/sponsor/${orgA}/requests`);
    // With no portal left, the gate sends them where the entry says (SF-117: here their
    // Fighter home); with one left, SPE1 says not available. Either way nothing of A shows.
    await expect
      .poll(async () =>
        viewer.url().includes(`/sponsor/${orgA}`)
          ? viewer
              .getByRole("heading", { level: 1, name: "Organization not available" })
              .isVisible()
          : true,
      )
      .toBe(true);
    await expect(viewer.locator("body")).not.toContainText("Spring amateur events");
  });
});
