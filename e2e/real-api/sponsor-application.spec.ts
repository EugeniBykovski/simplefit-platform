import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { expect, type APIRequestContext, type Browser, type Page, test } from "@playwright/test";

/*
 * SF-115: the public Partners pages (SPX1, SPX2) and the sponsor application
 * (SPA0, SPA1 / SP1–SP7 and review, SP9, SPX5) on the production build
 * against the real SF-113 / SF-114 API and PostgreSQL
 * (playwright.real-api.config.ts). Nothing of the application is mocked.
 *
 * The API runs on a disposable database (`e2e` in its name) with the
 * test-only legal fixtures (the published declaration exists only there),
 * sponsor uploads on, and its storage pointed at a local S3-compatible
 * stand-in (`fixtures/s3-stub.mjs`: no signature checks; the browser really
 * PUTs to the presigned URL and the API really HEADs the object). One
 * upload failure is injected by aborting the browser's PUT, nothing else.
 * Backend checks read the disposable database or call the API with each
 * person's own session. Operator review (change requests) needs a
 * WebAuthn step-up ceremony and is not driven here.
 */

const require = createRequire(import.meta.url);
const API_URL = process.env.E2E_REAL_API_URL ?? "";
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";

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

function emailedCode(address: string): string {
  const out = execFileSync("mix", ["e2e.email_code", address], {
    cwd: API_DIR,
    env: { ...process.env, MIX_ENV: "dev", DATABASE_URL: disposableDatabase() },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const code = out.split("\n").find((line) => /^\d{6}$/.test(line.trim()));
  if (!code) throw new Error("no code was emailed");
  return code.trim();
}

const resetRateLimits = () => sql("DELETE FROM auth_rate_limits; DELETE FROM rate_limit_events");
const userId = (email: string) =>
  sql(
    `SELECT user_id FROM identities WHERE provider = 'email' AND lower(provider_subject) = lower('${email}') LIMIT 1`,
  );
const applications = (email: string) =>
  Number(
    sql(`SELECT count(*) FROM sponsor_applications WHERE applicant_user_id = '${userId(email)}'`),
  );
const heading = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name });
const codeInput = (page: Page) => page.locator('[data-slot="code-input"]');

async function call(
  request: APIRequestContext,
  bearer: string,
  method: "GET" | "PATCH" | "POST",
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

async function newPage(browser: Browser, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport });
  const page = await context.newPage();
  await page.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());
  return page;
}

function bearerOf(page: Page) {
  let bearer = "";
  page.on("request", (request) => {
    const header = request.headers().authorization;
    if (request.url().startsWith(API_URL) && header) bearer = header;
  });
  return () => bearer;
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
  await call(request, bearer, "PATCH", "/api/v1/me/account-profile", {
    full_name: fullName,
    date_of_birth: "1991-03-02",
    accept_terms: true,
    accept_privacy: true,
  });
  expect(
    (await call(request, bearer, "POST", "/api/v1/me/account-profile/complete-registration", {}))
      .status,
  ).toBe(200);
  return bearer;
}

/** Signs in with the email code on the login page that SPA0 linked to, keeping its continuation. */
async function signInFromEntry(page: Page, email: string) {
  resetRateLimits();
  await page.getByRole("link", { name: /Continue with Email/ }).click();
  await page.waitForURL((url) => url.pathname === "/en/login");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await page.waitForURL((url) => url.pathname === "/en/login/code");
  await codeInput(page).pressSequentially(emailedCode(email));
  await page.waitForURL((url) => !url.pathname.startsWith("/en/login"));
}

async function axe(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  return page.evaluate(async () => {
    const { violations } = await (
      window as unknown as {
        axe: {
          run: (
            context: Element,
            options: object,
          ) => Promise<{ violations: { id: string; nodes: unknown[] }[] }>;
        };
      }
    ).axe.run(document.querySelector("main") ?? document.body, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    });
    return violations.map((violation) => `${violation.id} (${violation.nodes.length})`);
  });
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

const run = randomUUID().slice(0, 8);
const APPLICANT = `sf115-applicant-${run}@example.com`;
const OTHER = `sf115-other-${run}@example.com`;
const NEWCOMER = `sf115-new-${run}@example.com`;
const COMPANY = `Ring Fuel ${run}`;
const state = { appId: "", otherBearer: "", applicantBearer: "", evidenceId: "" };
const only = () => test.skip(test.info().project.name !== "chromium-1440", "one journey per run");

test("A: the public pages are anonymous, truthful, accessible and fit 375–1920", async ({
  browser,
}) => {
  only();
  const page = await newPage(browser);
  await page.goto("/en/partners");
  await expect(heading(page, "Partner with the global boxing community.")).toBeVisible();
  for (const invented of ["Haymaker", "Korda", "RingFuel", "12,482", "48K", "participants"]) {
    await expect(page.getByText(invented)).toHaveCount(0);
  }
  expect(await axe(page)).toEqual([]);
  await page.getByRole("link", { name: "Become a Sponsor" }).first().click();
  await expect(heading(page, "Apply to work with SimpleFit.")).toBeVisible();
  await expect(page.getByText(/business days|partner manager/)).toHaveCount(0);
  expect(await axe(page)).toEqual([]);
  await page.getByRole("link", { name: "Start application" }).click();
  await expect(heading(page, "Sign in to start your application")).toBeVisible();
  expect(await axe(page)).toEqual([]);

  for (const width of [375, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/en/partners", "/en/partners/apply", "/en/partners/apply?step=start"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await overflow(page), `${path} at ${width}`).toBeLessThanOrEqual(0);
    }
  }
  await page.context().close();
});

test("B: registration from SPA0 comes back to the application, and creates nothing", async ({
  browser,
}) => {
  only();
  const page = await newPage(browser);
  resetRateLimits();
  await page.goto(
    `/en/signup/account?returnTo=${encodeURIComponent("/partners/apply?step=start")}`,
  );
  await page.getByRole("textbox", { name: "Email" }).fill(NEWCOMER);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/en/signup/verify");
  await codeInput(page).pressSequentially(emailedCode(NEWCOMER));
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/account");
  await page.getByLabel("Full name").fill("New Comer");
  await page.getByLabel("Date of birth").fill("1990-05-17");
  await page.getByRole("checkbox", { name: /Terms of Service/ }).click();
  await page.getByRole("checkbox", { name: /Privacy Policy/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => url.pathname === "/en/partners/apply");
  expect(new URL(page.url()).searchParams.get("step")).toBe("start");
  await expect(heading(page, "You’re ready to start")).toBeVisible();
  expect(applications(NEWCOMER)).toBe(0);
  expect(
    Number(
      sql(
        `SELECT count(*) FROM sponsor_workspace_memberships WHERE user_id = '${userId(NEWCOMER)}'`,
      ),
    ),
  ).toBe(0);
  await page.context().close();
});

test("C: sign in, complete SP1–SP8 with a real upload, refresh, submit once, see the status", async ({
  browser,
  request,
}) => {
  only();
  state.applicantBearer = await registerApi(request, APPLICANT, "Ada Applicant");
  const page = await newPage(browser);
  const bearer = bearerOf(page);
  await page.goto("/en/partners/apply?step=start");
  await signInFromEntry(page, APPLICANT);
  await expect(heading(page, "You’re ready to start")).toBeVisible();
  expect(applications(APPLICANT)).toBe(0);
  await page.getByRole("button", { name: "Start application" }).click();

  // SP1: the backend's missing answers stop "Save and continue".
  await expect(heading(page, "Company")).toBeVisible();
  await page.getByRole("textbox", { name: /Company name/ }).fill(COMPANY);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("2 answers to check")).toBeVisible();
  expect(applications(APPLICANT)).toBe(1);
  state.appId = sql(
    `SELECT id FROM sponsor_applications WHERE applicant_user_id = '${userId(APPLICANT)}'`,
  );
  await page.getByRole("combobox", { name: /Country/ }).click();
  await page.getByRole("combobox", { name: "Search countries" }).fill("Poland");
  await page.keyboard.press("Enter");
  await page.getByText("Nutrition", { exact: true }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();

  // SP2 with a client-side format error first.
  await expect(heading(page, "Contact person")).toBeVisible();
  await page.getByRole("textbox", { name: /Full name/ }).fill("Ada Applicant");
  await page.getByRole("textbox", { name: /Position/ }).fill("Brand lead");
  await page.getByRole("textbox", { name: /Work email/ }).fill("not-an-email");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(
    page.getByRole("link", { name: "Enter an email address like name@company.com." }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: /Work email/ }).fill("ada@ringfuel.example");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(heading(page, "Partnership interests")).toBeVisible();
  await page.getByText("Sponsored events", { exact: true }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(heading(page, "Markets")).toBeVisible();
  await page.getByText("Countries", { exact: true }).click();
  await page.getByRole("combobox", { name: /Add a country/ }).click();
  await page.getByRole("combobox", { name: "Search countries" }).fill("Czechia");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(heading(page, "Estimated budget")).toBeVisible();
  await page.getByText("Let’s discuss", { exact: true }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(heading(page, "Goals")).toBeVisible();
  await page
    .getByRole("textbox", { name: /Your goals/ })
    .fill("Support amateur boxing events in Poland.");
  await page.getByRole("button", { name: "Save and continue" }).click();

  // SP7: a real upload; the first PUT is lost, the retry lands, and only the
  // backend's confirmation says "Uploaded".
  await expect(heading(page, "Uploads")).toBeVisible();
  let aborted = false;
  await page.route(/127\.0\.0\.1:4566/, async (route) => {
    if (!aborted && route.request().method() === "PUT") {
      aborted = true;
      return route.abort();
    }
    return route.continue();
  });
  await page.getByText("Brand deck", { exact: true }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "deck.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(
    page.getByText("The file didn’t upload. Check your connection and try again."),
  ).toBeVisible();
  await expect(page.getByText("Uploaded", { exact: true })).toHaveCount(0);
  expect(
    sql(`SELECT status FROM sponsor_application_evidence WHERE application_id = '${state.appId}'`),
  ).toBe("pending_upload");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("deck.pdf uploaded.")).toBeVisible();
  expect(
    sql(`SELECT status FROM sponsor_application_evidence WHERE application_id = '${state.appId}'`),
  ).toBe("uploaded");
  state.evidenceId = sql(
    `SELECT id FROM sponsor_application_evidence WHERE application_id = '${state.appId}'`,
  );
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Review shows the saved answers; a refresh keeps them; Back and Forward work.
  await expect(heading(page, "Review and submit")).toBeVisible();
  await expect(page.getByText(COMPANY).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Support amateur boxing events in Poland.").first()).toBeVisible();
  await page.goBack();
  await expect(heading(page, "Uploads")).toBeVisible();
  await page.goForward();
  await expect(heading(page, "Review and submit")).toBeVisible();
  expect(await axe(page)).toEqual([]);

  // The declaration is required; marketing consent is never asked for here.
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByText("Confirm the declaration to submit.")).toBeVisible();
  expect(
    Number(
      sql(
        `SELECT count(*) FROM sponsor_application_submissions WHERE application_id = '${state.appId}'`,
      ),
    ),
  ).toBe(0);
  await expect(page.getByText(/marketing|newsletter|product news/i)).toHaveCount(0);
  await page.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(heading(page, "Application received")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("step")).toBe("submitted");

  expect(sql(`SELECT status FROM sponsor_applications WHERE id = '${state.appId}'`)).toBe(
    "submitted",
  );
  expect(
    Number(
      sql(
        `SELECT count(*) FROM sponsor_application_submissions WHERE application_id = '${state.appId}'`,
      ),
    ),
  ).toBe(1);
  expect(
    sql(
      `SELECT submission_id IS NOT NULL FROM sponsor_application_evidence WHERE id = '${state.evidenceId}'`,
    ),
  ).toBe("t");
  // Nothing commercial: no organization or membership, and no workspace capability.
  expect(
    Number(
      sql(
        `SELECT count(*) FROM sponsor_workspace_memberships WHERE user_id = '${userId(APPLICANT)}'`,
      ),
    ),
  ).toBe(0);
  const entry = await call(request, bearer(), "GET", "/api/v1/me/entry?intent=sponsor");
  expect((entry.body.entry as { capabilities: string[] }).capabilities).not.toContain(
    "SPONSOR_WORKSPACE",
  );

  // The form is closed now: any form URL opens the status.
  await page.goto("/en/partners/apply?step=goals");
  await page.waitForURL((url) => url.searchParams.get("step") === "status");
  await expect(heading(page, "We’ve received your application")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open workspace" })).toHaveCount(0);
  expect(await axe(page)).toEqual([]);
  await page.context().close();
});

test("D: duplicates, foreign ids and other accounts get nothing", async ({ browser, request }) => {
  only();
  const own = await call(request, state.applicantBearer, "GET", "/api/v1/me/sponsor-application");
  const { revision, declaration } = own.body.application as {
    revision: number;
    declaration: { version: string };
  };
  // A second submission is refused and nothing new is recorded.
  const again = await call(
    request,
    state.applicantBearer,
    "POST",
    "/api/v1/me/sponsor-application/submit",
    {
      expected_revision: revision,
      client_request_id: randomUUID(),
      declaration_accepted: true,
      declaration_version: declaration.version,
      declaration_language: "en",
    },
  );
  expect(again.status).toBe(409);
  expect(
    Number(
      sql(
        `SELECT count(*) FROM sponsor_application_submissions WHERE application_id = '${state.appId}'`,
      ),
    ),
  ).toBe(1);

  // Another user can't read, confirm or remove the applicant's application or document.
  state.otherBearer = await registerApi(request, OTHER, "Oscar Other");
  expect(
    (await call(request, state.otherBearer, "GET", "/api/v1/me/sponsor-application")).status,
  ).toBe(404);
  expect(
    (
      await call(
        request,
        state.otherBearer,
        "POST",
        `/api/v1/me/sponsor-application/evidence/${state.evidenceId}/confirm`,
        {},
      )
    ).status,
  ).toBe(404);

  // The same browser, signed out and signed in as the other user: nothing of the first account.
  const page = await newPage(browser);
  await page.goto("/en/partners/apply?step=status");
  await signInFromEntry(page, APPLICANT);
  await expect(heading(page, "We’ve received your application")).toBeVisible();
  await expect(page.getByText(COMPANY).first()).toBeVisible();
  await page.goto("/en/partners/apply?step=start");
  await expect(heading(page, "You’ve already applied")).toBeVisible();
  // The session ends (its refresh cookie gone); a reload starts this browser anew.
  await page.context().clearCookies();
  await page.goto("/en/partners/apply?step=status");
  await expect(heading(page, "Sign in to start your application")).toBeVisible();
  await signInFromEntry(page, OTHER);
  await page.goto("/en/partners/apply?step=status");
  await page.waitForURL((url) => url.searchParams.get("step") === "start");
  await expect(heading(page, "You’re ready to start")).toBeVisible();
  await expect(page.getByText(COMPANY)).toHaveCount(0);
  await page.context().close();
});

test("E: two tabs editing one draft never overwrite each other", async ({ browser }) => {
  only();
  const page = await newPage(browser);
  await page.goto("/en/partners/apply?step=start");
  await signInFromEntry(page, OTHER);
  await page.getByRole("button", { name: "Start application" }).click();
  await page.getByRole("textbox", { name: /Company name/ }).fill(`Other ${run}`);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText(/answers to check/)).toBeVisible();

  // Both tabs hold revision N; the second saves first.
  await page.goto("/en/partners/apply?step=goals");
  const mine = page.getByRole("textbox", { name: /Your goals/ });
  await expect(mine).toBeVisible();
  const before = sql(
    `SELECT revision FROM sponsor_applications WHERE applicant_user_id = '${userId(OTHER)}'`,
  );
  const second = await page.context().newPage();
  await second.goto("/en/partners/apply?step=goals");
  await second.getByRole("textbox", { name: /Your goals/ }).fill("From the second tab.");
  await second.getByRole("button", { name: "Save and continue" }).click();
  await expect(heading(second, "Uploads")).toBeVisible();
  await second.close();

  // The first tab's save at the old revision is refused: nothing overwritten, its text kept.
  await mine.fill("From the first tab.");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("This draft changed somewhere else.")).toBeVisible();
  await expect(mine).toHaveValue("From the first tab.");
  expect(
    sql(`SELECT goals FROM sponsor_applications WHERE applicant_user_id = '${userId(OTHER)}'`),
  ).toBe("From the second tab.");
  expect(Number(before)).toBeLessThan(
    Number(
      sql(`SELECT revision FROM sponsor_applications WHERE applicant_user_id = '${userId(OTHER)}'`),
    ),
  );
  // An explicit save after reloading applies the first tab's text on the new revision.
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(heading(page, "Uploads")).toBeVisible();
  expect(
    sql(`SELECT goals FROM sponsor_applications WHERE applicant_user_id = '${userId(OTHER)}'`),
  ).toBe("From the first tab.");
  await page.context().close();
});
