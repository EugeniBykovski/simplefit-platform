import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import {
  expect,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
  test,
} from "@playwright/test";

/*
 * SF-98: the gym timetable end to end, against the real API and PostgreSQL
 * (playwright.real-api.config.ts), scenarios A–AJ of the ticket.
 *
 * What is the web UI and what is not, exactly:
 * - every owner, manager, coach and front desk step on the timetable (open
 *   it, add a venue and a template, schedule one-time and weekly classes,
 *   assign an instructor, change and cancel a class, cancel a series, the
 *   DST gap and repeated hour, the stale revision and the lost answer) is a
 *   browser action on the production build;
 * - the staff acceptances (`/me/staff-invitations`, SF-93), Gym B's own
 *   setup and its class (AE), the other editor of the stale revision (X)
 *   and every refusal check are the real API called with a page's own
 *   session (backend-assisted), recorded with their status codes;
 * - backend checks read the disposable database (psql).
 * Nothing is booked, attended or paid: those domains do not exist.
 */

const API_URL = process.env.E2E_REAL_API_URL ?? "";
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
/** The API server's log of this run (AJ): scanned for secrets, never printed. */
const API_LOG = process.env.E2E_API_LOG ?? "";
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";
/** Where the run's evidence (statuses, ids, counts, instants) is written, if set. */
const EVIDENCE = process.env.E2E_EVIDENCE ?? "";

test.skip(!API_URL, "E2E_REAL_API_URL is not set: the real-backend journey needs a running API");
test.describe.configure({ mode: "serial" });

function disposableDatabase(): string {
  const name = new URL(DATABASE_URL).pathname.slice(1);
  if (!/e2e/.test(name) || name === "simple_fit_dev") {
    throw new Error("E2E_API_DATABASE_URL must name a disposable end-to-end database");
  }
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

const resetRateLimits = () => sql("DELETE FROM auth_rate_limits; DELETE FROM rate_limit_events");
const userId = (email: string) =>
  sql(
    `SELECT user_id FROM identities WHERE provider = 'email' AND lower(provider_subject) = lower('${email}')`,
  );
const gymIdOf = (name: string) => sql(`SELECT id FROM gyms WHERE name = '${name}'`);
const count = (table: string, where = "true") =>
  Number(sql(`SELECT count(*) FROM ${table} WHERE ${where}`));
const staffRow = (gym: string, user: string) =>
  sql(
    `SELECT id FROM gym_staff_memberships WHERE gym_id = '${gym}' AND user_id = '${user}' AND status = 'active'`,
  );
/** A class row: `status|cancel_reason|starts_at (UTC)|revision`. */
const classRow = (id: string) =>
  sql(
    `SELECT status || '|' || coalesce(cancel_reason, '') || '|' || to_char(starts_at, 'YYYY-MM-DD"T"HH24:MI') || '|' || revision FROM gym_class_occurrences WHERE id = '${id}'`,
  );
const classesOf = (gym: string, where = "true") =>
  count("gym_class_occurrences", `gym_id = '${gym}' AND ${where}`);

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name });
const codeInput = (page: Page) => page.locator('[data-slot="code-input"]');
const focus = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
const timetable = (page: Page) => page.locator("[data-timetable]");
const listed = (page: Page) => page.locator("[data-list-view] [data-occurrence]");

/** The console's navigation: the sidebar on wide screens, the menu sheet on phones. */
async function navigation(page: Page) {
  const sidebar = page.getByRole("complementary").filter({ has: page.getByRole("navigation") });
  if (await sidebar.isVisible()) return sidebar;
  await page.getByRole("button", { name: "Open navigation" }).click();
  return page.getByRole("dialog");
}

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

async function newPage(browser: Browser, timezoneId?: string) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    ...(timezoneId ? { timezoneId } : {}),
  });
  const page = await context.newPage();
  await page.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());
  return page;
}

async function register(page: Page, email: string, intent: string, fullName: string) {
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

async function createGymThroughApi(request: APIRequestContext, bearer: string, name: string) {
  const created = await call(request, bearer, "POST", "/api/v1/gyms", {
    client_request_id: randomUUID(),
    name,
    gym_type: "boxing_gym",
  });
  expect(created.status).toBe(201);
  const id = (created.body.gym as { id: string }).id;
  expect(
    (
      await call(request, bearer, "PUT", `/api/v1/gyms/${id}/setup/primary-location`, {
        expected_revision: 1,
        country_code: "PL",
        city: "Kraków",
        address_line: "ul. Długa 1",
      })
    ).status,
  ).toBe(200);
  expect((await call(request, bearer, "POST", `/api/v1/gyms/${id}/complete-setup`)).status).toBe(
    200,
  );
  return id;
}

/** Staff join through the SF-93 recipient API with their own session (no recipient UI yet). */
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
    { email, role },
  );
  expect(invited.status).toBe(201);
  const inbox = await call(
    request,
    staffBearer,
    "GET",
    "/api/v1/me/staff-invitations?status=pending",
  );
  const item = (
    inbox.body.invitations as { invitation_id: string; gym: { gym_id: string } }[]
  ).find((invitation) => invitation.gym.gym_id === gymId);
  if (!item) throw new Error("the staff invitation is not in the recipient's inbox");
  const accepted = await call(
    request,
    staffBearer,
    "POST",
    `/api/v1/me/staff-invitations/${item.invitation_id}/accept`,
  );
  expect(accepted.status).toBe(200);
}

/** Chooses `option` in the labelled select of `scope` (Radix: a listbox in a portal). */
async function choose(page: Page, scope: Locator, label: string, option: string | RegExp) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option }).click();
}

/** Shows the timetable's list of the week holding `date` (every viewport has the list). */
async function listWeek(page: Page, date: string) {
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByLabel("Go to date").fill(date);
  // English weeks start on Sunday: wait for that week's window, then for all its pages.
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - day.getUTCDay());
  await expect(timetable(page)).toHaveAttribute(
    "data-timetable-from",
    day.toISOString().slice(0, 10),
  );
  await expect(timetable(page)).toHaveAttribute("data-timetable-complete", "true");
}

/** Opens the class whose list card starts at `local` (the backend's wall time). */
async function openClass(page: Page, local: string) {
  await page.locator(`[data-list-view] [data-local-start="${local}"]`).first().click();
  return page.locator("[data-occurrence-details]");
}

/** The class form, filled for a one-time class at `date` `time` (template and venue preset or chosen). */
async function oneTime(
  page: Page,
  {
    date,
    time,
    venue,
    instructor,
  }: { date: string; time: string; venue?: string; instructor?: string },
) {
  await page.getByRole("button", { name: "Class", exact: true }).click();
  const form = page.getByRole("dialog", { name: "New class" });
  if (venue) await choose(page, form, "Venue", new RegExp(`^${venue} ·`));
  await form.getByLabel("Date", { exact: true }).fill(date);
  await form.getByLabel(/^Start time/).fill(time);
  if (instructor) await choose(page, form, "Instructor", instructor);
  return form;
}

const run = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const tag = run();
const GYM_A = `Timetable A ${tag}`;
const GYM_B = `Timetable B ${tag}`;
const person = (key: string, name: string) => ({
  email: `e2e-sf98-${key}-${tag}@example.com`,
  name,
});
const people = {
  owner: person("owner", "Yauheni Bykovski"),
  manager: person("manager", "Agnieszka Lis"),
  coach: person("coach", "Tomasz Zieliński"),
  desk: person("desk", "Michał Sowa"),
  ownerB: person("ownerb", "Ola Nowak"),
};
const evidence: Record<string, unknown> = {};
const statuses: Record<string, number> = {};

test("A–AJ: the gym timetable on the web against the real SF-97 backend", async ({
  browser,
  request,
}) => {
  test.setTimeout(600_000);
  const before = {
    trainingSessions: count("training_sessions"),
    gymMembers: count("gym_members"),
    relationships: count("coach_fighter_relationships"),
  };

  // A · the owner registers and creates Gym A in the web onboarding. Their device is in
  // New York: every class must still show its Warsaw wall time (T).
  const owner = await newPage(browser, "America/New_York");
  const ownerBearer = sessionOf(owner);
  await register(owner, people.owner.email, "gym", people.owner.name);
  await owner.waitForURL((url) => url.pathname === "/en/app/onboarding/gym");
  await createGymInBrowser(owner, GYM_A);
  await owner.getByRole("button", { name: "Go to gym" }).click();
  const a = gymIdOf(GYM_A);
  await owner.waitForURL(`**/en/app/gyms/${a}`);
  evidence.gymA = a;

  // AF (before) · add_class is available, not done, and leads to the timetable.
  const milestone = owner.locator("[data-checklist-key=add_class]");
  await expect(milestone).toHaveAttribute("data-checklist-status", "available");

  // C · the owner opens Timetable from the console's sidebar.
  await (await navigation(owner)).getByRole("link", { name: "Timetable" }).click();
  await owner.waitForURL(`**/en/app/gyms/${a}/timetable`);
  await expect(heading(owner, "Timetable")).toBeVisible();

  // D · the empty timetable is truthful: no venue yet, no class anywhere, no sample.
  await expect(owner.locator("[data-timetable-empty=venue]")).toContainText("Add a venue first");
  expect(classesOf(a)).toBe(0);
  expect(count("gym_venues", `gym_id = '${a}'`)).toBe(0);

  // B · the owner adds a venue at the gym's location, in Europe/Warsaw, for 20 people.
  await owner.getByRole("button", { name: "Add a venue" }).click();
  const venueForm = owner.getByRole("dialog", { name: "New venue" });
  await venueForm.getByLabel("Name").fill("Ring 2");
  await venueForm.getByRole("combobox", { name: "Time zone" }).click();
  await owner.getByRole("combobox", { name: "Search time zones" }).fill("Europe/Warsaw");
  await owner.keyboard.press("Enter");
  await venueForm.getByLabel("Capacity (optional)").fill("20");
  await venueForm.getByRole("button", { name: "Add venue" }).click();
  await expect(owner.locator("[data-timetable-empty=template]")).toBeVisible();
  const ring2 = sql(`SELECT id FROM gym_venues WHERE gym_id = '${a}' AND name = 'Ring 2'`);
  expect(sql(`SELECT time_zone || '|' || capacity FROM gym_venues WHERE id = '${ring2}'`)).toBe(
    "Europe/Warsaw|20",
  );

  // E · the owner adds a class template.
  await owner.getByRole("button", { name: "Add a class template" }).click();
  const templateForm = owner.getByRole("dialog", { name: "New class template" });
  await templateForm.getByLabel("Class name").fill("Technical boxing");
  await templateForm.getByLabel("Default length").fill("90");
  await templateForm.getByLabel("Default capacity").fill("16");
  await choose(owner, templateForm, "Default venue (optional)", /^Ring 2/);
  await templateForm.getByRole("button", { name: "Add template" }).click();
  await expect(owner.locator("[data-timetable-empty=free]")).toBeVisible();
  // A template alone is not a class: the milestone stays available.
  expect(count("gym_class_templates", `gym_id = '${a}'`)).toBe(1);
  expect(classesOf(a)).toBe(0);

  // Staff join Gym A (API, their own sessions): a manager, a coach and a front desk.
  const manager = await newPage(browser);
  const managerBearer = sessionOf(manager);
  await register(manager, people.manager.email, "fighter", people.manager.name);
  const coach = await newPage(browser);
  const coachBearer = sessionOf(coach);
  await register(coach, people.coach.email, "fighter", people.coach.name);
  const desk = await newPage(browser);
  const deskBearer = sessionOf(desk);
  await register(desk, people.desk.email, "fighter", people.desk.name);
  await focus(owner);
  await expect.poll(() => ownerBearer()).not.toBe("");
  for (const [page, bearer, who, role] of [
    [manager, managerBearer, people.manager, "manager"],
    [coach, coachBearer, people.coach, "coach"],
    [desk, deskBearer, people.desk, "front_desk"],
  ] as const) {
    await go(page, "/en/app");
    await expect.poll(() => bearer()).not.toBe("");
    await joinStaff(request, ownerBearer(), bearer(), a, who.email, role);
  }
  const coachStaff = staffRow(a, userId(people.coach.email));

  // F · a one-time class on Thursday 26 November 2026, 18:00 in Warsaw.
  await go(owner, `/en/app/gyms/${a}/timetable`);
  let form = await oneTime(owner, { date: "2026-11-26", time: "18:00" });
  await expect(form.getByLabel("Venue", { exact: true })).toContainText("Ring 2");
  await form.getByRole("button", { name: "Schedule class" }).click();
  await expect(form).toBeHidden();
  const classF = sql(
    `SELECT id FROM gym_class_occurrences WHERE gym_id = '${a}' AND series_id IS NULL ORDER BY inserted_at LIMIT 1`,
  );
  // 18:00 CET is 17:00 UTC.
  expect(classRow(classF)).toBe("scheduled||2026-11-26T17:00|1");
  evidence.F = { id: classF, row: classRow(classF) };

  // G · it is in the calendar (desktop grid) and in the list, at 18:00, from New York.
  if (await owner.locator("[data-week-grid]").isVisible()) {
    await expect(
      owner.locator('[data-week-grid] [data-local-start="2026-11-26T18:00:00"]'),
    ).toBeVisible();
  }
  await listWeek(owner, "2026-11-26");
  await expect(listed(owner)).toHaveCount(1);
  await expect(listed(owner).first()).toContainText("18:00");
  await expect(listed(owner).first()).toContainText("Technical boxing");
  await expect(timetable(owner)).not.toContainText(/\d+\s*\/\s*\d+|booked|waitlist|attend/i);

  // AF (after) · a real scheduled class completes add_class (the backend's fact).
  await go(owner, `/en/app/gyms/${a}`);
  await expect(owner.locator("[data-checklist-key=add_class]")).toHaveAttribute(
    "data-checklist-status",
    "completed",
  );
  await go(owner, `/en/app/gyms/${a}/timetable`);

  // K · the owner assigns the coach (an eligible gym instructor) to the class.
  await listWeek(owner, "2026-11-26");
  let details = await openClass(owner, "2026-11-26T18:00:00");
  await details.getByRole("button", { name: "Change this class" }).click();
  let change = owner.getByRole("dialog", { name: "Change Technical boxing" });
  // Only active owners, managers and coaches are offered; never the front desk.
  await change.getByRole("combobox", { name: "Instructor", exact: true }).click();
  await expect(owner.getByRole("option", { name: "Michał S." })).toHaveCount(0);
  await owner.getByRole("option", { name: "Tomasz Z." }).click();
  await change.getByRole("button", { name: "Save changes" }).click();
  await expect(change).toBeHidden();
  expect(
    sql(`SELECT instructor_staff_membership_id FROM gym_class_occurrences WHERE id = '${classF}'`),
  ).toBe(coachStaff);
  await expect(details.locator("[data-fact=instructor]")).toHaveText("Tomasz Z.");

  // L · a class in the same venue at an overlapping time: the backend's 409, the form kept.
  form = await oneTime(owner, { date: "2026-11-26", time: "19:00" });
  await form.getByRole("button", { name: "Schedule class" }).click();
  await expect(form.locator("[data-timetable-problem=venueTaken]")).toContainText(
    "Another class is in this venue at that time.",
  );
  await expect(form.getByLabel(/^Start time/)).toHaveValue("19:00");
  expect(classesOf(a)).toBe(1);

  // Adjacent classes are fine: 19:30 starts exactly when the first ends.
  await form.getByLabel(/^Start time/).fill("19:30");
  await choose(owner, form, "Instructor", "Tomasz Z.");
  await form.getByRole("button", { name: "Schedule class" }).click();
  await expect(form).toBeHidden();
  expect(classesOf(a)).toBe(2);
  const adjacent = sql(
    `SELECT id FROM gym_class_occurrences WHERE gym_id = '${a}' AND starts_at = '2026-11-26 18:30:00'`,
  );

  // M · a second venue, the same instructor at an overlapping time: the backend's 409.
  await owner.getByRole("tab", { name: "Venues" }).click();
  await owner.getByRole("button", { name: "New venue" }).click();
  const second = owner.getByRole("dialog", { name: "New venue" });
  await second.getByLabel("Name").fill("Ring 1");
  await second.getByRole("combobox", { name: "Time zone" }).click();
  await owner.getByRole("combobox", { name: "Search time zones" }).fill("Europe/Warsaw");
  await owner.keyboard.press("Enter");
  await second.getByRole("button", { name: "Add venue" }).click();
  await expect(owner.locator("[data-venue-list=active] [data-venue]")).toHaveCount(2);
  await owner.getByRole("tab", { name: "Timetable" }).click();
  form = await oneTime(owner, {
    date: "2026-11-26",
    time: "18:30",
    venue: "Ring 1",
    instructor: "Tomasz Z.",
  });
  await form.getByRole("button", { name: "Schedule class" }).click();
  await expect(form.locator("[data-timetable-problem=instructorBusy]")).toContainText(
    "This instructor teaches another class at that time.",
  );
  expect(classesOf(a)).toBe(2);
  await form.getByRole("button", { name: "Cancel" }).click();

  // H, I · a weekly class on Mondays and Wednesdays at 18:00 across the spring DST change.
  await owner.getByRole("button", { name: "Class", exact: true }).click();
  const weekly = owner.getByRole("dialog", { name: "New class" });
  await weekly.getByText("Every week", { exact: true }).click();
  await weekly.locator('[data-weekday="1"]').click();
  await weekly.locator('[data-weekday="3"]').click();
  await weekly.getByLabel(/^Start time/).fill("18:00");
  await weekly.getByLabel("First date").fill("2027-03-22");
  await weekly.getByLabel("Last date").fill("2027-04-02");
  await expect(weekly.locator("[data-weekly-summary]")).toContainText(
    "Every Monday and Wednesday at 18:00 (Europe/Warsaw)",
  );
  await weekly.getByRole("button", { name: "Schedule weekly class" }).click();
  await expect(owner.getByRole("heading", { name: "Weekly class scheduled" })).toBeVisible();
  await expect(owner.getByText("Technical boxing: 4 classes are on the timetable.")).toBeVisible();
  await owner.getByRole("button", { name: "Done" }).click();
  const series = sql(
    `SELECT id FROM gym_class_series WHERE gym_id = '${a}' AND local_start_time = '18:00' LIMIT 1`,
  );
  const seriesDates = sql(
    `SELECT string_agg(series_local_date || '@' || to_char(starts_at, 'HH24:MI'), ',' ORDER BY series_local_date) FROM gym_class_occurrences WHERE series_id = '${series}'`,
  );
  // T · 18:00 Warsaw before and after 28 March: 17:00 UTC, then 16:00 UTC.
  expect(seriesDates).toBe("2027-03-22@17:00,2027-03-24@17:00,2027-03-29@16:00,2027-03-31@16:00");
  evidence.series = { id: series, dates: seriesDates };

  // I, J, T · the list of each week shows exactly the backend's classes, all at 18:00.
  await listWeek(owner, "2027-03-22");
  const firstWeek = await listed(owner).allTextContents();
  await listWeek(owner, "2027-03-29");
  const secondWeek = await listed(owner).allTextContents();
  const shown = [...firstWeek, ...secondWeek];
  expect(shown).toHaveLength(4);
  for (const text of shown) expect(text).toContain("18:00");
  const window = classesOf(
    a,
    `starts_at >= '2027-03-14' AND starts_at < '2027-04-12' AND status = 'scheduled'`,
  );
  expect(window).toBe(4);

  // W · a weekly class at 02:30 on Sundays across the spring gap: the skipped date is shown.
  await owner.getByRole("button", { name: "Class", exact: true }).click();
  const gapSeries = owner.getByRole("dialog", { name: "New class" });
  await gapSeries.getByText("Every week", { exact: true }).click();
  await gapSeries.locator('[data-weekday="7"]').click();
  await gapSeries.getByLabel(/^Start time/).fill("02:30");
  await gapSeries.getByLabel("First date").fill("2027-03-21");
  await gapSeries.getByLabel("Last date").fill("2027-04-04");
  await gapSeries.getByRole("button", { name: "Schedule weekly class" }).click();
  await expect(
    owner.getByRole("heading", { name: "Weekly class scheduled, with dates skipped" }),
  ).toBeVisible();
  const skipped = owner.locator('[data-skipped-date="2027-03-28"]');
  await expect(skipped).toHaveAttribute("data-skipped-reason", "nonexistent_local_time");
  await expect(skipped).toContainText("clocks skip this time");
  await owner.getByRole("button", { name: "Done" }).click();
  const gapSeriesId = sql(
    `SELECT id FROM gym_class_series WHERE gym_id = '${a}' AND local_start_time = '02:30'`,
  );
  expect(
    sql(
      `SELECT string_agg(series_local_date::text, ',' ORDER BY series_local_date) FROM gym_class_occurrences WHERE series_id = '${gapSeriesId}'`,
    ),
  ).toBe("2027-03-21,2027-04-04");

  // U · a one-time class at 02:30 on 28 March 2027: said before sending, refused by the backend.
  form = await oneTime(owner, { date: "2027-03-28", time: "02:30", venue: "Ring 1" });
  await expect(form.locator("[data-schedule=gap]")).toContainText(
    "This time doesn’t exist that day.",
  );
  await form.getByRole("button", { name: "Schedule class" }).click();
  await expect(
    form.getByText(
      "This time doesn’t exist on that date in the venue’s time zone. Choose another time.",
    ),
  ).toBeVisible();
  expect(classesOf(a, `starts_at::date = '2027-03-28' AND series_id IS NULL`)).toBe(0);
  await form.getByRole("button", { name: "Cancel" }).click();

  // V · 02:30 on 31 October 2027 happens twice: the user must pick; the second is 01:30 UTC.
  form = await oneTime(owner, { date: "2027-10-31", time: "02:30", venue: "Ring 1" });
  await expect(form.locator("[data-schedule=overlap]")).toBeVisible();
  await form.getByRole("button", { name: "Schedule class" }).click();
  await expect(form.getByText("Choose which of the two times you mean.")).toBeVisible();
  await form.getByText("Second (UTC+01:00)").click();
  await form.getByRole("button", { name: "Schedule class" }).click();
  await expect(form).toBeHidden();
  const autumn = sql(
    `SELECT to_char(starts_at, 'YYYY-MM-DD"T"HH24:MI') FROM gym_class_occurrences WHERE gym_id = '${a}' AND series_id IS NULL AND starts_at::date = '2027-10-31'`,
  );
  expect(autumn).toBe("2027-10-31T01:30");
  await listWeek(owner, "2027-10-31");
  details = await openClass(owner, "2027-10-31T02:30:00");
  await expect(details.locator("[data-fact=zone]")).toHaveText("Europe/Warsaw (UTC+01:00)");
  evidence.autumn = { utc: autumn, offset: "+01:00" };

  // N, O · the owner moves only Wednesday 24 March to 19:00; the other dates stay.
  await listWeek(owner, "2027-03-22");
  details = await openClass(owner, "2027-03-24T18:00:00");
  await expect(details).toContainText("Weekly series");
  await details.getByRole("button", { name: "Change this class" }).click();
  change = owner.getByRole("dialog", { name: "Change Technical boxing" });
  await expect(change).toContainText("Only this date changes.");
  await change.getByLabel(/^Start time/).fill("19:00");
  await change.getByRole("button", { name: "Save changes" }).click();
  await expect(change).toBeHidden();
  expect(
    sql(
      `SELECT string_agg(series_local_date || '@' || to_char(starts_at, 'HH24:MI') || '@' || (rescheduled_at IS NOT NULL), ',' ORDER BY series_local_date) FROM gym_class_occurrences WHERE series_id = '${series}'`,
    ),
  ).toBe(
    "2027-03-22@17:00@false,2027-03-24@18:00@true,2027-03-29@16:00@false,2027-03-31@16:00@false",
  );

  // P, Q · the owner cancels Monday 29 March; it stays, cancelled, in the timetable.
  await listWeek(owner, "2027-03-29");
  details = await openClass(owner, "2027-03-29T18:00:00");
  await details.getByRole("button", { name: "Cancel class" }).click();
  const cancelOne = owner.getByRole("alertdialog", { name: "Cancel Technical boxing?" });
  await expect(cancelOne).toContainText("Only this date is cancelled.");
  await cancelOne.getByRole("button", { name: "Cancel class" }).click();
  await expect(cancelOne).toBeHidden();
  const cancelledDate = sql(
    `SELECT id FROM gym_class_occurrences WHERE series_id = '${series}' AND series_local_date = '2027-03-29'`,
  );
  expect(classRow(cancelledDate)).toMatch(/^cancelled\|cancelled\|2027-03-29T16:00\|2$/);
  await owner.locator("[data-timetable-cancelled]").click();
  await expect(timetable(owner)).toHaveAttribute("data-timetable-complete", "true");
  await expect(
    owner.locator('[data-list-view] [data-local-start="2027-03-29T18:00:00"]'),
  ).toHaveAttribute("data-occurrence-status", "cancelled");
  await owner.locator("[data-timetable-cancelled]").click();

  // R, S · the owner cancels the series (stronger confirmation): every future class of it
  // is cancelled by the backend; the date cancelled on its own keeps its own reason.
  await owner.getByRole("tab", { name: "Weekly series" }).click();
  await owner.locator(`[data-series="${series}"] button`).click();
  const seriesPanel = owner.locator(`[data-series-details="${series}"]`);
  await seriesPanel.getByRole("button", { name: "Cancel series" }).click();
  const cancelSeries = owner.getByRole("alertdialog");
  const confirm = cancelSeries.getByRole("button", { name: "Cancel series" });
  await expect(confirm).toBeDisabled();
  await cancelSeries.getByRole("checkbox").click();
  await confirm.click();
  await expect(cancelSeries).toBeHidden();
  const afterCancel = sql(
    `SELECT string_agg(series_local_date || '@' || status || '@' || coalesce(cancel_reason, ''), ',' ORDER BY series_local_date) FROM gym_class_occurrences WHERE series_id = '${series}'`,
  );
  expect(afterCancel).toBe(
    "2027-03-22@cancelled@series_cancelled,2027-03-24@cancelled@series_cancelled,2027-03-29@cancelled@cancelled,2027-03-31@cancelled@series_cancelled",
  );
  // Only this series: the other series and the one-time classes are untouched.
  expect(classesOf(a, `series_id = '${gapSeriesId}' AND status = 'scheduled'`)).toBe(2);
  expect(classRow(classF)).toMatch(/^scheduled\|/);
  evidence.seriesCancel = afterCancel;

  // X · a stale revision: the manager changes the class's capacity (API) while the owner
  // edits its length; the owner's save is refused, the latest is shown, and saving again
  // keeps both changes.
  await owner.getByRole("tab", { name: "Timetable" }).click();
  await listWeek(owner, "2026-11-26");
  details = await openClass(owner, "2026-11-26T18:00:00");
  await details.getByRole("button", { name: "Change this class" }).click();
  change = owner.getByRole("dialog", { name: "Change Technical boxing" });
  await go(manager, `/en/app/gyms/${a}/timetable`);
  await expect.poll(() => managerBearer()).not.toBe("");
  const revision = Number(classRow(classF).split("|")[3]);
  const other = await call(
    request,
    managerBearer(),
    "PATCH",
    `/api/v1/gyms/${a}/class-occurrences/${classF}`,
    {
      expected_revision: revision,
      capacity: 12,
    },
  );
  statuses["X manager PATCH capacity"] = other.status;
  expect(other.status).toBe(200);
  await change.getByLabel("Length").fill("75");
  await change.getByRole("button", { name: "Save changes" }).click();
  await expect(change.getByText("This class changed meanwhile.")).toBeVisible();
  expect(
    sql(
      `SELECT duration_minutes || '|' || capacity FROM gym_class_occurrences WHERE id = '${classF}'`,
    ),
  ).toBe("90|12");
  await expect(change.getByLabel("Capacity")).toHaveValue("12");
  await change.getByRole("button", { name: "Save again" }).click();
  await expect(change).toBeHidden();
  expect(
    sql(
      `SELECT duration_minutes || '|' || capacity || '|' || revision FROM gym_class_occurrences WHERE id = '${classF}'`,
    ),
  ).toBe(`75|12|${revision + 2}`);
  evidence.stale = { before: revision, after: revision + 2 };

  // Y · a lost answer: the create reaches the backend but its response never arrives;
  // "Try again" sends the same key and the backend returns the class it already made.
  const classesBefore = classesOf(a);
  let lost = false;
  await owner.route(`${API_URL}/api/v1/gyms/${a}/class-occurrences`, async (route) => {
    if (route.request().method() !== "POST" || lost) return route.continue();
    lost = true;
    await route.fetch();
    await route.abort("connectionreset");
  });
  form = await oneTime(owner, { date: "2026-12-03", time: "10:00" });
  await form.getByRole("button", { name: "Schedule class" }).click();
  await expect(form.getByText("We couldn’t confirm whether this was saved.")).toBeVisible();
  expect(classesOf(a)).toBe(classesBefore + 1);
  await form.getByRole("button", { name: "Try again" }).click();
  await expect(form).toBeHidden();
  expect(classesOf(a)).toBe(classesBefore + 1);
  await owner.unroute(`${API_URL}/api/v1/gyms/${a}/class-occurrences`);

  // Z · the manager plans a class in the web UI.
  await go(manager, `/en/app/gyms/${a}/timetable`);
  form = await oneTime(manager, { date: "2026-12-04", time: "17:00", venue: "Ring 1" });
  await form.getByRole("button", { name: "Schedule class" }).click();
  await expect(form).toBeHidden();
  expect(classesOf(a, `starts_at = '2026-12-04 16:00:00'`)).toBe(1);

  // AA · the coach sees no planning controls, may cancel the class they teach (19:30 on
  // 26 November), and nothing else.
  await go(coach, `/en/app/gyms/${a}/timetable`);
  await expect(coach.getByRole("button", { name: "Class", exact: true })).toHaveCount(0);
  await listWeek(coach, "2026-12-04");
  details = await openClass(coach, "2026-12-04T17:00:00");
  await expect(details.getByRole("button")).toHaveCount(0);
  await listWeek(coach, "2026-11-26");
  details = await openClass(coach, "2026-11-26T19:30:00");
  await expect(details.getByRole("button", { name: "Change this class" })).toHaveCount(0);
  await details.getByRole("button", { name: "Cancel class" }).click();
  await coach.getByRole("alertdialog").getByRole("button", { name: "Cancel class" }).click();
  await expect(coach.getByRole("alertdialog")).toBeHidden();
  expect(classRow(adjacent)).toMatch(/^cancelled\|cancelled\|/);
  const managerClass = sql(
    `SELECT id FROM gym_class_occurrences WHERE gym_id = '${a}' AND starts_at = '2026-12-04 16:00:00'`,
  );
  statuses["AA coach cancels a class they don't teach"] = (
    await call(
      request,
      coachBearer(),
      "POST",
      `/api/v1/gyms/${a}/class-occurrences/${managerClass}/cancel`,
      {
        expected_revision: 1,
      },
    )
  ).status;
  statuses["AA coach changes a class"] = (
    await call(request, coachBearer(), "PATCH", `/api/v1/gyms/${a}/class-occurrences/${classF}`, {
      expected_revision: 3,
      capacity: 10,
    })
  ).status;
  expect(statuses["AA coach cancels a class they don't teach"]).toBe(403);
  expect(statuses["AA coach changes a class"]).toBe(403);

  // AB · the front desk reads the timetable without any mutation control.
  await go(desk, `/en/app/gyms/${a}/timetable`);
  await expect(desk.getByRole("button", { name: "Class", exact: true })).toHaveCount(0);
  await listWeek(desk, "2026-11-26");
  details = await openClass(desk, "2026-11-26T18:00:00");
  await expect(details.getByRole("button")).toHaveCount(0);
  await desk.getByRole("tab", { name: "Venues" }).click();
  await expect(desk.getByRole("button", { name: "New venue" })).toHaveCount(0);
  statuses["AB front desk creates a venue"] = (
    await call(request, deskBearer(), "POST", `/api/v1/gyms/${a}/venues`, {
      client_request_id: randomUUID(),
      gym_location_id: sql(`SELECT id FROM gym_locations WHERE gym_id = '${a}' LIMIT 1`),
      name: "Desk room",
      time_zone: "Europe/Warsaw",
    })
  ).status;
  expect(statuses["AB front desk creates a venue"]).toBe(403);

  // AD, AE · Gym B (another owner) has its own classes; the coach also teaches there.
  const ownerB = await newPage(browser);
  const ownerBBearer = sessionOf(ownerB);
  await register(ownerB, people.ownerB.email, "fighter", people.ownerB.name);
  await go(ownerB, "/en/app");
  await expect.poll(() => ownerBBearer()).not.toBe("");
  const b = await createGymThroughApi(request, ownerBBearer(), GYM_B);
  await joinStaff(request, ownerBBearer(), coachBearer(), b, people.coach.email, "coach");
  const locationB = sql(`SELECT id FROM gym_locations WHERE gym_id = '${b}' LIMIT 1`);
  const venueB = await call(request, ownerBBearer(), "POST", `/api/v1/gyms/${b}/venues`, {
    client_request_id: randomUUID(),
    gym_location_id: locationB,
    name: "Hall B",
    time_zone: "Europe/Warsaw",
  });
  const templateB = await call(
    request,
    ownerBBearer(),
    "POST",
    `/api/v1/gyms/${b}/class-templates`,
    {
      client_request_id: randomUUID(),
      title: "Gym B secret class",
      default_duration_minutes: 60,
      default_capacity: 10,
    },
  );
  const coachInB = staffRow(b, userId(people.coach.email));
  // AE · the coach's Gym A class (26 Nov 18:00–19:15 Warsaw) blocks the same time in Gym B,
  // and the refusal says nothing about Gym A.
  const clash = await call(request, ownerBBearer(), "POST", `/api/v1/gyms/${b}/class-occurrences`, {
    client_request_id: randomUUID(),
    template_id: (templateB.body.template as { template_id: string }).template_id,
    venue_id: (venueB.body.venue as { venue_id: string }).venue_id,
    starts_at: "2026-11-26T18:30:00+01:00",
    instructor_staff_membership_id: coachInB,
  });
  statuses["AE cross-gym instructor clash"] = clash.status;
  expect(clash.status).toBe(409);
  const clashDetails = (clash.body.error as { details: Record<string, unknown> }).details;
  expect(clashDetails).toEqual({ schedule: "instructor_unavailable" });
  expect(JSON.stringify(clash.body)).not.toContain(GYM_A);
  const classB = await call(
    request,
    ownerBBearer(),
    "POST",
    `/api/v1/gyms/${b}/class-occurrences`,
    {
      client_request_id: randomUUID(),
      template_id: (templateB.body.template as { template_id: string }).template_id,
      venue_id: (venueB.body.venue as { venue_id: string }).venue_id,
      starts_at: "2026-11-27T18:30:00+01:00",
    },
  );
  expect(classB.status).toBe(201);

  // AD · Gym A's owner can neither read nor change Gym B's timetable; nothing shows.
  statuses["AD owner A lists Gym B classes"] = (
    await call(
      request,
      ownerBearer(),
      "GET",
      `/api/v1/gyms/${b}/class-occurrences?from=2026-11-20T00:00:00Z&to=2026-12-01T00:00:00Z`,
    )
  ).status;
  statuses["AD owner A cancels a Gym B class"] = (
    await call(
      request,
      ownerBearer(),
      "POST",
      `/api/v1/gyms/${b}/class-occurrences/${(classB.body.occurrence as { occurrence_id: string }).occurrence_id}/cancel`,
      { expected_revision: 1 },
    )
  ).status;
  statuses["AD owner A reads a Gym B class through Gym A"] = (
    await call(
      request,
      ownerBearer(),
      "GET",
      `/api/v1/gyms/${a}/class-occurrences/${(classB.body.occurrence as { occurrence_id: string }).occurrence_id}`,
    )
  ).status;
  expect(statuses["AD owner A lists Gym B classes"]).toBe(404);
  expect(statuses["AD owner A cancels a Gym B class"]).toBe(404);
  expect(statuses["AD owner A reads a Gym B class through Gym A"]).toBe(404);
  await go(owner, `/en/app/gyms/${b}/timetable`);
  await expect(owner.locator("[data-gym-timetable]")).toHaveCount(0);
  await expect(owner.locator("body")).not.toContainText("Gym B secret class");

  // AI · the coach switches from Gym A to Gym B: nothing of Gym A's timetable remains.
  await go(coach, `/en/app/gyms/${a}/timetable`);
  await listWeek(coach, "2026-11-26");
  await expect(listed(coach).first()).toContainText("Technical boxing");
  await go(coach, `/en/app/gyms/${b}/timetable`);
  await expect(coach.locator(`[data-gym-timetable][data-gym-id="${b}"]`)).toBeVisible();
  await listWeek(coach, "2026-11-26");
  await expect(listed(coach)).toHaveCount(1);
  await expect(listed(coach).first()).toContainText("Gym B secret class");
  await expect(coach.locator("main")).not.toContainText("Technical boxing");

  // AC · revoking the front desk: their next timetable operation is refused, and the
  // console leaves the gym.
  const deskRow = staffRow(a, userId(people.desk.email));
  expect(
    (await call(request, ownerBearer(), "DELETE", `/api/v1/gyms/${a}/staff/${deskRow}`)).status,
  ).toBe(200);
  statuses["AC revoked desk lists classes"] = (
    await call(
      request,
      deskBearer(),
      "GET",
      `/api/v1/gyms/${a}/class-occurrences?from=2026-11-20T00:00:00Z&to=2026-12-01T00:00:00Z`,
    )
  ).status;
  statuses["AC revoked desk cancels a class"] = (
    await call(
      request,
      deskBearer(),
      "POST",
      `/api/v1/gyms/${a}/class-occurrences/${classF}/cancel`,
      {
        expected_revision: 3,
      },
    )
  ).status;
  expect(statuses["AC revoked desk lists classes"]).toBe(404);
  expect(statuses["AC revoked desk cancels a class"]).toBe(404);
  await focus(desk);
  await desk.waitForURL((url) => !url.pathname.startsWith(`/en/app/gyms/${a}`));
  await expect(desk.locator("[data-gym-timetable]")).toHaveCount(0);

  // AI · switching accounts in the same browser leaves nothing of Gym A behind.
  await go(owner, `/en/app/gyms/${a}/timetable`);
  await listWeek(owner, "2026-11-26");
  await expect(listed(owner).first()).toBeVisible();
  await (await navigation(owner)).getByRole("button", { name: "Sign out" }).click();
  await owner.waitForURL((url) => url.pathname === "/en/login");
  await expect(owner.locator("body")).not.toContainText("Technical boxing");
  await signIn(owner, people.ownerB.email);
  await go(owner, `/en/app/gyms/${a}/timetable`);
  await expect(owner.locator("[data-gym-timetable]")).toHaveCount(0);
  await expect(owner.locator("body")).not.toContainText("Technical boxing");
  expect(
    await owner.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toMatch(/Technical boxing|class-occurrences|Ring 2/);

  // AG, AH · classes created no training session, membership, booking or attendance.
  expect(count("training_sessions")).toBe(before.trainingSessions);
  expect(count("gym_members")).toBe(before.gymMembers);
  expect(count("coach_fighter_relationships")).toBe(before.relationships);
  expect(
    sql(
      "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND (table_name LIKE '%booking%' OR table_name LIKE '%attendance%' OR table_name LIKE '%check_in%')",
    ),
  ).toBe("0");

  // The audit trail of Gym A's timetable (event types and counts only).
  evidence.audit = sql(
    `SELECT string_agg(event_type || '=' || n, ',' ORDER BY event_type) FROM (SELECT event_type, count(*) n FROM gym_audit_events WHERE gym_id = '${a}' AND (venue_id IS NOT NULL OR class_template_id IS NOT NULL OR class_series_id IS NOT NULL OR class_occurrence_id IS NOT NULL) GROUP BY event_type) t`,
  );
  evidence.classesA = sql(
    `SELECT status || ':' || count(*) FROM gym_class_occurrences WHERE gym_id = '${a}' GROUP BY status ORDER BY status`,
  ).split("\n");

  // AJ · the API's log of this run holds no access token and no session secret.
  if (API_LOG) {
    const log = readFileSync(API_LOG, "utf8");
    const leaks = {
      bearerTokens: (log.match(/Bearer\s+[A-Za-z0-9._-]{16,}/g) ?? []).length,
      accessTokens: (log.match(/sfa_[A-Za-z0-9_-]{8,}/g) ?? []).length,
      refreshTokens: (log.match(/sfr_[A-Za-z0-9_-]{8,}/g) ?? []).length,
      emails: Object.values(people).filter(({ email }) => log.includes(email)).length,
    };
    expect(leaks).toEqual({ bearerTokens: 0, accessTokens: 0, refreshTokens: 0, emails: 0 });
  }

  const record = { project: test.info().project.name, statuses, evidence };
  writeFileSync(test.info().outputPath("evidence.json"), JSON.stringify(record, null, 2));
  if (EVIDENCE)
    writeFileSync(`${EVIDENCE}-${test.info().project.name}.json`, JSON.stringify(record, null, 2));
});
