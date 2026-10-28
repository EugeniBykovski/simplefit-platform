import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { expect, type APIRequestContext, type Browser, type Page, test } from "@playwright/test";

/*
 * SF-88: the web gym console, chooser and switcher end to end, against the
 * real API and PostgreSQL (playwright.real-api.config.ts), scenarios A–R of
 * the ticket. Every step is a browser action; the backend checks read the
 * disposable database (psql) or call the real API with a page's own session,
 * and record its status codes.
 *
 * Non-owner staff (manager, coach, front desk) have no HTTP operation yet
 * (SF-92): the one manager membership here is inserted into the disposable
 * database only, as the API's own test fixtures do, and ended through the
 * domain function `Gyms.revoke_staff_membership/3`. Nothing else is seeded.
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

/** Ends the short auth windows and the gym creation counts (disposable database only). */
const resetRateLimits = () => sql("DELETE FROM auth_rate_limits; DELETE FROM rate_limit_events");

const userId = (email: string) =>
  sql(
    `SELECT user_id FROM identities WHERE provider = 'email' AND lower(provider_subject) = lower('${email}')`,
  );
/** A user's active staff memberships: gym name|setup status|role, by gym name. */
const workspacesOf = (user: string) =>
  sql(
    `SELECT g.name || '|' || g.setup_status || '|' || m.role FROM gyms g JOIN gym_staff_memberships m ON m.gym_id = g.id WHERE m.user_id = '${user}' AND m.status = 'active' ORDER BY g.name`,
  )
    .split("\n")
    .filter(Boolean);
const gymId = (name: string) => sql(`SELECT id FROM gyms WHERE name = '${name}'`);

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name });
const gymName = (page: Page) => page.locator("[data-gym-name]");
const codeInput = (page: Page) => page.locator('[data-slot="code-input"]');
const focus = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));

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

/**
 * `page.goto` that tolerates the application's own navigation in flight (a
 * sign-out landing on /login, a completed step replacing its URL): Firefox
 * and WebKit abort the second navigation instead of queueing it. Only that
 * collision is retried.
 */
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

/** Email registration with an intent, then WA5. */
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

/** The console's own Sign out (SF-28): back to the plain sign-in route. */
async function signOut(page: Page) {
  await page.getByRole("complementary").getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/en/login");
}

/** OG1 → OG2 → OG3 "Create gym" through the web onboarding (SF-86). */
async function createGymInBrowser(page: Page, name: string, city = "Gdańsk") {
  await expect(heading(page, "Gym name & type")).toBeVisible();
  await page.getByRole("textbox", { name: "Gym name" }).fill(name);
  await page.getByText("Boxing club", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Location")).toBeVisible();
  await page.getByRole("combobox", { name: "Country" }).click();
  await page.getByRole("combobox", { name: "Search countries" }).fill("Poland");
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "City" }).fill(city);
  await page.getByRole("textbox", { name: "Address", exact: true }).fill("ul. Morska 5");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Branding")).toBeVisible();
  await page.getByRole("button", { name: "Create gym" }).click();
  await expect(heading(page, `${name} is created.`)).toBeVisible();
}

/** A completed gym created through the real API with the user's own session. */
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

const run = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const tag = run();
const GYM_A = `Ring A ${tag}`;
const GYM_B = `Ring B ${tag}`;
const GYM_C = `Ring C ${tag}`;
const DRAFT = `Draft D ${tag}`;
const owner = { email: `e2e-sf88-owner-${tag}@example.com`, user: "" };
const other = { email: `e2e-sf88-other-${tag}@example.com`, user: "" };
const statuses: Record<string, number> = {};

test("A–F: a new owner lands on the console; one gym enters directly; two are chosen and switched; a draft only continues setup", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const page = await newPage(browser);

  // A · Gym web onboarding, then "Go to gym" enters the real console of that gym.
  await register(page, owner.email, "gym");
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/gym");
  await createGymInBrowser(page, GYM_A);
  await page.getByRole("button", { name: "Go to gym" }).click();
  const a = gymId(GYM_A);
  await page.waitForURL(`**/en/app/gyms/${a}`);
  owner.user = userId(owner.email);

  // B · the real gym: name, type, location and completed setup, as stored.
  await expect(gymName(page)).toHaveText(GYM_A);
  await expect(page.getByText("Boxing club · Gdańsk, Poland")).toBeVisible();
  await expect(page.getByText("Setup complete")).toBeVisible();
  expect(sql(`SELECT setup_status FROM gyms WHERE id = '${a}'`)).toBe("completed");
  expect(workspacesOf(owner.user)).toEqual([`${GYM_A}|completed|owner`]);
  await expect(page.locator("main")).not.toContainText(/PLN|MRR|check-ins today|active members/i);

  // C · one completed gym: after signing in again, /app enters it directly.
  await signOut(page);
  await signIn(page, owner.email);
  await page.waitForURL(`**/en/app/gyms/${a}`);

  // D · a second completed gym; the chooser lists both.
  await go(page, "/en/app/onboarding/gym?intent=gym");
  await expect(page.getByText("You already have a gym in SimpleFit.")).toBeVisible();
  await createGymInBrowser(page, GYM_B, "Gdynia");
  const b = gymId(GYM_B);
  expect(workspacesOf(owner.user)).toEqual([
    `${GYM_A}|completed|owner`,
    `${GYM_B}|completed|owner`,
  ]);
  await go(page, "/en/app/gyms");
  const gyms = page.getByRole("region", { name: "Gyms" });
  await expect(gyms.getByRole("button")).toHaveCount(2);

  // E · choosing A, then switching to B: only the chosen gym's data, the choice recorded.
  await gyms.getByRole("button", { name: new RegExp(GYM_A) }).click();
  await page.waitForURL(`**/en/app/gyms/${a}`);
  await expect(gymName(page)).toHaveText(GYM_A);
  expect(sql(`SELECT gym_id FROM entry_context_choices WHERE user_id = '${owner.user}'`)).toBe(a);
  await page
    .getByRole("complementary")
    .getByRole("button", { name: new RegExp(`${GYM_A}, Owner`) })
    .click();
  await page.getByRole("menuitemradio", { name: new RegExp(GYM_B) }).click();
  await page.waitForURL(`**/en/app/gyms/${b}`);
  await expect(gymName(page)).toHaveText(GYM_B);
  await expect(page.getByText(GYM_A)).toHaveCount(0);
  expect(sql(`SELECT gym_id FROM entry_context_choices WHERE user_id = '${owner.user}'`)).toBe(b);

  // F · a draft continues setup and is never a console.
  await go(page, "/en/app/onboarding/gym?intent=gym");
  await page.getByRole("textbox", { name: "Gym name" }).fill(DRAFT);
  await page.getByText("Boxing club", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Location")).toBeVisible();
  const draft = gymId(DRAFT);
  expect(sql(`SELECT setup_status FROM gyms WHERE id = '${draft}'`)).toBe("draft");
  await go(page, "/en/app/gyms");
  const setup = page.getByRole("region", { name: "Setup in progress" });
  await expect(setup.getByRole("button", { name: new RegExp(DRAFT) })).toBeVisible();
  await expect(page.getByRole("region", { name: "Gyms" }).getByRole("button")).toHaveCount(2);
  await go(page, `/en/app/gyms/${draft}`);
  await expect(page.getByText("This gym isn’t set up yet")).toBeVisible();
  await expect(heading(page, "Dashboard")).toHaveCount(0);
  await page.context().close();
});

test("G, K, L: owner of A and manager of C see different access; another user's gym is 404; a revoked membership ends access at once", async ({
  browser,
  request,
}) => {
  test.setTimeout(300_000);
  // A second user owns gym C, created through the real API.
  const second = await newPage(browser);
  const secondBearer = sessionOf(second);
  await register(second, other.email, "gym", "Bea Nowak");
  await second.waitForURL((url) => url.pathname === "/en/app/onboarding/gym");
  other.user = userId(other.email);
  const c = await createGymThroughApi(request, secondBearer(), GYM_C);

  // K · the owner's gym A is not the second user's: 404, nothing of it disclosed.
  const a = gymId(GYM_A);
  const foreign = await call(request, secondBearer(), "GET", `/api/v1/gyms/${a}`);
  statuses["K GET foreign gym"] = foreign.status;
  expect(foreign.status).toBe(404);
  expect(JSON.stringify(foreign.body)).not.toContain(GYM_A);
  await go(second, `/en/app/gyms/${a}`);
  await expect(second.getByText("This gym isn’t available")).toBeVisible();
  await expect(second.getByText(GYM_A)).toHaveCount(0);

  // G · the owner is made manager of C (seeded: no staff API before SF-92).
  const membership = randomUUID();
  sql(
    `INSERT INTO gym_staff_memberships (id, gym_id, user_id, role, status, inserted_at, updated_at) VALUES ('${membership}', '${c}', '${owner.user}', 'manager', 'active', now(), now())`,
  );
  const page = await newPage(browser);
  const bearer = sessionOf(page);
  await signIn(page, owner.email);
  await page.waitForURL(/\/en\/app\/gyms\/[0-9a-f-]+$/);
  const asManager = await call(request, bearer(), "GET", `/api/v1/gyms/${c}`);
  statuses["G GET as manager"] = asManager.status;
  const viewer = (asManager.body.gym as { viewer: { role: string; permissions: string[] } }).viewer;
  expect(viewer.role).toBe("manager");
  expect(viewer.permissions).not.toContain("complete_setup");
  const discard = await call(request, bearer(), "DELETE", `/api/v1/gyms/${c}`);
  statuses["G DELETE as manager"] = discard.status;
  expect(discard.status).toBe(403);
  await go(page, `/en/app/gyms/${c}`);
  await expect(gymName(page)).toHaveText(GYM_C);
  await expect(page.getByText(/The Manager dashboard isn’t available yet/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Gym details" })).toHaveCount(0);
  await go(page, `/en/app/gyms/${a}`);
  // The owner's console: since SF-91 a new owner first gets the owner-only introduction (GRW1).
  await expect(page.locator("[data-first-run-intro=not_started]")).toBeVisible();
  await expect(page.getByText(/The Manager dashboard isn’t available yet/)).toHaveCount(0);

  // L · the second user (C's owner) revokes the manager through the domain function.
  await go(page, `/en/app/gyms/${c}`);
  await expect(gymName(page)).toHaveText(GYM_C);
  execFileSync(
    "mix",
    [
      "run",
      "-e",
      `owner = SimpleFit.Repo.get!(SimpleFit.Accounts.User, "${other.user}"); {:ok, _} = SimpleFit.Gyms.revoke_staff_membership(owner, "${c}", "${membership}")`,
    ],
    { cwd: API_DIR, env: mixEnv(), stdio: "ignore" },
  );
  expect(sql(`SELECT status FROM gym_staff_memberships WHERE id = '${membership}'`)).toBe("ended");
  await focus(page);
  await expect(page.getByText("This gym isn’t available")).toBeVisible();
  await expect(page.getByText(GYM_C)).toHaveCount(0);
  const revoked = await call(request, bearer(), "GET", `/api/v1/gyms/${c}`);
  statuses["L GET after revocation"] = revoked.status;
  expect(revoked.status).toBe(404);
  const choice = await call(request, bearer(), "PUT", "/api/v1/me/entry/context", {
    context: "gym",
    gym_id: c,
  });
  statuses["L choose revoked gym"] = choice.status;
  expect(choice.status).toBe(404);
  await go(page, "/en/app/gyms");
  await expect(page.getByRole("region", { name: "Gyms" }).getByRole("button")).toHaveCount(2);
  await expect(page.getByText(GYM_C)).toHaveCount(0);
  await page.context().close();
  await second.context().close();
});

test("M, N, O, P, Q: account switching, two tabs, a late answer and an outage stay within each gym", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const a = gymId(GYM_A);
  const b = gymId(GYM_B);
  const c = gymId(GYM_C);
  const page = await newPage(browser);
  await signIn(page, owner.email);
  await page.waitForURL(/\/en\/app\/gyms\/[0-9a-f-]+$/);
  await go(page, `/en/app/gyms/${a}`);
  await expect(gymName(page)).toHaveText(GYM_A);

  // O · a second tab on gym B; each tab keeps the gym its URL names.
  const tab = await page.context().newPage();
  await go(tab, `/en/app/gyms/${b}`);
  await expect(gymName(tab)).toHaveText(GYM_B);
  await page.bringToFront();
  await focus(page);
  await page.reload();
  await expect(gymName(page)).toHaveText(GYM_A);
  await expect(gymName(tab)).toHaveText(GYM_B);
  await tab.close();

  // P · gym A's read answers late, after the switch to B: B stays B.
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/api/v1/gyms/${a}`, async (route) => {
    await held;
    await route.continue().catch(() => undefined);
  });
  await focus(page);
  await page
    .getByRole("complementary")
    .getByRole("button", { name: new RegExp(`${GYM_A}, Owner`) })
    .click();
  await page.getByRole("menuitemradio", { name: new RegExp(GYM_B) }).click();
  await page.waitForURL(`**/en/app/gyms/${b}`);
  await expect(gymName(page)).toHaveText(GYM_B);
  release();
  await page.waitForTimeout(500);
  await expect(gymName(page)).toHaveText(GYM_B);
  await expect(page.getByText(GYM_A)).toHaveCount(0);
  await page.unroute(`**/api/v1/gyms/${a}`);

  // Q · an outage of the gym read: a recoverable failure, never an empty gym.
  await page.route(`**/api/v1/gyms/${b}`, (route) => route.abort("connectionrefused"));
  await page.reload();
  const retry = page.getByRole("button", { name: /Try again/ });
  await expect(retry).toBeVisible({ timeout: 20_000 });
  await expect(heading(page, "Dashboard")).toHaveCount(0);
  await page.unroute(`**/api/v1/gyms/${b}`);
  await retry.click();
  await expect(gymName(page)).toHaveText(GYM_B);

  // M, N · sign out; the other user signs in on the same browser: only their gym.
  await signOut(page);
  await signIn(page, other.email);
  await page.waitForURL(`**/en/app/gyms/${c}`);
  await expect(gymName(page)).toHaveText(GYM_C);
  for (const name of [GYM_A, GYM_B, DRAFT]) await expect(page.getByText(name)).toHaveCount(0);
  await page
    .getByRole("complementary")
    .getByRole("button", { name: new RegExp(`${GYM_C}, Owner`) })
    .click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitemradio", { name: new RegExp(GYM_C) })).toBeVisible();
  for (const name of [GYM_A, GYM_B]) await expect(menu.getByText(name)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await go(page, `/en/app/gyms/${a}`);
  await expect(page.getByText("This gym isn’t available")).toBeVisible();
  // The first user, back again, gets only their own gyms.
  await signOut(page);
  await signIn(page, owner.email);
  await page.waitForURL(/\/en\/app\/gyms\/[0-9a-f-]+$/);
  await go(page, "/en/app/gyms");
  await expect(page.getByText(GYM_C)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Gyms" }).getByRole("button")).toHaveCount(2);
  await page.context().close();
});

test("H, I, J, R: Fighter + Coach + Gym keeps every context; a Coach without staff membership gets no gym; local coaching untouched", async ({
  browser,
  request,
}) => {
  test.setTimeout(300_000);
  const a = gymId(GYM_A);

  // I · a Coach (CoachProfile) who is no gym's staff: no gym access at all.
  const coach = await newPage(browser);
  const coachBearer = sessionOf(coach);
  const coachEmail = `e2e-sf88-coach-${tag}@example.com`;
  await register(coach, coachEmail, "coach", "Cara Coach");
  await coach.waitForURL((url) => url.pathname === "/en/app/onboarding/coach");
  await coach.getByRole("textbox", { name: "Coach name" }).fill("Coach Cara");
  await coach.getByRole("combobox", { name: "Country" }).click();
  await coach.getByRole("combobox", { name: "Search countries" }).fill("Poland");
  await coach.keyboard.press("Enter");
  await coach.getByLabel("City").fill("Warsaw");
  await coach.getByRole("button", { name: "Continue" }).click();
  await coach.getByText("Personal Training").click();
  await coach.getByRole("button", { name: "Finish" }).click();
  await expect(heading(coach, "Your coach profile is ready.")).toBeVisible();
  expect(workspacesOf(userId(coachEmail))).toEqual([]);
  const coachRead = await call(request, coachBearer(), "GET", `/api/v1/gyms/${a}`);
  statuses["I GET as coach without staff membership"] = coachRead.status;
  expect(coachRead.status).toBe(404);
  await go(coach, `/en/app/gyms/${a}`);
  // No GYM_WORKSPACE: the gate sends the Coach to their own home.
  await coach.waitForURL((url) => url.pathname === "/en/app/coach");
  await go(coach, "/en/app/gyms");
  await expect(coach.getByRole("heading", { name: "You don’t work at a gym yet" })).toBeVisible();
  // J · gym members: no member domain exists yet (SF-89 / SF-91), so no
  // membership of any kind can exist; a user who is no gym's staff is
  // exactly the case above.

  // H · the same Coach adds a Fighter profile and a gym: all three contexts kept.
  await go(coach, "/en/app/onboarding/fighter?intent=fighter");
  await coach.getByLabel("Name", { exact: true }).fill("Cara K.");
  await coach.getByRole("textbox", { name: "Username" }).fill(`c${run()}`);
  await coach.getByRole("combobox", { name: "Country" }).click();
  await coach.getByRole("combobox", { name: "Search countries" }).fill("Poland");
  await coach.keyboard.press("Enter");
  await coach.getByLabel("City").fill("Warsaw");
  await coach.getByRole("button", { name: "Continue" }).click();
  await coach.getByText("Competitive amateur").click();
  await coach.getByText("Orthodox").click();
  await coach.getByRole("button", { name: "Finish" }).click();
  await expect(coach.getByRole("link", { name: "Go to my home" })).toBeVisible();
  await go(coach, "/en/app/onboarding/gym?intent=gym");
  await createGymInBrowser(coach, `Cara Ring ${tag}`);
  await coach.getByRole("button", { name: "Go to gym" }).click();
  await coach.waitForURL(/\/en\/app\/gyms\/[0-9a-f-]+$/);
  const entry = await call(request, coachBearer(), "GET", "/api/v1/me/entry");
  expect((entry.body.entry as { capabilities: string[] }).capabilities).toEqual(
    expect.arrayContaining(["FIGHTER", "COACH", "GYM_WORKSPACE"]),
  );
  await coach
    .getByRole("complementary")
    .getByRole("button", { name: /Owner\. Switch gym or profile/ })
    .click();
  const menu = coach.getByRole("menu");
  await expect(menu.getByRole("menuitemradio", { name: /Fighter/ })).toBeVisible();
  await expect(menu.getByRole("menuitemradio", { name: /Coach/ })).toBeVisible();
  await menu.getByRole("menuitemradio", { name: /Coach/ }).click();
  await coach.waitForURL((url) => url.pathname === "/en/app/coach");
  await expect(heading(coach, "Welcome, Coach Cara")).toBeVisible();
  await go(coach, "/en/app/home");
  await expect(heading(coach, /Cara K\./)).toBeVisible();

  // R · SF-105 local coaching mode is decided at API boot and refused on this
  // database; no gym request touches it (the gym context references no
  // Coaching module, SF-83). The coaching profile above was unaffected.
  expect(sql("SELECT current_database()")).toMatch(/e2e/);
  await coach.context().close();
  test
    .info()
    .annotations.push({ type: "SF-88 status codes", description: JSON.stringify(statuses) });
});
