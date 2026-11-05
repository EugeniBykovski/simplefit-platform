import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, type APIRequestContext, type Browser, type Page, test } from "@playwright/test";

/*
 * SF-134: joining a gym as a member on the web, end to end, on the production
 * build against the real API and PostgreSQL (playwright.real-api.config.ts),
 * journeys A–F of the ticket.
 *
 * What is the web UI and what is not, exactly:
 * - every member step (register, enter a code, join, open the E07 link, verify
 *   the invited address, accept, decline, cancel, leave, book) and every staff
 *   decision (turn on the code, rotate, auto-approve, approve, invite, withdraw,
 *   remove) is a browser action; no membership is created through the API or SQL;
 * - the E07 link is the one in the queued email, read through the test adapter
 *   (`mix e2e.member_invitation_token --link`) and opened as written;
 * - fixtures through the API, with the owner's real session: classes only (the
 *   timetable has its own spec). SQL only moves an expiry, resets rate limits
 *   and reads results;
 * - direct API calls by a member appear only where a refusal or another client's
 *   view is the point, and are marked as such;
 * - Google and Apple sign-in cannot run here and are not covered.
 */

const API_URL = process.env.E2E_REAL_API_URL ?? "";
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";
const API_LOG = process.env.E2E_API_LOG ?? "";
const EVIDENCE = process.env.E2E_EVIDENCE ?? "";
const WEB = "http://127.0.0.1:3100";

test.skip(!API_URL, "E2E_REAL_API_URL is not set: the real-backend journey needs a running API");
test.describe.configure({ mode: "serial" });
test.use({ actionTimeout: 30_000, navigationTimeout: 30_000 });

function disposableDatabase(): string {
  const name = new URL(DATABASE_URL).pathname.slice(1);
  if (!/e2e/.test(name) || name === "simple_fit_dev") {
    throw new Error("E2E_API_DATABASE_URL must name a disposable end-to-end database");
  }
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

/** Secrets the journey saw, to look for afterwards. Never printed. */
const secrets = new Set<string>();

function emailedCode(address: string): string {
  const code = mix(["e2e.email_code", address])
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^\d{6}$/.test(line));
  if (!code) throw new Error("no code was emailed");
  return code;
}

function emailedLink(address: string): { link: string; token: string } {
  const link = mix(["e2e.member_invitation_token", "--link", address])
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.includes("/invite/gym#token="));
  if (!link) throw new Error("no invitation was emailed");
  const token = link.split("#token=")[1] ?? "";
  secrets.add(token);
  return { link, token };
}

const resetRateLimits = () => sql("DELETE FROM auth_rate_limits; DELETE FROM rate_limit_events");
const userIdOf = (email: string) =>
  sql(
    `SELECT user_id FROM identities WHERE provider = 'email' AND lower(provider_subject) = lower('${email}')`,
  );
const gymIdOf = (name: string) => sql(`SELECT id FROM gyms WHERE name = '${name}'`);
const members = (gym: string, user: string) =>
  sql(
    `SELECT status || '|' || auto_approved FROM gym_members WHERE gym_id = '${gym}' AND user_id = '${user}' ORDER BY inserted_at`,
  );
const count = (table: string, where: string) =>
  Number(sql(`SELECT count(*) FROM ${table} WHERE ${where}`));
/** Joining gives a membership and nothing else. */
function expectOnlyMembership(user: string) {
  expect(count("fighter_profiles", `user_id = '${user}'`), "no fighter profile").toBe(0);
  expect(count("coach_profiles", `user_id = '${user}'`), "no coach profile").toBe(0);
  expect(count("gym_staff_memberships", `user_id = '${user}'`), "no staff membership").toBe(0);
}

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name });
const state = (page: Page, name: string) => page.locator(`[data-invitation-state="${name}"]`);
const joinState = (page: Page, name: string) => page.locator(`[data-join-state="${name}"]`);
const codeInput = (page: Page) => page.locator('[data-slot="code-input"]');
const rowOf = (page: Page, gym: string) => page.locator(`[data-member-gym="${gym}"]`);

type Watch = { traffic: string[]; console: string[] };
const watches: Watch[] = [];

async function newPage(browser: Browser) {
  const context = await browser.newContext({ baseURL: WEB, timezoneId: "Europe/Warsaw" });
  const page = await context.newPage();
  await page.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());
  const watch: Watch = { traffic: [], console: [] };
  watches.push(watch);
  page.on("request", (request) => {
    watch.traffic.push(request.url(), request.headers().referer ?? "");
  });
  page.on("console", (message) => watch.console.push(message.text()));
  return page;
}

function sessionOf(page: Page) {
  let bearer = "";
  page.on("request", (request) => {
    const header = request.headers().authorization;
    if (request.url().startsWith(API_URL) && header) bearer = header;
  });
  return () => bearer;
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

async function call(
  request: APIRequestContext,
  bearer: string,
  method: "GET" | "POST",
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

async function accountForm(page: Page, fullName: string) {
  await page.getByLabel("Full name").fill(fullName);
  await page.getByLabel("Date of birth").fill("1990-05-17");
  await page.getByRole("checkbox", { name: /Terms of Service/ }).click();
  await page.getByRole("checkbox", { name: /Privacy Policy/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
}

async function register(page: Page, email: string, fullName: string, intent?: string) {
  resetRateLimits();
  await go(page, `/en/signup/account${intent ? `?intent=${intent}` : ""}`);
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/en/signup/verify");
  await codeInput(page).pressSequentially(emailedCode(email));
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/account");
  await accountForm(page, fullName);
  await page.waitForURL((url) => url.pathname !== "/en/app/onboarding/account");
}

async function signIn(page: Page, email: string) {
  resetRateLimits();
  await go(page, "/en/login");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await page.waitForURL((url) => url.pathname === "/en/login/code");
  await codeInput(page).pressSequentially(emailedCode(email));
  await page.waitForURL((url) => url.pathname !== "/en/login/code");
}

/** The header's Sign out in the app frame, whichever is showing. */
async function signOut(page: Page) {
  const out = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/logout") && response.ok(),
  );
  const direct = page.getByRole("button", { name: "Sign out" }).locator("visible=true").first();
  const menu = page.getByRole("button", { name: "Open navigation" });
  await expect(direct.or(menu).first()).toBeVisible();
  if (!(await direct.isVisible())) await menu.click();
  await direct.click();
  await out;
}

async function createGym(page: Page, name: string) {
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
  await page.getByRole("button", { name: "Go to gym" }).click();
  await page.waitForURL(/\/en\/app\/gyms\/[0-9a-f-]+$/);
}

const tab = (page: Page, name: string | RegExp) => page.getByRole("tab", { name }).click();

/** The owner turns the join code on in the members console and reads it from the screen. */
async function turnOnCode(page: Page, gym: string) {
  await go(page, `/en/app/gyms/${gym}/members`);
  await tab(page, "Join code & approval");
  await page.getByRole("button", { name: "Turn on joining by code" }).click();
  const code = (await page.locator("[data-join-code]").textContent())?.trim() ?? "";
  expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  secrets.add(code);
  return code;
}

/** Fixture: one real class, through the API with the owner's session. */
async function scheduleClass(
  request: APIRequestContext,
  bearer: string,
  gym: string,
  title: string,
  capacity = 8,
) {
  const venue = await call(request, bearer, "POST", `/api/v1/gyms/${gym}/venues`, {
    client_request_id: randomUUID(),
    gym_location_id: sql(`SELECT id FROM gym_locations WHERE gym_id = '${gym}' LIMIT 1`),
    name: `Ring ${title}`,
    capacity: 40,
    time_zone: "Europe/Warsaw",
  });
  expect(venue.status, "venue").toBe(201);
  const venueId = (venue.body.venue as { venue_id: string }).venue_id;
  const template = await call(request, bearer, "POST", `/api/v1/gyms/${gym}/class-templates`, {
    client_request_id: randomUUID(),
    title,
    default_duration_minutes: 30,
    default_capacity: capacity,
    default_venue_id: venueId,
  });
  expect(template.status, "template").toBe(201);
  const at = new Date(Date.now() + 3 * 3_600_000);
  const created = await call(request, bearer, "POST", `/api/v1/gyms/${gym}/class-occurrences`, {
    client_request_id: randomUUID(),
    template_id: (template.body.template as { template_id: string }).template_id,
    starts_at: new Date(at.getTime() - (at.getTime() % 300_000)).toISOString(),
    capacity,
  });
  expect(created.status, "class").toBe(201);
  return (created.body.occurrence as { occurrence_id: string }).occurrence_id;
}

async function enterCode(page: Page, code: string) {
  await page.getByLabel("Gym code").fill(code);
  await page.getByRole("button", { name: "Find gym" }).click();
}

/** Books the named class through the member UI, on whichever day it falls. */
async function book(page: Page, gym: string, title: string) {
  await go(page, `/en/app/me/gyms/${gym}/classes`);
  await expect(heading(page, "Book a class")).toBeVisible();
  const row = page.locator("button[data-class-state]").filter({ hasText: title });
  await expect(page.locator("[data-member-day]").first()).toBeVisible();
  const days = await page.locator("[data-member-day]").count();
  for (let day = 0; day < days && (await row.count()) === 0; day += 1) {
    await page.locator("[data-member-day]").nth(day).click();
    await page.waitForTimeout(150);
  }
  await row.first().click();
  await page
    .locator("[data-member-class-details]")
    .getByRole("button", { name: "Confirm booking" })
    .click();
  await expect(page.locator("[data-booking-confirmed]")).toContainText("Booking confirmed");
}

const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const GYM_A = `Harbour ${tag}`;
const GYM_B = `Riverside ${tag}`;
const mail = (who: string) => `e2e-sf134-${who}-${tag}@example.com`;
const CLASS_A = `Technical ${tag}`;
const CLASS_B = `Sparring ${tag}`;

const results: Record<string, unknown> = {};

test("A–F: join by code, approval, auto-approval, E07, several gyms, security", async ({
  browser,
  request,
}) => {
  test.setTimeout(600_000);

  // Gym A and Gym B, owners in their own browsers (UI); classes as fixtures.
  const owner = await newPage(browser);
  const ownerBearer = sessionOf(owner);
  await register(owner, mail("owner"), "Yauheni Bykovski", "gym");
  await createGym(owner, GYM_A);
  const a = gymIdOf(GYM_A);
  await expect.poll(ownerBearer).not.toBe("");
  const classA = await scheduleClass(request, ownerBearer(), a, CLASS_A);

  const ownerB = await newPage(browser);
  const ownerBBearer = sessionOf(ownerB);
  await register(ownerB, mail("ownerb"), "Marta Nowak", "gym");
  await createGym(ownerB, GYM_B);
  const b = gymIdOf(GYM_B);
  await expect.poll(ownerBBearer).not.toBe("");
  await scheduleClass(request, ownerBBearer(), b, CLASS_B);
  const codeA = await turnOnCode(owner, a);
  const codeB = await turnOnCode(ownerB, b);

  // ── Journey A: a genuinely new user, by code, with the gym's approval.
  const marta = await newPage(browser);
  const martaBearer = sessionOf(marta);
  const martaEmail = mail("marta");
  await register(marta, martaEmail, "Marta Kowalska");
  // Role selection offers joining without choosing a role.
  await marta.waitForURL((url) => url.pathname === "/en/app/onboarding/role");
  const martaId = userIdOf(martaEmail);
  await marta.locator("[data-member-join-shortcut]").getByRole("link").click();
  await marta.waitForURL((url) => url.pathname === "/en/app/me/gyms/join");

  // Wrong format and an unknown code: one answer; nothing created.
  await enterCode(marta, "not a code");
  await expect(marta.locator('[data-join-problem="notFound"]')).toBeVisible();
  await enterCode(marta, "ZZZZ-ZZZZ");
  await expect(marta.locator('[data-join-problem="notFound"]')).toBeVisible();
  expect(members(a, martaId)).toBe("");

  // A forgiving, lower-case code finds the gym; previewing creates nothing.
  await enterCode(marta, codeA.toLowerCase().replace("-", " "));
  await expect(marta.locator("[data-join-gym]")).toHaveText(GYM_A);
  expect(members(a, martaId)).toBe("");
  expect(marta.url()).not.toContain(codeA);
  await marta.getByRole("button", { name: "Send join request" }).click();
  await expect(joinState(marta, "requested")).toBeVisible();
  expect(members(a, martaId)).toBe("requested|false");
  expectOnlyMembership(martaId);

  // My gyms says so; a duplicate attempt returns the same request.
  await marta.getByRole("link", { name: "Go to my gyms" }).click();
  await marta.waitForURL("**/en/app/me/gyms");
  await expect(rowOf(marta, a)).toHaveAttribute("data-membership-status", "requested");
  await go(marta, "/en/app/me/gyms/join");
  await enterCode(marta, codeA);
  await marta.getByRole("button", { name: "Send join request" }).click();
  await expect(joinState(marta, "requested")).toBeVisible();
  expect(count("gym_members", `gym_id = '${a}' AND user_id = '${martaId}'`)).toBe(1);

  // Not yet a member: the backend refuses classes.
  await expect.poll(martaBearer).not.toBe("");
  const martaRow = sql(
    `SELECT id FROM gym_members WHERE gym_id = '${a}' AND user_id = '${martaId}'`,
  );
  results["A classes before approval (direct API)"] = (
    await call(
      request,
      martaBearer(),
      "GET",
      `/api/v1/me/gym-memberships/${martaRow}/classes?from=2026-01-01&to=2026-01-02`,
    )
  ).status;
  expect(results["A classes before approval (direct API)"]).toBe(409);

  // The other client's view (the generated mobile client calls these same endpoints).
  const mobileView = await call(request, martaBearer(), "GET", "/api/v1/me/gym-memberships");
  expect(
    (mobileView.body.memberships as { gym_member_id: string; status: string }[]).find(
      (row) => row.gym_member_id === martaRow,
    )?.status,
  ).toBe("requested");

  // The owner approves in the members console.
  await go(owner, `/en/app/gyms/${a}/members`);
  await tab(owner, /^Join requests/);
  const requests = owner.locator("[data-members-requests]");
  await expect(requests).toContainText("Marta K.");
  await requests.getByRole("button", { name: "Approve Marta K." }).click();
  await expect.poll(() => members(a, martaId)).toBe("active|false");

  // The member refreshes: active, classes open, a real booking persists.
  await go(marta, "/en/app/me/gyms");
  await expect(rowOf(marta, a)).toHaveAttribute("data-membership-status", "active");
  expectOnlyMembership(martaId);
  await book(marta, a, CLASS_A);
  expect(
    count(
      "gym_class_bookings",
      `occurrence_id = '${classA}' AND gym_member_id = '${martaRow}' AND status = 'confirmed'`,
    ),
  ).toBe(1);
  await go(marta, "/en/app/me/bookings");
  await expect(marta.locator("[data-member-bookings=upcoming]")).toContainText(CLASS_A);

  // Persists across signing out and in; a member has no gym workspace.
  await signOut(marta);
  await signIn(marta, martaEmail);
  await go(marta, "/en/app/me/gyms");
  await expect(rowOf(marta, a)).toHaveAttribute("data-membership-status", "active");
  results["A member opens the staff API (direct API)"] = (
    await call(request, martaBearer(), "GET", `/api/v1/gyms/${a}/members`)
  ).status;
  expect(results["A member opens the staff API (direct API)"]).toBe(404);

  // ── Journey B: auto-approval, a verified user, active at once, books.
  await go(owner, `/en/app/gyms/${a}/members`);
  await tab(owner, "Join code & approval");
  await owner.getByRole("switch").click();
  await owner.getByRole("alertdialog").getByRole("button", { name: "Turn on" }).click();
  await expect(owner.getByRole("switch")).toBeChecked();
  const piotr = await newPage(browser);
  const piotrEmail = mail("piotr");
  await register(piotr, piotrEmail, "Piotr Lis");
  await go(piotr, "/en/app/me/gyms/join");
  await enterCode(piotr, codeA);
  await piotr.getByRole("button", { name: "Join gym" }).click();
  await expect(joinState(piotr, "active")).toBeVisible();
  const piotrId = userIdOf(piotrEmail);
  expect(members(a, piotrId)).toBe("active|true");
  expectOnlyMembership(piotrId);
  await book(piotr, a, CLASS_A);
  // Off again for the rest.
  await owner.getByRole("switch").click();
  const off = owner.getByRole("alertdialog");
  if (await off.isVisible().catch(() => false)) {
    await off.getByRole("button", { name: /Turn off/ }).click();
  }
  await expect(owner.getByRole("switch")).not.toBeChecked();

  // A rotated code stops at once.
  await owner.getByRole("button", { name: "New code" }).click();
  await owner.getByRole("alertdialog").getByRole("button", { name: "Issue new code" }).click();
  await expect(owner.locator("[data-join-code]")).not.toHaveText(codeA);
  const rotated = await newPage(browser);
  const rotatedEmail = mail("rotated");
  await register(rotated, rotatedEmail, "Rafał Tomczak");
  await go(rotated, "/en/app/me/gyms/join");
  resetRateLimits();
  await enterCode(rotated, codeA);
  await expect(rotated.locator('[data-join-problem="notFound"]')).toBeVisible();
  expect(count("gym_members", `user_id = '${userIdOf(rotatedEmail)}'`)).toBe(0);

  // Guessing codes hits the backend's limit, said plainly; nothing is created.
  resetRateLimits();
  let limited = false;
  for (let attempt = 0; attempt < 25 && !limited; attempt += 1) {
    const answer = rotated.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith("/gym-join/preview"),
    );
    await enterCode(rotated, "ZZZZ-ZZZZ");
    limited = (await answer).status() === 429;
  }
  expect(limited, "the backend limits code guesses").toBe(true);
  await expect(rotated.locator('[data-join-problem="limited"]')).toBeVisible();
  expect(count("gym_members", `user_id = '${userIdOf(rotatedEmail)}'`)).toBe(0);
  resetRateLimits();

  // ── Journey C: an E07 invitation, recipient with no account, through the page.
  await go(owner, `/en/app/gyms/${a}/members`);
  const invite = async (email: string) => {
    resetRateLimits();
    await owner.getByRole("button", { name: "Invite member" }).click();
    const dialog = owner.getByRole("dialog");
    await dialog.getByLabel("Email address").fill(email);
    await dialog.getByRole("button", { name: "Create invitation" }).click();
    await expect(dialog.getByText("Invitation pending")).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();
  };
  const ewaEmail = mail("ewa");
  await invite(ewaEmail);
  const ewaLink = emailedLink(ewaEmail);
  expect(new URL(ewaLink.link).origin).toBe(WEB);
  expect(new URL(ewaLink.link).pathname).toBe("/invite/gym");
  expect(new URL(ewaLink.link).search).toBe("");
  expect(new URL(ewaLink.link).hash).toMatch(/^#token=sgm_[A-Za-z0-9_-]{43}$/);

  const ewa = await newPage(browser);
  await ewa.goto(ewaLink.link);
  await expect(heading(ewa, `Join ${GYM_A} on SimpleFit.`)).toBeVisible();
  await expect.poll(() => ewa.url()).not.toContain("#token");
  expect(ewa.url()).not.toContain(ewaLink.token);
  await expect(ewa.getByText("Yauheni (Owner)")).toBeVisible();
  await expect(ewa.locator("main")).not.toContainText(ewaEmail);
  await expect(ewa.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
  expect(count("gym_members", `gym_id = '${a}' AND joined_via = 'invitation'`)).toBe(0);
  const stored = () =>
    ewa.evaluate(() => ({ local: JSON.stringify({ ...localStorage }), cookie: document.cookie }));
  expect((await stored()).local).not.toContain(ewaLink.token);
  expect((await stored()).cookie).not.toContain(ewaLink.token);

  await ewa.getByRole("link", { name: "Create account" }).click();
  await ewa.waitForURL((url) => url.pathname === "/en/signup/account");
  expect(ewa.url()).not.toContain("sgm_");
  resetRateLimits();
  await ewa.getByRole("textbox", { name: "Email" }).fill(ewaEmail);
  await ewa.getByRole("button", { name: "Create account" }).click();
  await ewa.waitForURL((url) => url.pathname === "/en/signup/verify");
  await codeInput(ewa).pressSequentially(emailedCode(ewaEmail));
  await ewa.waitForURL((url) => url.pathname === "/en/app/onboarding/account");
  await accountForm(ewa, "Ewa Mazur");
  await ewa.waitForURL((url) => url.pathname === "/en/invite/gym");
  const ewaId = userIdOf(ewaEmail);
  expect(members(a, ewaId)).toBe("");
  await ewa.getByRole("button", { name: "Accept invitation" }).click();
  await ewa.waitForURL(`**/en/app/me/gyms/${a}/classes`);
  expect(members(a, ewaId)).toBe("active|false");
  expectOnlyMembership(ewaId);
  expect(await ewa.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toContain(
    ewaLink.token,
  );
  await go(ewa, "/en/app/me/gyms");
  await expect(rowOf(ewa, a)).toHaveAttribute("data-membership-status", "active");
  await book(ewa, a, CLASS_A);

  // Replay: same account sees the truth; anonymous sees one state; nothing doubles.
  await ewa.goto(ewaLink.link);
  await expect(state(ewa, "already-accepted")).toBeVisible();
  expect(count("gym_members", `gym_id = '${a}' AND user_id = '${ewaId}'`)).toBe(1);
  const anon = await newPage(browser);
  await anon.goto(ewaLink.link);
  await expect(state(anon, "unavailable")).toBeVisible();
  await expect(anon.locator("main")).not.toContainText(GYM_A);

  // Existing account, different primary email: verify in place, same user, no merge.
  const olgaPrimary = mail("olgaprimary");
  const olgaInvited = mail("olgainvited");
  const olga = await newPage(browser);
  const olgaBearer = sessionOf(olga);
  await register(olga, olgaPrimary, "Olga Obca");
  const olgaId = userIdOf(olgaPrimary);
  await invite(olgaInvited);
  const olgaLink = emailedLink(olgaInvited);
  await olga.goto(olgaLink.link);
  await expect(state(olga, "wrong-account")).toBeVisible();
  await expect(olga.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
  await expect(olga.locator("main")).not.toContainText(olgaInvited);
  await expect.poll(olgaBearer).not.toBe("");
  results["E wrong account accepts by token (direct API)"] = (
    await call(request, olgaBearer(), "POST", "/api/v1/me/gym-invitations/accept", {
      token: olgaLink.token,
    })
  ).status;
  expect(results["E wrong account accepts by token (direct API)"]).toBe(403);
  const users = sql("SELECT count(*) FROM users");
  await olga.getByRole("button", { name: "Verify the invited email" }).click();
  resetRateLimits();
  await olga.getByRole("textbox", { name: "Email address" }).fill(olgaInvited);
  await olga.getByRole("button", { name: "Send code" }).click();
  const field = olga.getByRole("textbox", { name: "6-digit code" });
  await field.waitFor();
  expect(userIdOf(olgaInvited)).toBe("");
  results["E unverified accepts (direct API)"] = (
    await call(request, olgaBearer(), "POST", "/api/v1/me/gym-invitations/accept", {
      token: olgaLink.token,
    })
  ).status;
  expect(results["E unverified accepts (direct API)"]).toBe(403);
  await field.fill(emailedCode(olgaInvited));
  await expect(olga.getByRole("heading", { name: "Email verified" })).toBeVisible();
  expect(userIdOf(olgaInvited)).toBe(olgaId);
  expect(sql("SELECT count(*) FROM users")).toBe(users);
  expect(members(a, olgaId)).toBe("");

  // The verified address also opens the token-free inbox; the answer is explicit.
  await go(olga, "/en/app/me/gyms");
  await olga.locator("[data-member-inbox-link]").click();
  await olga.waitForURL("**/en/app/me/gyms/invitations");
  const row = olga.locator("[data-member-invitation]");
  await expect(row).toContainText(GYM_A);
  expect(members(a, olgaId)).toBe("");
  await row.getByRole("button", { name: `Accept the invitation from ${GYM_A}` }).click();
  await expect(olga.locator('[data-inbox-done="accepted"]')).toBeVisible();
  expect(members(a, olgaId)).toBe("active|false");
  await expect(olga.locator('[data-member-state="no-invitations"]')).toBeVisible();

  // Inbox decline, by the recipient with the invited address as their account.
  const danaEmail = mail("dana");
  const dana = await newPage(browser);
  await register(dana, danaEmail, "Dana Lis");
  await invite(danaEmail);
  const danaLink = emailedLink(danaEmail);
  await go(dana, "/en/app/me/gyms/invitations");
  await dana
    .locator("[data-member-invitation]")
    .getByRole("button", { name: /^Decline/ })
    .click();
  const confirm = dana.getByRole("alertdialog");
  await confirm.getByRole("button", { name: "Decline" }).click();
  await expect(dana.locator('[data-inbox-done="declined"]')).toBeVisible();
  expect(count("gym_members", `gym_id = '${a}' AND user_id = '${userIdOf(danaEmail)}'`)).toBe(0);
  await dana.goto(danaLink.link);
  await expect(state(dana, "declined")).toBeVisible();
  await expect(dana.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);

  // Withdrawn while the page is open: the next answer finds out.
  const nikaEmail = mail("nika");
  const nika = await newPage(browser);
  await register(nika, nikaEmail, "Nika Lis");
  await invite(nikaEmail);
  const nikaLink = emailedLink(nikaEmail);
  await nika.goto(nikaLink.link);
  await expect(nika.getByRole("button", { name: "Accept invitation" })).toBeVisible();
  const pendingRow = owner.locator("[data-member-invitation-status=pending]");
  await tab(owner, /^Invitations/);
  await pendingRow
    .getByRole("button", { name: /^Cancel the invitation for/ })
    .first()
    .click();
  await owner
    .getByRole("alertdialog")
    .getByRole("button", { name: /Cancel invitation/ })
    .click();
  await expect(pendingRow).toHaveCount(0);
  await nika.getByRole("button", { name: "Accept invitation" }).click();
  await expect(state(nika, "cancelled")).toBeVisible();
  expect(count("gym_members", `gym_id = '${a}' AND user_id = '${userIdOf(nikaEmail)}'`)).toBe(0);

  // Expired (time moved in the disposable database).
  const iraEmail = mail("ira");
  const ira = await newPage(browser);
  await register(ira, iraEmail, "Ira Lis");
  await tab(owner, "Members");
  await invite(iraEmail);
  const iraLink = emailedLink(iraEmail);
  sql(
    `UPDATE gym_member_invitations SET expires_at = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE gym_id = '${a}' AND status = 'pending'`,
  );
  await ira.goto(iraLink.link);
  await expect(state(ira, "expired")).toBeVisible();
  expect(count("gym_members", `gym_id = '${a}' AND user_id = '${userIdOf(iraEmail)}'`)).toBe(0);

  // A forged token, and another domain's shape in the fragment.
  const forged = await newPage(browser);
  await forged.goto(`/invite/gym#token=sgm_${"x".repeat(43)}`);
  await expect(state(forged, "unavailable")).toBeVisible();
  const otherShape = await newPage(browser);
  await otherShape.goto(`/invite/gym#token=sfs_${"x".repeat(43)}`);
  await expect(state(otherShape, "missing")).toBeVisible();
  expect(otherShape.url()).not.toContain("sfs_");

  // Account switch: the token never passes to the next person in this browser.
  const switchEmail = mail("switchright");
  const shared = await newPage(browser);
  await register(shared, mail("switchwrong"), "Jan Lis");
  await go(owner, `/en/app/gyms/${a}/members`);
  await invite(switchEmail);
  const switchLink = emailedLink(switchEmail);
  await shared.goto(switchLink.link);
  await expect(state(shared, "wrong-account")).toBeVisible();
  const gone = shared.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/logout") && response.ok(),
  );
  await shared.getByRole("button", { name: "Use another account" }).click();
  await gone;
  await expect
    .poll(() => shared.evaluate(() => JSON.stringify({ ...sessionStorage })))
    .not.toContain(switchLink.token);
  await shared.reload();
  await expect(state(shared, "missing")).toBeVisible();

  // Logout in another tab while the page offers the answer: it can't land.
  const flowEmail = mail("flow");
  const flow = await newPage(browser);
  await register(flow, flowEmail, "Iga Lis");
  await invite(flowEmail);
  const flowLink = emailedLink(flowEmail);
  const flowTab = await flow.context().newPage();
  await flowTab.goto(flowLink.link);
  const flowAccept = flowTab.getByRole("button", { name: "Accept invitation" });
  await expect(flowAccept).toBeVisible();
  await go(flow, "/en/app/me/gyms");
  await signOut(flow);
  if (await flowAccept.isVisible()) {
    await flowAccept.click({ timeout: 2_000 }).catch(() => undefined);
  }
  await expect(flowTab.locator('[data-invitation-state="pending"]')).toHaveCount(0);
  expect(count("gym_members", `gym_id = '${a}' AND user_id = '${userIdOf(flowEmail)}'`)).toBe(0);

  // ── Journey D: one person in two gyms; each is its own.
  await go(marta, "/en/app/me/gyms/join");
  resetRateLimits();
  await enterCode(marta, codeB);
  await marta.getByRole("button", { name: "Send join request" }).click();
  await expect(joinState(marta, "requested")).toBeVisible();
  await go(ownerB, `/en/app/gyms/${b}/members`);
  await tab(ownerB, /^Join requests/);
  await ownerB
    .locator("[data-members-requests]")
    .getByRole("button", { name: "Approve Marta K." })
    .click();
  await expect.poll(() => members(b, martaId)).toBe("active|false");
  await go(marta, "/en/app/me/gyms");
  await expect(rowOf(marta, a)).toHaveAttribute("data-membership-status", "active");
  await expect(rowOf(marta, b)).toHaveAttribute("data-membership-status", "active");
  // Each gym's classes are its own.
  await go(marta, `/en/app/me/gyms/${b}/classes`);
  await expect(heading(marta, "Book a class")).toBeVisible();
  await expect(marta.locator("main")).not.toContainText(CLASS_A);
  await book(marta, b, CLASS_B);
  // A's owner sees nothing of B, and vice versa.
  results["D owner of A reads gym B (direct API)"] = (
    await call(request, ownerBearer(), "GET", `/api/v1/gyms/${b}/members`)
  ).status;
  expect(results["D owner of A reads gym B (direct API)"]).toBe(404);

  // Leaving B: asks first, ends only B, releases only B's future booking.
  await go(marta, "/en/app/me/gyms");
  await marta.getByRole("button", { name: `Leave ${GYM_B}` }).click();
  await marta.getByRole("alertdialog").getByRole("button", { name: "Leave gym" }).click();
  await expect(rowOf(marta, b)).toHaveAttribute("data-membership-status", "ended");
  expect(members(a, martaId)).toBe("active|false");
  const rowB = sql(`SELECT id FROM gym_members WHERE gym_id = '${b}' AND user_id = '${martaId}'`);
  expect(
    count("gym_class_bookings", `gym_member_id = '${rowB}' AND status = 'confirmed'`),
    "B's bookings released",
  ).toBe(0);
  expect(
    count("gym_class_bookings", `gym_member_id = '${martaRow}' AND status = 'confirmed'`),
    "A's booking untouched",
  ).toBe(1);

  // Rejoining B is a new record; the old one stays final.
  await go(marta, "/en/app/me/gyms/join");
  resetRateLimits();
  await enterCode(marta, codeB);
  await marta.getByRole("button", { name: "Send join request" }).click();
  await expect(joinState(marta, "requested")).toBeVisible();
  expect(
    members(b, martaId)
      .split("\n")
      .map((line) => line.split("|")[0]),
  ).toEqual(["ended", "requested"]);
  // And a request can be cancelled.
  await go(marta, "/en/app/me/gyms");
  await marta.getByRole("button", { name: `Cancel the request to join ${GYM_B}` }).click();
  await marta.getByRole("alertdialog").getByRole("button", { name: "Cancel request" }).click();
  await expect(
    marta.locator(`[data-member-gym="${b}"][data-membership-status="cancelled"]`),
  ).toBeVisible();

  // A gym owner can also be a member elsewhere, and the workspace stays their own.
  await go(ownerB, "/en/app/me/gyms/join");
  resetRateLimits();
  await go(owner, `/en/app/gyms/${a}/members`);
  await tab(owner, "Join code & approval");
  const codeANow = (await owner.locator("[data-join-code]").textContent())?.trim() ?? "";
  secrets.add(codeANow);
  await enterCode(ownerB, codeANow);
  await ownerB.getByRole("button", { name: "Send join request" }).click();
  await expect(joinState(ownerB, "requested")).toBeVisible();
  const ownerBId = userIdOf(mail("ownerb"));
  expect(members(a, ownerBId)).toBe("requested|false");
  expect(
    sql(
      `SELECT role FROM gym_staff_memberships WHERE user_id = '${ownerBId}' AND status = 'active'`,
    ),
  ).toBe("owner");

  // Removal by the gym ends booking eligibility at once (E).
  await go(owner, `/en/app/gyms/${a}/members`);
  await owner.getByRole("button", { name: "Show details for Piotr L." }).click();
  await owner.getByRole("button", { name: "End membership" }).click();
  await owner.getByRole("alertdialog").getByRole("button", { name: "End membership" }).click();
  await expect.poll(() => members(a, piotrId)).toBe("ended|true");
  await go(piotr, "/en/app/me/gyms");
  await expect(rowOf(piotr, a)).toHaveAttribute("data-membership-status", "ended");
  await expect(rowOf(piotr, a)).toContainText("The gym ended this membership");
  await expect(rowOf(piotr, a).getByRole("link")).toHaveCount(0);

  // S · nothing of a token or code in traffic, console or the API's log.
  const seen = watches.flatMap((watch) => [...watch.traffic, ...watch.console]).join("\n");
  for (const secret of secrets) expect(seen.includes(secret)).toBe(false);
  if (API_LOG) {
    const log = readFileSync(API_LOG, "utf8");
    results["S API log bytes checked"] = log.length;
    for (const secret of secrets) {
      expect(log.includes(secret)).toBe(false);
      expect(log.includes(secret.replace("-", ""))).toBe(false);
    }
    expect(/sgm_[A-Za-z0-9_-]{43}/.test(log)).toBe(false);
  }

  results["completed"] = true;
  if (EVIDENCE) {
    writeFileSync(
      resolve(EVIDENCE, `journey-${test.info().project.name}.json`),
      `${JSON.stringify(results, null, 2)}\n`,
    );
  }
});
