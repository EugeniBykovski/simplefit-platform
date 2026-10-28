import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { expect, type APIRequestContext, type Browser, type Page, test } from "@playwright/test";

/*
 * SF-91: the gym owner's web first run (GRW1 / GRW2) end to end, against
 * the real API and PostgreSQL (playwright.real-api.config.ts) with the SF-90
 * contract. Every step is a browser action; the backend checks read the
 * disposable database (psql) or call the real API with a page's own session.
 * The one manager membership is inserted into the disposable database only
 * (no staff API before SF-92), as the SF-88 journey does. Nothing else is
 * seeded.
 */

const API_URL = process.env.E2E_REAL_API_URL ?? "";
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";
const KEYS = ["create_gym", "add_class", "invite_staff", "invite_members", "first_check_in"];

test.skip(!API_URL, "E2E_REAL_API_URL is not set: the real-backend journey needs a running API");
test.describe.configure({ mode: "serial" });

/** Fails closed: only a database named for end-to-end runs is ever read or written. */
function disposableDatabase(): string {
  const name = new URL(DATABASE_URL).pathname.slice(1);
  if (!/e2e/.test(name) || name === "simple_fit_dev") {
    throw new Error("E2E_API_DATABASE_URL must name a disposable end-to-end database");
  }
  return DATABASE_URL;
}

function sql(query: string): string {
  return execFileSync("psql", [disposableDatabase(), "-Atqc", query], { encoding: "utf8" }).trim();
}

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
    `SELECT user_id FROM identities WHERE provider = 'email' AND lower(provider_subject) = lower('${email}')`,
  );
const gymId = (name: string) => sql(`SELECT id FROM gyms WHERE name = '${name}'`);
/** The owner's first-run row: started|completed|dismissed as t/f, or "" when there is none. */
const row = (gym: string, user: string) =>
  sql(
    `SELECT (started_at IS NOT NULL) || '|' || (completed_at IS NOT NULL) || '|' || (dismissed_at IS NOT NULL) FROM gym_first_runs WHERE gym_id = '${gym}' AND user_id = '${user}'`,
  );
const audits = (gym: string) =>
  sql(
    `SELECT string_agg(event_type, ',' ORDER BY occurred_at) FROM gym_audit_events WHERE gym_id = '${gym}' AND event_type LIKE 'first_run_%'`,
  );

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name });
const intro = (page: Page) => page.locator("[data-first-run-intro]");
const codeInput = (page: Page) => page.locator('[data-slot="code-input"]');
const focus = (page: Page) =>
  page.evaluate(() => {
    window.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });

/** The page's current access token, read from its own API requests (never logged). */
function sessionOf(page: Page) {
  let bearer = "";
  page.on("request", (request) => {
    const header = request.headers().authorization;
    if (request.url().startsWith(API_URL) && header) bearer = header;
  });
  return () => bearer;
}

/** The page's own first-run requests (method and path), to prove who asks for what. */
function firstRunRequests(page: Page) {
  const seen: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.url().startsWith(API_URL) && url.pathname.includes("/first-run")) {
      seen.push(`${request.method()} ${url.pathname.replace(/\/gyms\/[^/]+/, "/gyms/:id")}`);
    }
  });
  return seen;
}

async function call(
  request: APIRequestContext,
  bearer: string,
  method: "GET" | "PUT" | "POST",
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
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  const page = await context.newPage();
  await page.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());
  return page;
}

async function register(page: Page, email: string, intent: string, fullName = "Alex Kowalski") {
  resetRateLimits();
  await go(page, `/en/signup/account?intent=${intent}`);
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
}

async function signIn(page: Page, email: string) {
  resetRateLimits();
  await go(page, "/en/login");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await page.waitForURL((url) => url.pathname === "/en/login/code");
  await codeInput(page).pressSequentially(emailedCode(email));
}

/** The console's Sign out; on narrow projects it is in the navigation sheet. */
async function signOut(page: Page) {
  const sheet = page.getByRole("button", { name: "Open navigation" });
  if (await sheet.isVisible()) await sheet.click();
  await page.getByRole("button", { name: "Sign out" }).locator("visible=true").first().click();
  await page.waitForURL((url) => url.pathname === "/en/login");
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
  await page.getByRole("textbox", { name: "City" }).fill("Gdańsk");
  await page.getByRole("textbox", { name: "Address", exact: true }).fill("ul. Morska 5");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Branding")).toBeVisible();
  await page.getByRole("button", { name: "Create gym" }).click();
  await expect(heading(page, `${name} is created.`)).toBeVisible();
}

async function createGymThroughApi(request: APIRequestContext, bearer: string, name: string) {
  const created = await call(request, bearer, "POST", "/api/v1/gyms", {
    client_request_id: randomUUID(),
    name,
    gym_type: "boxing_gym",
  });
  expect(created.status).toBe(201);
  const id = (created.body.gym as { id: string }).id;
  const location = await call(request, bearer, "PUT", `/api/v1/gyms/${id}/setup/primary-location`, {
    expected_revision: 1,
    country_code: "PL",
    city: "Sopot",
    address_line: "ul. Morska 1",
  });
  expect(location.status).toBe(200);
  expect((await call(request, bearer, "POST", `/api/v1/gyms/${id}/complete-setup`)).status).toBe(
    200,
  );
  return id;
}

const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const GYM_A = `First Run A ${tag}`;
const GYM_B = `First Run B ${tag}`;
const owner = { email: `e2e-sf91-owner-${tag}@example.com`, user: "" };
const stranger = { email: `e2e-sf91-other-${tag}@example.com`, user: "" };
const statuses: Record<string, number> = {};

test("A: a new owner gets the first run, takes the tour, finishes; it never reopens", async ({
  browser,
  request,
}) => {
  test.setTimeout(300_000);
  const page = await newPage(browser);
  const bearer = sessionOf(page);
  await register(page, owner.email, "gym");
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/gym");
  await createGymInBrowser(page, GYM_A);
  await page.getByRole("button", { name: "Go to gym" }).click();
  const a = gymId(GYM_A);
  owner.user = userId(owner.email);
  await page.waitForURL(`**/en/app/gyms/${a}`);

  // GRW1: not started; reading created nothing.
  await expect(intro(page)).toHaveAttribute("data-first-run-intro", "not_started");
  expect(row(a, owner.user)).toBe("");
  const api = await call(request, bearer(), "GET", `/api/v1/gyms/${a}/first-run`);
  statuses["A GET first-run (owner)"] = api.status;
  const checklist = (api.body.first_run as { checklist: { key: string; status: string }[] })
    .checklist;
  expect(checklist.map((item) => item.key)).toEqual(KEYS);
  // E · the page renders exactly the API's checklist.
  const rendered = await page
    .locator("[data-checklist-key]")
    .evaluateAll((rows) =>
      rows.map(
        (r) => `${r.getAttribute("data-checklist-key")}:${r.getAttribute("data-checklist-status")}`,
      ),
    );
  expect(rendered).toEqual(checklist.map((item) => `${item.key}:${item.status}`));
  await expect(page.locator("main")).not.toContainText(
    /PLN|MRR|revenue|members joined|invites sent/i,
  );

  // Start → the backend records in_progress; the four steps record nothing.
  await page.getByRole("button", { name: "Start the tour" }).click();
  await expect(page.getByRole("dialog", { name: "Your opening checklist" })).toBeVisible();
  expect(row(a, owner.user)).toBe("true|false|false");
  for (const title of [
    "Your gym and your access",
    "Tools arrive in this menu",
    "One account, every role",
  ]) {
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("dialog", { name: title })).toBeVisible();
  }
  expect(row(a, owner.user)).toBe("true|false|false");
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("dialog", { name: "You know your way around" })).toBeVisible();
  expect(row(a, owner.user)).toBe("true|true|false");
  expect(audits(a)).toBe("first_run_completed");
  await page.getByRole("button", { name: "Back to the dashboard" }).click();
  await expect(page.locator("[data-first-run-outcome=completed]")).toBeVisible();
  // The checklist was not touched by finishing.
  expect(
    (
      (await call(request, bearer(), "GET", `/api/v1/gyms/${a}/first-run`)).body.first_run as {
        checklist: unknown;
      }
    ).checklist,
  ).toEqual(checklist);

  // Reload, sign out and in: WG1, the introduction never reopens.
  await page.reload();
  await expect(page.getByRole("region", { name: "Gym details" })).toBeVisible();
  await expect(intro(page)).toHaveCount(0);
  await signOut(page);
  await signIn(page, owner.email);
  await page.waitForURL(`**/en/app/gyms/${a}`);
  await expect(page.getByRole("region", { name: "Gym details" })).toBeVisible();
  await expect(intro(page)).toHaveCount(0);
  await page.context().close();
});

test("B, C: gym B is independent; started on one device, resumed and skipped on another; a late finish closes on the kept outcome", async ({
  browser,
  request,
}) => {
  test.setTimeout(300_000);
  const one = await newPage(browser);
  const bearer = sessionOf(one);
  await signIn(one, owner.email);
  await one.waitForURL(/\/en\/app\/gyms\/[0-9a-f-]+$/);
  const a = gymId(GYM_A);
  const b = await createGymThroughApi(request, bearer(), GYM_B);

  // C · gym B has its own first run: not started, while A stays completed.
  await go(one, `/en/app/gyms/${b}`);
  await expect(intro(one)).toHaveAttribute("data-first-run-intro", "not_started");
  expect(row(b, owner.user)).toBe("");
  expect(row(a, owner.user)).toBe("true|true|false");

  // B · device 1 starts the tour…
  await one.getByRole("button", { name: "Start the tour" }).click();
  await expect(one.getByRole("dialog", { name: "Your opening checklist" })).toBeVisible();
  expect(row(b, owner.user)).toBe("true|false|false");

  // …device 2 (another browser context, its own sign-in) is offered to resume…
  const two = await newPage(browser);
  await signIn(two, owner.email);
  await two.waitForURL(/\/en\/app\/gyms\/[0-9a-f-]+$/);
  await go(two, `/en/app/gyms/${b}`);
  await expect(heading(two, "Dashboard")).toBeVisible();
  await expect(two.getByRole("heading", { name: "Pick up the introduction" })).toBeVisible();
  // …and skips it there.
  await two.getByRole("button", { name: "Skip introduction" }).click();
  await two.getByRole("alertdialog").getByRole("button", { name: "Skip introduction" }).click();
  await expect(two.locator("[data-first-run-outcome=dismissed]")).toBeVisible();
  expect(row(b, owner.user)).toBe("true|false|true");
  expect(audits(b)).toBe("first_run_dismissed");

  // Device 1, still in the tour, finishes late: the backend kept "dismissed" (409).
  for (let step = 0; step < 3; step += 1) await one.getByRole("button", { name: "Next" }).click();
  await one.getByRole("button", { name: "Finish" }).click();
  // The page shows what the backend kept, not a guess: the tour closes on "dismissed".
  await expect(one.getByRole("dialog")).toHaveCount(0);
  await expect(one.locator("[data-first-run-outcome=dismissed]")).toBeVisible();
  await expect(heading(one, "Dashboard")).toBeFocused();
  const late = await call(request, bearer(), "POST", `/api/v1/gyms/${b}/first-run/complete`, {});
  statuses["B late complete after dismiss"] = late.status;
  expect(late.status).toBe(409);
  expect((late.body.error as { details: unknown }).details).toEqual({ first_run: "dismissed" });
  expect(row(b, owner.user)).toBe("true|false|true");
  await one.reload();
  await expect(intro(one)).toHaveCount(0);
  expect(audits(b)).toBe("first_run_dismissed");
  // A finished elsewhere stays finished here too.
  await go(two, `/en/app/gyms/${a}`);
  await expect(two.getByRole("region", { name: "Gym details" })).toBeVisible();
  await focus(two);
  await expect(intro(two)).toHaveCount(0);
  await one.context().close();
  await two.context().close();
});

test("D: a manager never gets the owner's first run (no request, 403 from the API); a stranger gets 404", async ({
  browser,
  request,
}) => {
  test.setTimeout(300_000);
  const a = gymId(GYM_A);
  const page = await newPage(browser);
  const bearer = sessionOf(page);
  await register(page, stranger.email, "gym", "Bea Nowak");
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/gym");
  stranger.user = userId(stranger.email);

  // A stranger: 404 on the first run of someone else's gym, nothing disclosed.
  const foreign = await call(request, bearer(), "GET", `/api/v1/gyms/${a}/first-run`);
  statuses["D GET first-run (stranger)"] = foreign.status;
  expect(foreign.status).toBe(404);
  expect(JSON.stringify(foreign.body)).not.toContain(GYM_A);

  // The stranger becomes a manager of A (seeded: no staff API before SF-92).
  sql(
    `INSERT INTO gym_staff_memberships (id, gym_id, user_id, role, status, inserted_at, updated_at) VALUES ('${randomUUID()}', '${a}', '${stranger.user}', 'manager', 'active', now(), now())`,
  );
  const asManager = await call(request, bearer(), "GET", `/api/v1/gyms/${a}/first-run`);
  statuses["D GET first-run (manager)"] = asManager.status;
  expect(asManager.status).toBe(403);
  const dismiss = await call(request, bearer(), "POST", `/api/v1/gyms/${a}/first-run/dismiss`, {});
  statuses["D POST dismiss (manager)"] = dismiss.status;
  expect(dismiss.status).toBe(403);

  const asks = firstRunRequests(page);
  await go(page, `/en/app/gyms/${a}`);
  await expect(page.getByText(/The Manager dashboard isn’t available yet/)).toBeVisible();
  await expect(intro(page)).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(asks).toEqual([]);
  expect(row(a, stranger.user)).toBe("");
  await page.context().close();
  test
    .info()
    .annotations.push({ type: "SF-91 status codes", description: JSON.stringify(statuses) });
});
