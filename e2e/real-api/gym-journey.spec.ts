import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { expect, type APIRequestContext, type Browser, type Page, test } from "@playwright/test";

/*
 * SF-86: the Gym owner web registration end to end, against the real API and
 * PostgreSQL (playwright.real-api.config.ts), journeys A–Q of the ticket.
 * Every step is a browser action; the backend checks read the disposable
 * database (psql) or call the real API with the page's own session. The
 * emailed code is read from the API's queued email (`mix e2e.email_code`,
 * dev/test only). Google and Apple scripts are blocked.
 */

const API_URL = process.env.E2E_REAL_API_URL ?? "";
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";

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

/** Ends the short auth windows and the gym creation counts (disposable database only). */
function resetRateLimits() {
  sql("DELETE FROM auth_rate_limits; DELETE FROM rate_limit_events");
}

/** The user behind an email identity. */
const userId = (email: string) =>
  sql(
    `SELECT user_id FROM identities WHERE provider = 'email' AND lower(provider_subject) = lower('${email}')`,
  );
/** The gyms a user staffs (any status), name|status|role, newest first. */
const gymsOf = (user: string) =>
  sql(
    `SELECT g.id || '|' || g.name || '|' || g.setup_status || '|' || m.role FROM gyms g JOIN gym_staff_memberships m ON m.gym_id = g.id WHERE m.user_id = '${user}' AND m.status = 'active' ORDER BY g.inserted_at DESC`,
  )
    .split("\n")
    .filter(Boolean)
    .map((row) => {
      const [id, name, status, role] = row.split("|");
      return { id: id ?? "", name, status, role };
    });

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name });
const codeInput = (page: Page) => page.locator('[data-slot="code-input"]');

/** The page's current access token, read from its own API requests (never logged). */
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
  method: "GET" | "PATCH" | "PUT" | "POST" | "DELETE",
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

async function newPage(browser: Browser) {
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  const page = await context.newPage();
  await page.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());
  return page;
}

/** Email registration with an intent, then WA5. */
async function register(page: Page, email: string, intent: string, fullName = "Alex Kowalski") {
  resetRateLimits();
  await page.goto(`/en/signup?intent=${intent}`);
  await page.getByRole("link", { name: "Continue with Email" }).click();
  await page.waitForURL((url) => url.pathname === "/en/signup/account");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/en/signup/verify");
  await codeInput(page).pressSequentially(emailedCode(email));
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/account");
  expect(new URL(page.url()).searchParams.get("intent")).toBe(intent);
  await page.getByLabel("Full name").fill(fullName);
  await page.getByLabel("Date of birth").fill("1990-05-17");
  await page.getByRole("checkbox", { name: /Terms of Service/ }).click();
  await page.getByRole("checkbox", { name: /Privacy Policy/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
}

async function signIn(page: Page, email: string) {
  resetRateLimits();
  await page.goto("/en/login");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await page.waitForURL((url) => url.pathname === "/en/login/code");
  await codeInput(page).pressSequentially(emailedCode(email));
}

/**
 * Signs out the way the application's own Sign out does (`POST /api/auth/logout`
 * with the session's token and refresh cookie), from a setup step, which has
 * no Sign out control of its own (as Fighter and Coach onboarding).
 */
async function signOut(page: Page, bearer: string) {
  const answer = await page.request.post(`${API_URL}/api/auth/logout`, {
    headers: { authorization: bearer, "x-simplefit-csrf": "1", origin: "http://127.0.0.1:3100" },
  });
  expect(answer.status()).toBeLessThan(300);
  await page.context().clearCookies();
  await page.goto("/en/app/onboarding/gym");
  await page.waitForURL((url) => url.pathname === "/en/login");
}

async function fillOg1(page: Page, name: string) {
  await expect(heading(page, "Gym name & type")).toBeVisible();
  await page.getByRole("textbox", { name: "Gym name" }).fill(name);
  await page.getByText("Boxing club", { exact: true }).click();
}

async function fillOg2(page: Page, city = "Warsaw", address = "ul. Ząbkowska 31") {
  await expect(heading(page, "Location")).toBeVisible();
  await page.getByRole("combobox", { name: "Country" }).click();
  await page.getByRole("combobox", { name: "Search countries" }).fill("Poland");
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "City" }).fill(city);
  await page.getByRole("textbox", { name: "Address", exact: true }).fill(address);
}

const run = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let owner = { email: "", user: "", gym: "" };

test("A–I, L, O, P: a new owner registers, creates, resumes on two devices and completes", async ({
  browser,
  request,
}) => {
  test.setTimeout(300_000);
  const email = `e2e-gym-${run()}@example.com`;
  const page = await newPage(browser);
  const bearer = sessionOf(page);

  // A · Gym intent → registration → WA5 → OG1; choosing Gym created nothing.
  await register(page, email, "gym");
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/gym");
  await expect(heading(page, "Gym name & type")).toBeVisible();
  const user = userId(email);
  expect(user).toMatch(/^[0-9a-f-]{36}$/);
  expect(gymsOf(user)).toEqual([]);

  // B · one valid OG1 submission: exactly one draft, one active owner membership.
  await fillOg1(page, "Praga Boxing Club");
  await page.getByLabel("Phone · optional").fill("+48 22 000 00 00");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Location")).toBeVisible();
  const [gym] = gymsOf(user);
  expect(gymsOf(user)).toEqual([
    { id: gym?.id, name: "Praga Boxing Club", status: "draft", role: "owner" },
  ]);
  expect(sql(`SELECT count(*) FROM gym_staff_memberships WHERE gym_id = '${gym?.id}'`)).toBe("1");
  expect(sql(`SELECT phone FROM gyms WHERE id = '${gym?.id}'`)).toBe("+48 22 000 00 00");

  // H · completion without a location: the API's own missing-field answer.
  await page.goto("/en/app/onboarding/gym?step=branding");
  await expect(heading(page, "Branding")).toBeVisible();
  await page.getByRole("button", { name: "Create gym" }).click();
  await expect(page.getByText("Your gym is missing details.")).toBeVisible();
  const refused = await call(request, bearer(), "POST", `/api/v1/gyms/${gym?.id}/complete-setup`);
  expect(refused.status).toBe(422);
  expect(JSON.stringify(refused.body)).toContain("primary_location");
  expect(sql(`SELECT setup_status FROM gyms WHERE id = '${gym?.id}'`)).toBe("draft");
  await page.getByRole("button", { name: "Go to Location" }).click();

  // C · OG2 saves the real location.
  await fillOg2(page);
  await page.getByLabel("Entrance note · optional").fill("Courtyard, 1st floor");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Branding")).toBeVisible();
  expect(
    sql(
      `SELECT country_code || '|' || city || '|' || address_line || '|' || entrance_note || '|' || name FROM gym_locations WHERE gym_id = '${gym?.id}'`,
    ),
  ).toBe("PL|Warsaw|ul. Ząbkowska 31|Courtyard, 1st floor|Warsaw");

  // D · OG3 saves the optional branding (Back saves before moving).
  await page.getByRole("radio", { name: "Sky" }).check({ force: true });
  await page.getByRole("button", { name: "Back" }).click();
  await expect(heading(page, "Location")).toBeVisible();
  expect(sql(`SELECT accent_color FROM gyms WHERE id = '${gym?.id}'`)).toBe("#7fa7c9");

  // E · a reload resumes every persisted value.
  await page.reload();
  await expect(heading(page, "Location")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "City" })).toHaveValue("Warsaw");
  await page
    .locator("[data-setup-rail]")
    .getByRole("button", { name: /Gym name & type/ })
    .click();
  await expect(page.getByRole("textbox", { name: "Gym name" })).toHaveValue("Praga Boxing Club");
  await expect(page.getByRole("radio", { name: "Boxing club" })).toBeChecked();

  // F · sign out and back in: the entry resumes the same draft.
  await signOut(page, bearer());
  await signIn(page, email);
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/gym");
  await expect(heading(page, "Branding")).toBeVisible();
  await expect(page.locator("[data-setup-rail]")).toContainText("Praga Boxing Club");
  await expect(page.getByRole("radio", { name: "Sky" })).toBeChecked();
  expect(gymsOf(user)).toHaveLength(1);

  // G · another device resumes the same draft.
  const other = await newPage(browser);
  await signIn(other, email);
  await other.waitForURL((url) => url.pathname === "/en/app/onboarding/gym");
  await expect(heading(other, "Branding")).toBeVisible();
  await expect(other.locator("[data-setup-rail]")).toContainText("Praga Boxing Club");

  // L · the other device saves first; this tab's write is stale and changes nothing.
  await other.getByLabel("Tagline · optional").fill("From the other device");
  await other.getByRole("button", { name: "Back" }).click();
  await expect(heading(other, "Location")).toBeVisible();
  const revision = sql(`SELECT revision FROM gyms WHERE id = '${gym?.id}'`);
  await page.getByLabel("Tagline · optional").fill("Boxing for everyone.");
  await page.getByRole("button", { name: "Create gym" }).click();
  await expect(page.getByText("This gym changed on another device or tab.")).toBeVisible();
  expect(
    sql(
      `SELECT tagline || '|' || revision || '|' || setup_status FROM gyms WHERE id = '${gym?.id}'`,
    ),
  ).toBe(`From the other device|${revision}|draft`);
  await expect(page.getByLabel("Tagline · optional")).toHaveValue("Boxing for everyone.");
  // Reapplied explicitly against the latest revision, then completed.
  await page.getByRole("button", { name: "Save my changes" }).click();

  // I · completion → OG6b → Go to gym → the SF-84 destination.
  await expect(heading(page, "Praga Boxing Club is created.")).toBeVisible();
  expect(sql(`SELECT tagline || '|' || setup_status FROM gyms WHERE id = '${gym?.id}'`)).toBe(
    "Boxing for everyone.|completed",
  );
  await page.getByRole("button", { name: "Go to gym" }).click();
  await page.waitForURL((url) => /^\/en\/app\/gyms\/[0-9a-f-]+$/.test(url.pathname));
  const entry = await call(request, bearer(), "GET", "/api/v1/me/entry?intent=gym");
  expect(entry.status).toBe(200);
  expect(entry.body.entry).toMatchObject({ destination: "gym_home", gym_id: gym?.id });
  expect((entry.body.entry as { capabilities: string[] }).capabilities).toContain("GYM_WORKSPACE");
  // The other device: its reloaded setup no longer has a draft; it says so and leads to the gym.
  await other.reload();
  await expect(other.getByText("You already have a gym in SimpleFit.")).toBeVisible();
  await other.getByRole("link", { name: "Go to my gym" }).click();
  await other.waitForURL((url) => /^\/en\/app\/gyms\/[0-9a-f-]+$/.test(url.pathname));

  // O · a completed gym cannot be discarded as a draft.
  const discard = await call(request, bearer(), "DELETE", `/api/v1/gyms/${gym?.id}`);
  expect(discard.status).toBe(409);
  expect(sql(`SELECT setup_status FROM gyms WHERE id = '${gym?.id}'`)).toBe("completed");

  // P · another user reads and changes nothing of this gym.
  const stranger = await newPage(browser);
  const strangerBearer = sessionOf(stranger);
  await register(stranger, `e2e-stranger-${run()}@example.com`, "gym", "Sam Stranger");
  await stranger.waitForURL((url) => url.pathname === "/en/app/onboarding/gym");
  await expect(heading(stranger, "Gym name & type")).toBeVisible();
  await expect(stranger.getByRole("textbox", { name: "Gym name" })).toHaveValue("");
  await expect(stranger.getByText("Praga Boxing Club")).toHaveCount(0);
  const before = sql(`SELECT revision || '|' || name FROM gyms WHERE id = '${gym?.id}'`);
  for (const [method, path, data] of [
    ["GET", `/api/v1/gyms/${gym?.id}/setup`, undefined],
    ["GET", `/api/v1/gyms/${gym?.id}`, undefined],
    ["PATCH", `/api/v1/gyms/${gym?.id}/setup`, { name: "Taken", expected_revision: 1 }],
    [
      "PUT",
      `/api/v1/gyms/${gym?.id}/setup/primary-location`,
      { country_code: "PL", city: "X", address_line: "Y", expected_revision: 1 },
    ],
    ["POST", `/api/v1/gyms/${gym?.id}/complete-setup`, undefined],
    ["DELETE", `/api/v1/gyms/${gym?.id}`, undefined],
  ] as const) {
    const answer = await call(request, strangerBearer(), method, path, data);
    expect(answer.status, `${method} ${path}`).toBe(404);
  }
  const list = await call(request, strangerBearer(), "GET", "/api/v1/me/gyms");
  expect(list.body).toMatchObject({ gyms: [] });
  expect(sql(`SELECT revision || '|' || name FROM gyms WHERE id = '${gym?.id}'`)).toBe(before);

  owner = { email, user, gym: gym?.id ?? "" };
  await other.context().close();
  await stranger.context().close();
  await page.context().close();
});

test("K, M: a second gym — a lost create response makes no duplicate; the two stay isolated", async ({
  browser,
  request,
}) => {
  test.setTimeout(240_000);
  test.skip(!owner.gym, "needs the owner of the first journey");
  const page = await newPage(browser);
  const bearer = sessionOf(page);
  await signIn(page, owner.email);
  await page.waitForURL((url) => /^\/en\/app\/gyms\/[0-9a-f-]+$/.test(url.pathname));

  // An owner of a completed gym deliberately starts another (no draft exists).
  await page.goto("/en/app/onboarding/gym?intent=gym");
  await expect(page.getByText("You already have a gym in SimpleFit.")).toBeVisible();
  await fillOg1(page, "Wola Boxing");
  // M · the API commits the create, the browser never hears back.
  let lost = false;
  await page.route(`${API_URL}/api/v1/gyms`, async (route) => {
    if (route.request().method() === "POST" && !lost) {
      lost = true;
      await route.fetch();
      return route.abort("timedout");
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("We couldn’t confirm your gym was created.")).toBeVisible();
  expect(gymsOf(owner.user)).toHaveLength(2);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(heading(page, "Location")).toBeVisible();
  const gyms = gymsOf(owner.user);
  expect(gyms).toHaveLength(2);
  const second = gyms.find((gym) => gym.name === "Wola Boxing");
  expect(second?.status).toBe("draft");

  await fillOg2(page, "Warsaw", "ul. Wolska 50");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(heading(page, "Wola Boxing is created.")).toBeVisible();
  await page.getByRole("button", { name: "Go to gym" }).click();
  await page.waitForURL((url) => /^\/en\/app\/gyms\/[0-9a-f-]+$/.test(url.pathname));

  // K · two owned gyms, each with its own data; the entry follows the explicit choice.
  const first = await call(request, bearer(), "GET", `/api/v1/gyms/${owner.gym}/setup`);
  const next = await call(request, bearer(), "GET", `/api/v1/gyms/${second?.id}/setup`);
  expect(first.body.setup).toMatchObject({
    name: "Praga Boxing Club",
    tagline: "Boxing for everyone.",
    primary_location: { address_line: "ul. Ząbkowska 31" },
  });
  expect(next.body.setup).toMatchObject({
    name: "Wola Boxing",
    tagline: null,
    accent_color: null,
    primary_location: { address_line: "ul. Wolska 50" },
  });
  let entry = await call(request, bearer(), "GET", "/api/v1/me/entry?intent=gym");
  expect(entry.body.entry).toMatchObject({ destination: "gym_home", gym_id: second?.id });
  await call(request, bearer(), "PUT", "/api/v1/me/entry/context", {
    context: "gym",
    gym_id: owner.gym,
  });
  entry = await call(request, bearer(), "GET", "/api/v1/me/entry?intent=gym");
  expect(entry.body.entry).toMatchObject({ destination: "gym_home", gym_id: owner.gym });
  // A write naming one gym with the other's revision changes neither.
  const crossed = await call(request, bearer(), "PATCH", `/api/v1/gyms/${second?.id}/setup`, {
    name: "Crossed",
    expected_revision: (first.body.setup as { revision: number }).revision + 99,
  });
  expect(crossed.status).toBe(409);
  expect(sql(`SELECT name FROM gyms WHERE id = '${second?.id}'`)).toBe("Wola Boxing");
  await page.context().close();
});

test("N: a creation key replayed after its draft was discarded is refused; no gym appears", async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const email = `e2e-gym-discard-${run()}@example.com`;
  const page = await newPage(browser);
  const bearer = sessionOf(page);
  await register(page, email, "gym", "Dana Discard");
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/gym");
  const user = userId(email);
  await fillOg1(page, "Short-lived Gym");
  let lost = false;
  await page.route(`${API_URL}/api/v1/gyms`, async (route) => {
    if (route.request().method() === "POST" && !lost) {
      lost = true;
      await route.fetch();
      return route.abort("timedout");
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("We couldn’t confirm your gym was created.")).toBeVisible();
  const [draft] = gymsOf(user);
  expect(draft?.status).toBe("draft");

  // The draft is discarded elsewhere (the real discard API, as another client would).
  const discarded = await call(request, bearer(), "DELETE", `/api/v1/gyms/${draft?.id}`);
  expect(discarded.status).toBe(204);
  expect(gymsOf(user)).toEqual([]);

  // Retry repeats the spent key: 409, said truthfully, and nothing is created.
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("That gym draft was discarded.")).toBeVisible();
  expect(gymsOf(user)).toEqual([]);
  await expect(page.getByRole("textbox", { name: "Gym name" })).toHaveValue("Short-lived Gym");

  // Only the visitor's next explicit Continue starts a new gym, with a new key.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Location")).toBeVisible();
  const after = gymsOf(user);
  expect(after).toHaveLength(1);
  expect(after[0]?.id).not.toBe(draft?.id);
  await page.context().close();
});

test("J: a Coach who is also a Fighter gains Gym ownership and keeps both contexts", async ({
  browser,
  request,
}) => {
  test.setTimeout(300_000);
  const email = `e2e-gym-coach-${run()}@example.com`;
  const page = await newPage(browser);
  const bearer = sessionOf(page);
  await register(page, email, "coach");

  // Coach first (WCR1 → WCR2 → WCR7).
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/coach");
  await page.getByRole("textbox", { name: "Coach name" }).fill("Coach Alex");
  await page.getByRole("combobox", { name: "Country" }).click();
  await page.getByRole("combobox", { name: "Search countries" }).fill("Poland");
  await page.keyboard.press("Enter");
  await page.getByLabel("City").fill("Warsaw");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Personal Training").click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(heading(page, "Your coach profile is ready.")).toBeVisible();

  // Then Fighter (WF0 → WF1 → WF6).
  await page.goto("/en/app/onboarding/fighter?intent=fighter");
  await page.getByLabel("Name", { exact: true }).fill("Alex K.");
  await page.getByRole("textbox", { name: "Username" }).fill(`g${run()}`);
  await page.getByRole("combobox", { name: "Country" }).click();
  await page.getByRole("combobox", { name: "Search countries" }).fill("Poland");
  await page.keyboard.press("Enter");
  await page.getByLabel("City").fill("Warsaw");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Competitive amateur").click();
  await page.getByText("Orthodox").click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("link", { name: "Go to my home" })).toBeVisible();

  // Now a gym.
  await page.goto("/en/app/onboarding/gym?intent=gym");
  await fillOg1(page, "Coach Alex Gym");
  await page.getByRole("button", { name: "Continue" }).click();
  await fillOg2(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(heading(page, "Coach Alex Gym is created.")).toBeVisible();
  await page.getByRole("button", { name: "Go to gym" }).click();
  await page.waitForURL((url) => /^\/en\/app\/gyms\/[0-9a-f-]+$/.test(url.pathname));

  const entry = await call(request, bearer(), "GET", "/api/v1/me/entry");
  expect((entry.body.entry as { capabilities: string[] }).capabilities).toEqual(
    expect.arrayContaining(["FIGHTER", "COACH", "GYM_WORKSPACE"]),
  );
  // Both earlier workspaces still open.
  await page.goto("/en/app/coach");
  await expect(heading(page, "Welcome, Coach Alex")).toBeVisible();
  await page.goto("/en/app/home");
  await expect(heading(page, /Alex K\./)).toBeVisible();
  await page.context().close();
});
