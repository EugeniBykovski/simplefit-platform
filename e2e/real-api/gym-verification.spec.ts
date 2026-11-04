import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, type APIRequestContext, type Browser, type Page, test } from "@playwright/test";

/*
 * SF-103: business verification (OG7), community defaults (OG13) and
 * go-live readiness (OG14) on the production build against the real SF-103
 * API and PostgreSQL (playwright.real-api.config.ts), journeys A–AD.
 *
 * The API runs on a disposable database (`e2e` in its name) with its
 * storage adapter pointed at a local S3-compatible server
 * (`E2E_STORAGE=s3`, private bucket, CORS for the web origin): the browser
 * really uploads the document to the presigned URL and the backend really
 * reads it back with a presigned HEAD. Operator review is the real
 * `mix gyms.verification` task on the same database (there is no operator
 * HTTP route). Stripe is disabled; nothing reaches a provider.
 *
 * Browser: registration, gym creation, the settings tabs, the draft, the
 * upload, submission, the statuses, community, go-live, sign-out and a
 * second account in the same browser. API (each person's own session):
 * staff joining, refusals, a member, a class and a booking. Backend checks
 * read the disposable database and the API's log.
 */

const API_URL = process.env.E2E_REAL_API_URL ?? "";
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";
const API_LOG = process.env.E2E_API_LOG ?? "";
/** The storage settings the API was started with (local emulator; not credentials). */
const STORAGE_ENV = {
  AWS_S3_BUCKET: process.env.E2E_S3_BUCKET ?? "",
  AWS_REGION: process.env.E2E_S3_REGION ?? "us-east-1",
  AWS_ACCESS_KEY_ID: process.env.E2E_S3_ACCESS_KEY_ID ?? "",
  AWS_SECRET_ACCESS_KEY: process.env.E2E_S3_SECRET_ACCESS_KEY ?? "",
  AWS_S3_ENDPOINT: process.env.E2E_S3_ENDPOINT ?? "",
};

test.skip(!API_URL, "E2E_REAL_API_URL is not set: the real-backend journey needs a running API");
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
const mixEnv = () => ({ ...process.env, MIX_ENV: "dev", DATABASE_URL: disposableDatabase() });

function emailedCode(address: string): string {
  const out = execFileSync("mix", ["e2e.email_code", address], {
    cwd: API_DIR,
    env: mixEnv(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const code = out.split("\n").find((line) => /^\d{6}$/.test(line.trim()));
  if (!code) throw new Error("no code was emailed");
  return code.trim();
}

/** The operator review task on the same database: `{ ok, out }`. */
function operator(...args: string[]) {
  const run = spawnSync("mix", ["gyms.verification", ...args], {
    cwd: API_DIR,
    env: { ...mixEnv(), ...STORAGE_ENV },
    encoding: "utf8",
  });
  return { ok: run.status === 0, out: `${run.stdout}\n${run.stderr}` };
}

const resetRateLimits = () => sql("DELETE FROM auth_rate_limits; DELETE FROM rate_limit_events");
const count = (table: string, where = "true") =>
  Number(sql(`SELECT count(*) FROM ${table} WHERE ${where}`));
const heading = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name });
const codeInput = (page: Page) => page.locator('[data-slot="code-input"]');

function sessionOf(page: Page) {
  let bearer = "";
  page.on("request", (request) => {
    const header = request.headers().authorization;
    if (request.url().startsWith(API_URL) && header) bearer = header;
  });
  return () => bearer;
}

async function call(
  request: APIRequestContext,
  bearer: string,
  method: "GET" | "PATCH" | "PUT" | "POST",
  path: string,
  data?: unknown,
) {
  const response = await request.fetch(`${API_URL}${path}`, {
    method,
    headers: { authorization: bearer, "content-type": "application/json" },
    data: data === undefined ? undefined : JSON.stringify(data),
  });
  const text = await response.text();
  return {
    status: response.status(),
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

async function go(page: Page, path: string) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await page.goto(path);
      return;
    } catch (error) {
      if (attempt >= 3 || !/interrupted|NS_BINDING_ABORTED|frame was detached/.test(String(error)))
        throw error;
      await page.waitForLoadState();
    }
  }
}

async function newPage(browser: Browser) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    timezoneId: "Europe/Warsaw",
  });
  const page = await context.newPage();
  await page.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());
  return page;
}

async function register(page: Page, email: string, fullName: string, intent?: string) {
  resetRateLimits();
  await go(page, `/en/signup/account${intent ? `?intent=${intent}` : ""}`);
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/en/signup/verify");
  await codeInput(page).pressSequentially(emailedCode(email));
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/account");
  await page.getByLabel("Full name").fill(fullName);
  await page.getByLabel("Date of birth").fill("1990-05-17");
  await page.getByRole("checkbox", { name: /Terms of Service/ }).click();
  await page.getByRole("checkbox", { name: /Privacy Policy/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => url.pathname !== "/en/app/onboarding/account");
}

async function signIn(page: Page, email: string) {
  resetRateLimits();
  await go(page, "/en/login");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await page.waitForURL((url) => url.pathname === "/en/login/code");
  await codeInput(page).pressSequentially(emailedCode(email));
  await page.waitForURL((url) => !url.pathname.startsWith("/en/login"));
}

async function registerApi(request: APIRequestContext, email: string, fullName: string) {
  resetRateLimits();
  const started = await request.post(`${API_URL}/api/auth/email/registrations`, {
    data: { email },
  });
  expect(started.status()).toBe(202);
  const { registration_token } = (await started.json()) as { registration_token: string };
  const verified = await request.post(`${API_URL}/api/auth/email/registrations/verify`, {
    data: { registration_token, code: emailedCode(email), refresh_token_transport: "body" },
  });
  expect(verified.status()).toBe(200);
  const bearer = `Bearer ${((await verified.json()) as { access_token: string }).access_token}`;
  expect(
    (
      await call(request, bearer, "PATCH", "/api/v1/me/account-profile", {
        full_name: fullName,
        date_of_birth: "1991-03-02",
        accept_terms: true,
        accept_privacy: true,
      })
    ).status,
  ).toBe(200);
  expect(
    (await call(request, bearer, "POST", "/api/v1/me/account-profile/complete-registration", {}))
      .status,
  ).toBe(200);
  return bearer;
}

async function joinStaff(
  request: APIRequestContext,
  ownerBearer: string,
  staffBearer: string,
  gymId: string,
  email: string,
  role: "manager" | "coach" | "front_desk",
) {
  const invited = await call(
    request,
    ownerBearer,
    "POST",
    `/api/v1/gyms/${gymId}/staff-invitations`,
    {
      email,
      role,
    },
  );
  expect(invited.status).toBe(201);
  const id = (invited.body.invitation as { invitation_id: string }).invitation_id;
  expect(
    (await call(request, staffBearer, "POST", `/api/v1/me/staff-invitations/${id}/accept`)).status,
  ).toBe(200);
}

async function createGymInBrowser(page: Page, name: string) {
  await expect(heading(page, "Gym name & type")).toBeVisible();
  await page.getByRole("textbox", { name: "Gym name" }).fill(name);
  await page.getByText("Boxing club", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Location")).toBeVisible();
  await page.getByRole("combobox", { name: "Country" }).click();
  await page.getByRole("combobox", { name: "Search countries" }).fill("Poland");
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "City" }).fill("Warsaw");
  await page.getByRole("textbox", { name: "Address", exact: true }).fill("ul. Ząbkowska 5");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Branding")).toBeVisible();
  await page.getByRole("button", { name: "Create gym" }).click();
  await expect(heading(page, `${name} is created.`)).toBeVisible();
}

/** A small, real PDF document (the test's own file, not a fake approval). */
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

const run = randomUUID().slice(0, 8);
const OWNER = `sf103-owner-${run}@example.com`;
const MANAGER = `sf103-manager-${run}@example.com`;
const COACH = `sf103-coach-${run}@example.com`;
const DESK = `sf103-desk-${run}@example.com`;
const MEMBER = `sf103-member-${run}@example.com`;
const RIVAL = `sf103-rival-${run}@example.com`;
const GYM = `Ring Verify ${run}`;
const LEGAL = `Ring Verify ${run} Sp. z o.o.`;
const REGISTRATION = `KRS${run}`;
const FILE = `registry-extract-${run}.pdf`;
/** The operator on the API's GYM_VERIFICATION_OPERATORS list (SF-104: review is fail-closed). */
const REVIEWER = process.env.E2E_OPERATOR ?? "reviewer@trust.simplefit.test";

const state = {
  gymId: "",
  appId: "",
  ownerBearer: "",
  managerBearer: "",
  occurrenceId: "",
  counts: "",
};

const settingsUrl = (tab: string) => `/en/app/gyms/${state.gymId}/settings/${tab}`;
const only = () => test.skip(test.info().project.name !== "chromium-1440", "one journey per run");

test("A–F: the owner creates a gym, drafts, uploads to storage and submits; nothing self-approves", async ({
  browser,
}) => {
  only();
  const page = await newPage(browser);
  const bearer = sessionOf(page);

  // A, B: a real gym whose setup completes.
  await register(page, OWNER, "Yauheni Bykovski", "gym");
  await go(page, "/en/app/onboarding/gym");
  await createGymInBrowser(page, GYM);
  state.gymId = sql(`SELECT id FROM gyms WHERE name = '${GYM}'`);
  expect(sql(`SELECT setup_status FROM gyms WHERE id = '${state.gymId}'`)).toBe("completed");

  // C: the settings sections open verification.
  await go(page, `/en/app/gyms/${state.gymId}/settings`);
  await page
    .getByRole("link", { name: /Verification/ })
    .last()
    .click();
  await page.waitForURL((url) => url.pathname === settingsUrl("verification"));
  state.ownerBearer = bearer();
  const status = page.getByRole("region", { name: "Business verification" });
  await expect(status.getByText("Not started", { exact: true })).toBeVisible();
  expect(count("gym_verification_applications", `gym_id = '${state.gymId}'`)).toBe(0);

  // D: a draft, saved by the backend.
  await page.getByLabel("Legal name").fill(LEGAL);
  await page.getByRole("combobox", { name: "Country of registration" }).click();
  await page.getByRole("combobox", { name: "Search countries" }).fill("Poland");
  await page.keyboard.press("Enter");
  await page.getByLabel("Registration number (optional)").fill(REGISTRATION);
  await page.getByLabel("City").fill("Warszawa");
  await page.getByRole("button", { name: "Save and start application" }).click();
  await expect(status.getByText("Draft", { exact: true })).toBeVisible();
  expect(
    sql(
      `SELECT status || '|' || revision || '|' || registration_country FROM gym_verification_applications WHERE gym_id = '${state.gymId}'`,
    ),
  ).toBe("draft|1|PL");
  state.appId = sql(`SELECT id FROM gym_verification_applications WHERE gym_id = '${state.gymId}'`);
  await expect(page.getByRole("button", { name: "Submit for review" })).toBeDisabled();

  // The draft survives a reload (nothing is kept in the browser).
  await page.reload();
  await expect(page.getByLabel("Legal name")).toHaveValue(LEGAL);

  // E: a real upload to the presigned URL, confirmed by the backend's HEAD.
  await page
    .locator("[data-document-input]")
    .setInputFiles({ name: FILE, mimeType: "application/pdf", buffer: PDF });
  await expect(page.locator("[data-document-state]").first()).toHaveAttribute(
    "data-document-state",
    "uploaded",
  );
  expect(
    sql(
      `SELECT status || '|' || byte_size || '|' || content_type FROM gym_verification_evidence WHERE application_id = '${state.appId}'`,
    ),
  ).toBe(`uploaded|${PDF.length}|application/pdf`);

  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(status.getByText("In review", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Legal name")).toBeDisabled();

  // F: a submission, never an approval.
  expect(sql(`SELECT status FROM gym_verification_applications WHERE id = '${state.appId}'`)).toBe(
    "submitted",
  );
  expect(
    count("gym_verification_events", `application_id = '${state.appId}' AND event = 'approved'`),
  ).toBe(0);
  expect(
    count("gym_verification_events", `application_id = '${state.appId}' AND event = 'submitted'`),
  ).toBe(1);

  // R (part): go-live shows the required prerequisite pending; nothing to publish.
  await page.getByRole("link", { name: "Go live" }).first().click();
  await page.waitForURL((url) => url.pathname === settingsUrl("go-live"));
  await expect(page.getByText("Some required steps aren't done yet.")).toBeVisible();
  await expect(
    page.locator('[data-check="business_verification"][data-check-status="pending"]'),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /publish/i })).toHaveCount(0);
});

test("G–H: staff cannot approve or reach the application; there is no approval route", async ({
  request,
}) => {
  only();
  state.managerBearer = await registerApi(request, MANAGER, "Ola Nowak");
  const coachBearer = await registerApi(request, COACH, "Cody Kowal");
  const deskBearer = await registerApi(request, DESK, "Fran Lis");
  await joinStaff(request, state.ownerBearer, state.managerBearer, state.gymId, MANAGER, "manager");
  await joinStaff(request, state.ownerBearer, coachBearer, state.gymId, COACH, "coach");
  await joinStaff(request, state.ownerBearer, deskBearer, state.gymId, DESK, "front_desk");
  const base = `/api/v1/gyms/${state.gymId}`;

  for (const bearer of [state.managerBearer, coachBearer, deskBearer]) {
    expect((await call(request, bearer, "GET", `${base}/business-verification`)).status).toBe(403);
    expect(
      (await call(request, bearer, "PUT", `${base}/business-verification`, { legal_name: "X" }))
        .status,
    ).toBe(403);
  }
  expect((await call(request, state.managerBearer, "GET", `${base}/go-live`)).status).toBe(200);
  expect((await call(request, coachBearer, "GET", `${base}/go-live`)).status).toBe(403);
  expect((await call(request, deskBearer, "GET", `${base}/go-live`)).status).toBe(403);

  // No route decides: not for staff, not for the owner, whatever the body says.
  for (const bearer of [state.ownerBearer, state.managerBearer]) {
    for (const suffix of ["/approve", "/decide", "/review", "/publish"]) {
      expect(
        (await call(request, bearer, "POST", `${base}/business-verification${suffix}`, {})).status,
      ).toBe(404);
    }
    expect(
      (await call(request, bearer, "PUT", `${base}/business-verification`, { status: "approved" }))
        .status,
    ).not.toBe(200);
  }

  // The operator path refuses gym staff and the owner: they are not on the
  // configured operator list (SF-104), and even a listed staff member would be
  // refused as not independent (API tests cover that case).
  for (const address of [OWNER, MANAGER, COACH]) {
    const refused = operator("approve", state.appId, "--revision", "4", "--operator", address);
    expect(refused.ok).toBe(false);
    expect(refused.out).toMatch(/forbidden|not_independent/);
  }
  expect(sql(`SELECT status FROM gym_verification_applications WHERE id = '${state.appId}'`)).toBe(
    "submitted",
  );
});

test("I–M: an independent operator reviews the stored document and approves; Stripe stays untouched", async ({
  browser,
  request,
}) => {
  only();
  // I: the operator's queue and the application.
  // SF-104: an address outside the configured operator list is never an operator.
  const impostor = operator("list", "--operator", `impostor-${run}@trust.simplefit.test`);
  expect(impostor.ok).toBe(false);
  expect(impostor.out).toContain("forbidden");
  const list = operator("list", "--operator", REVIEWER);
  expect(list.ok).toBe(true);
  expect(list.out).toContain(state.appId);
  const shown = operator("show", state.appId, "--operator", REVIEWER);
  expect(shown.out).toContain(LEGAL);
  expect(shown.out).toContain(FILE);

  // J: the stored document is the uploaded one, opened through a recorded link.
  const evidenceId = sql(
    `SELECT id FROM gym_verification_evidence WHERE application_id = '${state.appId}'`,
  );
  const link = operator("document-url", state.appId, evidenceId, "--operator", REVIEWER);
  expect(link.ok).toBe(true);
  const url = link.out.split("\n").find((line) => line.startsWith("http"))!;
  const stored = await request.get(url);
  expect(stored.status()).toBe(200);
  expect(Buffer.from(await stored.body()).equals(PDF)).toBe(true);
  expect(
    count(
      "gym_verification_events",
      `application_id = '${state.appId}' AND event = 'evidence_downloaded'`,
    ),
  ).toBe(1);

  // K, L: approval at the reviewed revision (a stale one is refused).
  const revision = sql(
    `SELECT revision FROM gym_verification_applications WHERE id = '${state.appId}'`,
  );
  expect(operator("approve", state.appId, "--revision", "1", "--operator", REVIEWER).out).toContain(
    "stale",
  );
  const approved = operator("approve", state.appId, "--revision", revision, "--operator", REVIEWER);
  expect(approved.ok).toBe(true);
  expect(
    sql(
      `SELECT event || '|' || operator || '|' || application_revision FROM gym_verification_events WHERE application_id = '${state.appId}' AND event = 'approved'`,
    ),
  ).toBe(`approved|${REVIEWER}|${revision}`);

  const page = await newPage(browser);
  await signIn(page, OWNER);
  await go(page, settingsUrl("verification"));
  await expect(
    page
      .getByRole("region", { name: "Business verification" })
      .getByText("Verified", { exact: true }),
  ).toBeVisible();

  // M: no Stripe object, plan or entitlement followed from the approval.
  for (const table of [
    "stripe_customers",
    "stripe_checkouts",
    "stripe_subscriptions",
    "stripe_connected_accounts",
    "gym_saas_subscriptions",
  ]) {
    expect(count(table, `gym_id = '${state.gymId}'`), table).toBe(0);
  }
  const billing = await call(
    request,
    state.ownerBearer,
    "GET",
    `/api/v1/gyms/${state.gymId}/billing`,
  );
  expect((billing.body.billing as { subscription: unknown }).subscription).toBeNull();
});

test("N–P: community defaults state the guarantees and store nothing; member privacy is unchanged", async ({
  browser,
  request,
}) => {
  only();
  const memberBearer = await registerApi(request, MEMBER, "Kamila Lewandowska");
  const rotated = await call(
    request,
    state.ownerBearer,
    "POST",
    `/api/v1/gyms/${state.gymId}/join-code/rotate`,
  );
  const code = (rotated.body.enrollment as { join_code: string }).join_code;
  resetRateLimits();
  const joined = await call(request, memberBearer, "POST", "/api/v1/me/gym-memberships/join", {
    code,
  });
  expect(joined.status).toBe(201);
  const memberId = (joined.body.membership as { gym_member_id: string }).gym_member_id;
  expect(
    (
      await call(
        request,
        state.ownerBearer,
        "POST",
        `/api/v1/gyms/${state.gymId}/join-requests/${memberId}/approve`,
      )
    ).status,
  ).toBe(200);

  const tables = sql(
    "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%community%'",
  );
  const page = await newPage(browser);
  await signIn(page, OWNER);
  await go(page, settingsUrl("community"));
  await expect(page.getByText("Never, whatever the setting")).toBeVisible();
  await expect(page.getByText("Gym community feed")).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Kamila");

  // O: the same after another sign-in, because nothing is stored to change.
  await page.context().clearCookies();
  await signIn(page, OWNER);
  await go(page, settingsUrl("community"));
  await expect(page.getByText("Coming later").first()).toBeVisible();
  expect(
    sql(
      "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%community%'",
    ),
  ).toBe(tables);

  // P: the member's own view and data are unchanged; staff see no private fields.
  const mine = await call(request, memberBearer, "GET", `/api/v1/me/gym-memberships/${memberId}`);
  expect(mine.status).toBe(200);
  expect(JSON.stringify(mine.body)).not.toMatch(/verification|legal_name/);
});

test("Q–T: go-live reads the gym's facts; the required prerequisite now passes", async ({
  request,
}) => {
  only();
  const base = `/api/v1/gyms/${state.gymId}`;
  const read = async () =>
    (await call(request, state.ownerBearer, "GET", `${base}/go-live`)).body.go_live as {
      prerequisites_met: boolean;
      checks: { key: string; status: string; reason_code: string }[];
      publication: { status: string };
    };
  const check = (r: Awaited<ReturnType<typeof read>>, key: string) =>
    r.checks.find((c) => c.key === key)!;

  // Q, S, T: approved verification, staff and a member are real facts now.
  let readiness = await read();
  expect(check(readiness, "business_verification")).toMatchObject({
    status: "passed",
    reason_code: "approved",
  });
  expect(check(readiness, "staff").status).toBe("passed");
  expect(check(readiness, "members").status).toBe("passed");
  expect(check(readiness, "upcoming_class").status).toBe("failed");
  expect(readiness.prerequisites_met).toBe(true);

  // A real class (and a booking) changes the recommended check.
  const venue = await call(request, state.ownerBearer, "POST", `${base}/venues`, {
    client_request_id: randomUUID(),
    gym_location_id: sql(`SELECT id FROM gym_locations WHERE gym_id = '${state.gymId}' LIMIT 1`),
    name: "Ring 1",
    capacity: 20,
    time_zone: "Europe/Warsaw",
  });
  expect(venue.status).toBe(201);
  const template = await call(request, state.ownerBearer, "POST", `${base}/class-templates`, {
    client_request_id: randomUUID(),
    title: "Technical boxing",
    default_duration_minutes: 60,
    default_capacity: 10,
    default_venue_id: (venue.body.venue as { venue_id: string }).venue_id,
  });
  const starts = new Date(Date.now() + 7 * 86_400_000);
  const occurrence = await call(request, state.ownerBearer, "POST", `${base}/class-occurrences`, {
    client_request_id: randomUUID(),
    template_id: (template.body.template as { template_id: string }).template_id,
    starts_at: `${starts.toISOString().slice(0, 10)}T18:00:00+01:00`,
    capacity: 10,
  });
  expect(occurrence.status).toBe(201);
  state.occurrenceId = (occurrence.body.occurrence as { occurrence_id: string }).occurrence_id;
  readiness = await read();
  expect(check(readiness, "upcoming_class").status).toBe("passed");

  // U–W: publication is not available; nothing publishes, whatever is ready.
  expect(readiness.publication.status).toBe("unavailable");
  expect(
    sql(
      "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%publication%'",
    ),
  ).toBe("0");
});

test("X–Z: revocation fails go-live closed and keeps every gym record", async ({
  browser,
  request,
}) => {
  only();
  state.counts = sql(
    `SELECT (SELECT count(*) FROM gym_staff_memberships WHERE gym_id = '${state.gymId}' AND status = 'active') || '|' ||
            (SELECT count(*) FROM gym_members WHERE gym_id = '${state.gymId}' AND status = 'active') || '|' ||
            (SELECT count(*) FROM gym_class_occurrences WHERE gym_id = '${state.gymId}' AND status = 'scheduled') || '|' ||
            (SELECT count(*) FROM gym_verification_evidence WHERE gym_id = '${state.gymId}')`,
  );

  const revoked = operator(
    "revoke",
    state.appId,
    "--reason",
    "business_closed",
    "--operator",
    REVIEWER,
  );
  expect(revoked.ok).toBe(true);

  const readiness = (
    await call(request, state.ownerBearer, "GET", `/api/v1/gyms/${state.gymId}/go-live`)
  ).body.go_live as {
    prerequisites_met: boolean;
    checks: { key: string; status: string; reason_code: string }[];
  };
  expect(readiness.prerequisites_met).toBe(false);
  expect(readiness.checks.find((c) => c.key === "business_verification")).toMatchObject({
    status: "failed",
    reason_code: "revoked",
  });

  // Z: staff, members, classes and documents are all still there.
  const after = sql(
    `SELECT (SELECT count(*) FROM gym_staff_memberships WHERE gym_id = '${state.gymId}' AND status = 'active') || '|' ||
            (SELECT count(*) FROM gym_members WHERE gym_id = '${state.gymId}' AND status = 'active') || '|' ||
            (SELECT count(*) FROM gym_class_occurrences WHERE gym_id = '${state.gymId}' AND status = 'scheduled') || '|' ||
            (SELECT count(*) FROM gym_verification_evidence WHERE gym_id = '${state.gymId}')`,
  );
  expect(after).toBe(state.counts);

  // The browser never shows a stale Verified: going back reads the backend again.
  const page = await newPage(browser);
  await signIn(page, OWNER);
  await go(page, settingsUrl("verification"));
  const region = page.getByRole("region", { name: "Business verification" });
  await expect(region.getByText("Revoked", { exact: true })).toBeVisible();
  await expect(region.getByText("The business appears to be closed.")).toBeVisible();
  await go(page, settingsUrl("go-live"));
  await page.goBack();
  await expect(region.getByText("Revoked", { exact: true })).toBeVisible();
  await expect(region.getByText("Verified", { exact: true })).toHaveCount(0);
});

test("AA–AB: another gym's owner cannot see it; a switched account keeps nothing", async ({
  browser,
  request,
}) => {
  only();
  const rivalBearer = await registerApi(request, RIVAL, "Rival Owner");
  const base = `/api/v1/gyms/${state.gymId}`;
  const evidenceId = sql(
    `SELECT id FROM gym_verification_evidence WHERE application_id = '${state.appId}'`,
  );
  expect((await call(request, rivalBearer, "GET", `${base}/business-verification`)).status).toBe(
    404,
  );
  expect((await call(request, rivalBearer, "GET", `${base}/go-live`)).status).toBe(404);
  expect(
    (
      await call(
        request,
        rivalBearer,
        "POST",
        `${base}/business-verification/evidence/${evidenceId}/confirm`,
      )
    ).status,
  ).toBe(404);
  expect((await request.get(`${API_URL}${base}/business-verification`)).status()).toBe(401);

  // AB: the owner signs out and the manager signs in in the same browser.
  const page = await newPage(browser);
  await signIn(page, OWNER);
  await go(page, settingsUrl("verification"));
  await expect(page.getByRole("region", { name: "Business verification" })).toBeVisible();
  await page.context().clearCookies();
  await page.evaluate(() => window.sessionStorage.clear());
  await signIn(page, MANAGER);
  await go(page, settingsUrl("verification"));
  await expect(page.getByText("Only the gym's owner manages business verification")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(LEGAL);
  await expect(page.locator("body")).not.toContainText(FILE);
});

test("AC–AD: the API's log holds no document, business detail or signed URL; nothing synthetic is stored", () => {
  only();
  test.skip(!API_LOG, "E2E_API_LOG is not set");
  const log = readFileSync(API_LOG, "utf8");
  for (const secret of [
    REGISTRATION,
    FILE,
    LEGAL,
    "X-Amz-Signature",
    `business-verification/${state.appId}`,
  ]) {
    expect(log, secret).not.toContain(secret);
  }

  // AD: exactly the one uploaded document, one submission, one operator approval and revocation.
  expect(count("gym_verification_evidence", `gym_id = '${state.gymId}'`)).toBe(1);
  expect(
    sql(
      `SELECT string_agg(event, ',' ORDER BY seq) FROM gym_verification_events WHERE application_id = '${state.appId}'`,
    ),
  ).toBe("submitted,evidence_downloaded,approved,revoked");
  expect(
    count(
      "gym_verification_events",
      `application_id = '${state.appId}' AND event <> 'submitted' AND operator <> '${REVIEWER}'`,
    ),
  ).toBe(0);
});
