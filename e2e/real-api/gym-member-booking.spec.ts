import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, type APIRequestContext, type Browser, type Page, test } from "@playwright/test";

/*
 * SF-100: gym member booking and staff attendance on the web, against the
 * real SF-99 API and PostgreSQL (playwright.real-api.config.ts).
 *
 * What is the web UI and what is not, exactly:
 * - the owner's registration and gym creation, the member's way in (role
 *   selection → My gyms → the gym's classes), every booking, cancellation,
 *   lost answer, full class, started or cancelled class, My bookings, the
 *   staff rosters (owner, front desk, coach), check-ins, the checklist,
 *   sign-out and account switching are browser actions on the production
 *   build;
 * - classes, staff invitations, joining by code and its approval (no
 *   recipient UI exists: SF-95), the other members of the last-place race,
 *   Gym B, removals, replays and every refusal check are the real API called
 *   with each person's own session (backend-assisted), recorded with their
 *   status codes;
 * - backend checks read the disposable database (psql).
 *
 * The second part (`gym-member-booking-sync`, run after the mobile leg) reads
 * this run's handoff file and checks the mobile client's changes on the web.
 */

const API_URL = process.env.E2E_REAL_API_URL ?? "";
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
const API_LOG = process.env.E2E_API_LOG ?? "";
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";
const EVIDENCE = process.env.E2E_EVIDENCE ?? "";
/** Written for the mobile leg: accounts, gym and class ids, never a token. */
const HANDOFF = process.env.E2E_HANDOFF_FILE ?? "";
/** Set for the second web leg, after the mobile leg changed the bookings. */
const SYNC = process.env.E2E_SYNC === "1";

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

const resetRateLimits = () => sql("DELETE FROM auth_rate_limits; DELETE FROM rate_limit_events");
const count = (table: string, where = "true") =>
  Number(sql(`SELECT count(*) FROM ${table} WHERE ${where}`));
const gymIdOf = (name: string) => sql(`SELECT id FROM gyms WHERE name = '${name}'`);
const userId = (email: string) =>
  sql(
    `SELECT user_id FROM identities WHERE provider = 'email' AND lower(provider_subject) = lower('${email}')`,
  );
const confirmed = (occurrence: string) =>
  count("gym_class_bookings", `occurrence_id = '${occurrence}' AND status = 'confirmed'`);

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
  await page.waitForURL((url) => url.pathname !== "/en/login/code");
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).locator("visible=true").first().click();
  await page.waitForURL(
    (url) => /\/en(\/login)?\/?$/.test(url.pathname) || url.pathname === "/en/login",
  );
}

/** An account registered through the API (another client; no web UI step), returning its bearer. */
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
    gym_type: "boxing_club",
  });
  expect(created.status).toBe(201);
  const id = (created.body.gym as { id: string }).id;
  const setup = await call(request, bearer, "GET", `/api/v1/gyms/${id}/setup`);
  expect(
    (
      await call(request, bearer, "PUT", `/api/v1/gyms/${id}/setup/primary-location`, {
        expected_revision: (setup.body.setup as { revision: number }).revision,
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
  return sql(
    `SELECT id FROM gym_staff_memberships WHERE gym_id = '${gymId}' AND user_id = '${userId(email)}' AND status = 'active'`,
  );
}

/** A member joins by the gym's code and the owner approves (SF-95 API; no recipient UI exists). */
async function joinMember(
  request: APIRequestContext,
  ownerBearer: string,
  memberBearer: string,
  gymId: string,
) {
  const rotated = await call(
    request,
    ownerBearer,
    "POST",
    `/api/v1/gyms/${gymId}/join-code/rotate`,
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
        ownerBearer,
        "POST",
        `/api/v1/gyms/${gymId}/join-requests/${memberId}/approve`,
      )
    ).status,
  ).toBe(200);
  return memberId;
}

/** Warsaw wall time `minutes` from now (rounded up to 5 min) as an RFC 3339 instant with its offset. */
function warsawSoon(minutes: number) {
  const at = new Date(Date.now() + minutes * 60_000);
  at.setUTCSeconds(0, 0);
  at.setUTCMinutes(Math.ceil(at.getUTCMinutes() / 5) * 5);
  return warsaw(at);
}
function warsaw(at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Warsaw",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  const offset = String(parts.timeZoneName).replace("GMT", "") || "+00:00";
  return {
    instant: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00${offset}`,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

const run = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const tag = run();
const GYM_A = `Bookings A ${tag}`;
const GYM_B = `Bookings B ${tag}`;
const person = (key: string, name: string) => ({
  email: `e2e-sf100-${key}-${tag}@example.com`,
  name,
});
const people = {
  owner: person("owner", "Yauheni Bykovski"),
  marta: person("marta", "Marta Kowalska"),
  piotr: person("piotr", "Piotr Zając"),
  coach: person("coach", "Tomasz Zieliński"),
  desk: person("desk", "Michał Sowa"),
  manager: person("manager", "Agnieszka Lis"),
  ownerB: person("ownerb", "Ola Nowak"),
};
const evidence: Record<string, unknown> = {};
const statuses: Record<string, number> = {};
const tokens: string[] = [];

const classRow = (page: Page, title: string) =>
  page.locator("[data-member-class]").filter({ hasText: title }).first();
const details = (page: Page) => page.locator("[data-member-class-details]");

test("A–AC: member booking and staff attendance on the web against the real SF-99 backend", async ({
  browser,
  request,
}) => {
  test.skip(SYNC, "the first web leg");
  test.setTimeout(900_000);
  const before = {
    trainingSessions: count("training_sessions"),
    relationships: count("coach_fighter_relationships"),
  };

  // A · the owner registers and creates Gym A in the web onboarding (UI).
  const owner = await newPage(browser);
  const ownerBearer = sessionOf(owner);
  await register(owner, people.owner.email, people.owner.name, "gym");
  await owner.waitForURL((url) => url.pathname === "/en/app/onboarding/gym");
  await createGymInBrowser(owner, GYM_A);
  await owner.getByRole("button", { name: "Go to gym" }).click();
  const a = gymIdOf(GYM_A);
  await owner.waitForURL(`**/en/app/gyms/${a}`);
  await expect.poll(() => ownerBearer()).not.toBe("");
  const OB = ownerBearer();
  evidence.gymA = a;

  // Staff (API registration and SF-93 invitations, their own sessions).
  const coachB = await registerApi(request, people.coach.email, people.coach.name);
  const deskB = await registerApi(request, people.desk.email, people.desk.name);
  const managerB = await registerApi(request, people.manager.email, people.manager.name);
  tokens.push(coachB, deskB, managerB);
  const coachStaff = await joinStaff(request, OB, coachB, a, people.coach.email, "coach");
  const deskStaff = await joinStaff(request, OB, deskB, a, people.desk.email, "front_desk");
  await joinStaff(request, OB, managerB, a, people.manager.email, "manager");

  // B · real classes (SF-97 API with the owner's session): two today, one tomorrow,
  // one starting in a few minutes, one to be cancelled. Warsaw wall times.
  const venue = await call(request, OB, "POST", `/api/v1/gyms/${a}/venues`, {
    client_request_id: randomUUID(),
    gym_location_id: sql(`SELECT id FROM gym_locations WHERE gym_id = '${a}' LIMIT 1`),
    name: "Ring 2",
    capacity: 40,
    time_zone: "Europe/Warsaw",
  });
  expect(venue.status).toBe(201);
  const venueId = (venue.body.venue as { venue_id: string }).venue_id;
  // One template per class title (the title comes from the template, SF-97).
  const schedule = async (title: string, startsAt: string, capacity: number, extra = {}) => {
    const template = await call(request, OB, "POST", `/api/v1/gyms/${a}/class-templates`, {
      client_request_id: randomUUID(),
      title,
      default_duration_minutes: 30,
      default_capacity: 10,
      default_venue_id: venueId,
    });
    expect(template.status, `template ${title}`).toBe(201);
    const created = await call(request, OB, "POST", `/api/v1/gyms/${a}/class-occurrences`, {
      client_request_id: randomUUID(),
      template_id: (template.body.template as { template_id: string }).template_id,
      starts_at: startsAt,
      capacity,
      ...extra,
    });
    expect(created.status, `schedule ${title}`).toBe(201);
    return (created.body.occurrence as { occurrence_id: string }).occurrence_id;
  };
  const today1 = warsawSoon(40);
  const today2 = warsawSoon(75);
  const soon = warsawSoon(4);
  const tomorrow = warsaw(new Date(Date.now() + 86_400_000));
  const tomorrowAt = (hour: string) => `${tomorrow.date}T${hour}:00${today1.instant.slice(19)}`;
  expect(today2.date, "run before 22:40 Warsaw time: check-ins need classes today").toBe(
    today1.date,
  );
  const C1 = await schedule("Technical boxing", today1.instant, 3, {
    instructor_staff_membership_id: coachStaff,
  });
  const C2 = await schedule("Last place", today2.instant, 1);
  const C3 = await schedule("Tomorrow boxing", tomorrowAt("18:00"), 10);
  const C4 = await schedule("Starting soon", soon.instant, 5);
  const C5 = await schedule("Cancelled sparring", tomorrowAt("19:00"), 8);
  evidence.classes = { C1, C2, C3, C4, C5, today: today1.date };
  expect(count("gym_class_occurrences", `gym_id = '${a}' AND status = 'scheduled'`)).toBe(5);

  // C · Marta registers on the web without choosing a role (UI) and joins Gym A
  // by its code; the owner approves (SF-95 API). She has no FighterProfile.
  const marta = await newPage(browser);
  const martaBearer = sessionOf(marta);
  await register(marta, people.marta.email, people.marta.name);
  await marta.waitForURL((url) => url.pathname === "/en/app/onboarding/role");
  await expect.poll(() => martaBearer()).not.toBe("");
  const martaMember = await joinMember(request, OB, martaBearer(), a);
  expect(count("fighter_profiles", `user_id = '${userId(people.marta.email)}'`)).toBe(0);
  expect(count("coach_profiles", `user_id = '${userId(people.marta.email)}'`)).toBe(0);

  // D · the member's way in (UI): role selection offers her gyms; My gyms opens the classes.
  await marta.reload();
  const shortcut = marta.locator("[data-member-shortcut]");
  await expect(shortcut).toContainText("Gym memberships on your account: 1");
  await shortcut.getByRole("link", { name: "Open my gyms" }).click();
  await marta.waitForURL("**/en/app/me/gyms");
  await marta.getByRole("link", { name: `Open the classes of ${GYM_A}` }).click();
  await marta.waitForURL(`**/en/app/me/gyms/${a}/classes`);
  await expect(heading(marta, "Book a class")).toBeVisible();
  // 5 · the backend's places left.
  await expect(classRow(marta, "Technical boxing")).toContainText(
    "Tomasz Z. · Ring 2 · 3 of 3 left",
  );

  // E · Marta books Technical boxing (UI); success only from the backend's answer.
  await classRow(marta, "Technical boxing").click();
  await details(marta).getByRole("button", { name: "Confirm booking" }).click();
  await expect(marta.locator("[data-booking-confirmed]")).toContainText("Booking confirmed");
  expect(confirmed(C1)).toBe(1);
  await expect(details(marta).locator("[data-member-places]")).toHaveText("2 of 3 left");
  const firstKey = sql(
    `SELECT client_request_id FROM gym_class_bookings WHERE occurrence_id = '${C1}' AND gym_member_id = '${martaMember}'`,
  );
  // 7 · the booking survives a reload.
  await marta.reload();
  await expect(classRow(marta, "Technical boxing")).toHaveAttribute("data-class-state", "booked");
  // 8 · it is in My bookings.
  await marta.getByRole("link", { name: "My bookings" }).click();
  await marta.waitForURL("**/en/app/me/bookings");
  await expect(marta.locator("[data-member-bookings=upcoming]")).toContainText("Technical boxing");

  // I · 9 · the same request again creates nothing; no second booking exists.
  const replay = await call(
    request,
    martaBearer(),
    "POST",
    `/api/v1/me/gym-memberships/${martaMember}/class-bookings`,
    {
      occurrence_id: C1,
      client_request_id: firstKey,
    },
  );
  statuses.replay = replay.status;
  expect(replay.status).toBe(200);
  const second = await call(
    request,
    martaBearer(),
    "POST",
    `/api/v1/me/gym-memberships/${martaMember}/class-bookings`,
    {
      occurrence_id: C1,
      client_request_id: randomUUID(),
    },
  );
  statuses.duplicate = second.status;
  expect(second.status).toBe(409);
  expect(
    count("gym_class_bookings", `occurrence_id = '${C1}' AND gym_member_id = '${martaMember}'`),
  ).toBe(1);

  // J · 12 · a lost answer (UI): the booking reaches the API, its answer never
  // reaches the page; "Try again" sends the same key and one booking results.
  await go(marta, `/en/app/me/gyms/${a}/classes`);
  await marta.locator(`[data-member-day="${tomorrow.date}"]`).click();
  await classRow(marta, "Tomorrow boxing").click();
  const sent: string[] = [];
  marta.on("request", (req) => {
    if (
      req.method() === "POST" &&
      req.url().endsWith(`/gym-memberships/${martaMember}/class-bookings`)
    )
      sent.push(
        (JSON.parse(req.postData() ?? "{}") as { client_request_id: string }).client_request_id,
      );
  });
  let lost = false;
  await marta.route(`**/api/v1/me/gym-memberships/${martaMember}/class-bookings`, async (route) => {
    if (lost) return route.continue();
    lost = true;
    await route.fetch();
    await route.abort("failed");
  });
  await details(marta).getByRole("button", { name: "Confirm booking" }).click();
  // The answer was lost; the classes are read again and show the booking the
  // API made, so the page says it is confirmed (reconciled) and offers no
  // second attempt. ("Try again" with the same key is covered where the
  // re-read does not show it yet: unit tests and the mobile leg.)
  await expect(classRow(marta, "Tomorrow boxing")).toHaveAttribute("data-class-state", "booked");
  await expect(marta.locator("[data-booking-confirmed]")).toContainText("Booking confirmed");
  await expect(marta.locator("[data-booking-problem=unknown]")).toHaveCount(0);
  expect(confirmed(C3)).toBe(1);
  await marta.unroute(`**/api/v1/me/gym-memberships/${martaMember}/class-bookings`);
  expect(sent.length).toBeGreaterThanOrEqual(1);
  expect(new Set(sent).size).toBe(1);
  expect(count("gym_class_bookings", `occurrence_id = '${C3}'`)).toBe(1);

  // K · L · M · 13 · the last place: five members race for it (API, parallel), then
  // Marta tries in the UI and is told it is full; capacity never overflows.
  const racers: { bearer: string; member: string }[] = [];
  for (let i = 0; i < 5; i += 1) {
    const bearer = await registerApi(
      request,
      `e2e-sf100-racer${i}-${tag}@example.com`,
      `Racer ${i} Nowak`,
    );
    tokens.push(bearer);
    racers.push({ bearer, member: await joinMember(request, OB, bearer, a) });
  }
  const race = await Promise.all(
    racers.map(({ bearer, member }) =>
      call(request, bearer, "POST", `/api/v1/me/gym-memberships/${member}/class-bookings`, {
        occurrence_id: C2,
        client_request_id: randomUUID(),
      }),
    ),
  );
  const raced = race.map((answer) => answer.status).sort();
  evidence.race = raced;
  expect(raced).toEqual([201, 409, 409, 409, 409]);
  await marta.locator(`[data-member-day="${today1.date}"]`).click();
  // Her page still shows the place it read before the race (informational only);
  // she tries to take it and the backend says the class is full: no booking.
  await classRow(marta, "Last place").click();
  await details(marta).getByRole("button", { name: "Confirm booking" }).click();
  await expect(details(marta).locator("[data-booking-problem=full]")).toContainText(
    "This class is full (1 place). No booking was made, and there is no waitlist.",
  );
  await expect(details(marta)).toHaveAttribute("data-class-state", "full");
  expect(confirmed(C2)).toBe(1);

  // 10 · 11 · Marta cancels Technical boxing (UI, confirmed first): the place comes back.
  await classRow(marta, "Technical boxing").click();
  await details(marta).getByRole("button", { name: "Cancel booking" }).click();
  const dialog = marta.getByRole("alertdialog", { name: "Cancel your booking?" });
  await expect(dialog).not.toContainText(/refund/i);
  await dialog.getByRole("button", { name: "Cancel booking" }).click();
  await expect(details(marta)).toHaveAttribute("data-class-state", "open");
  await expect(details(marta).locator("[data-member-places]")).toHaveText("3 of 3 left");
  expect(confirmed(C1)).toBe(0);
  expect(
    count(
      "gym_class_bookings",
      `occurrence_id = '${C1}' AND status = 'cancelled' AND cancel_reason = 'member_cancelled'`,
    ),
  ).toBe(1);
  // She books it again (a new attempt, a new key) for the check-in below.
  await details(marta).getByRole("button", { name: "Confirm booking" }).click();
  await expect(details(marta)).toHaveAttribute("data-class-state", "booked");
  expect(confirmed(C1)).toBe(1);

  // 15 · a cancelled class takes no booking (owner cancels it through the API).
  const cancelled = await call(
    request,
    OB,
    "POST",
    `/api/v1/gyms/${a}/class-occurrences/${C5}/cancel`,
    {
      expected_revision: 1,
    },
  );
  expect(cancelled.status).toBe(200);
  await marta.reload();
  await marta.locator(`[data-member-day="${tomorrow.date}"]`).click();
  await expect(classRow(marta, "Cancelled sparring")).toHaveAttribute(
    "data-class-state",
    "cancelled",
  );
  statuses.bookCancelled = (
    await call(
      request,
      martaBearer(),
      "POST",
      `/api/v1/me/gym-memberships/${martaMember}/class-bookings`,
      {
        occurrence_id: C5,
        client_request_id: randomUUID(),
      },
    )
  ).status;
  expect(statuses.bookCancelled).toBe(409);

  // 14 · a class that has started cannot be booked (UI shows it; the API refuses).
  const startsIn = Date.parse(soon.instant) - Date.now();
  if (startsIn > 0) await marta.waitForTimeout(startsIn + 5_000);
  await marta.reload();
  await marta.locator(`[data-member-day="${today1.date}"]`).click();
  await classRow(marta, "Starting soon").click();
  await expect(details(marta)).toHaveAttribute("data-class-state", "started");
  await expect(details(marta).getByRole("button", { name: "Confirm booking" })).toHaveCount(0);
  statuses.bookStarted = (
    await call(
      request,
      martaBearer(),
      "POST",
      `/api/v1/me/gym-memberships/${martaMember}/class-bookings`,
      {
        occurrence_id: C4,
        client_request_id: randomUUID(),
      },
    )
  ).status;
  expect(statuses.bookStarted).toBe(409);

  // N · 16 · the owner opens Technical boxing's roster from the timetable (UI).
  await go(owner, `/en/app/gyms/${a}/timetable`);
  await owner.getByRole("button", { name: "List", exact: true }).click();
  await owner.getByLabel("Go to date").fill(today1.date);
  await owner
    .locator(`[data-list-view] [data-local-start="${today1.date}T${today1.time}:00"]`)
    .first()
    .click();
  await owner.locator("[data-occurrence-details]").getByRole("button", { name: "Roster" }).click();
  const roster = owner.getByRole("dialog", { name: "Technical boxing" });
  await expect(roster.locator("[data-roster-entries=confirmed]")).toContainText("Marta K.");
  await expect(roster).not.toContainText("@");
  await expect(roster.locator("[data-roster-confirmed]")).toHaveText("1/3");

  // Q · 21 · the owner checks Marta in (UI): one real arrival.
  await roster.getByRole("button", { name: "Check in Marta K." }).click();
  await expect(roster.locator("[data-check-in-done]")).toContainText("Marta K. is checked in.");
  await expect(roster.locator("[data-roster-checked-in]")).toHaveText("Checked in: 1");
  expect(count("gym_class_check_ins", `occurrence_id = '${C1}'`)).toBe(1);
  // R · 22 · again through the API: the same arrival, nothing new.
  const martaBooking = sql(
    `SELECT id FROM gym_class_bookings WHERE occurrence_id = '${C1}' AND status = 'confirmed'`,
  );
  const again = await call(
    request,
    OB,
    "POST",
    `/api/v1/gyms/${a}/class-bookings/${martaBooking}/check-in`,
  );
  statuses.checkInAgain = again.status;
  expect(again.status).toBe(200);
  expect(count("gym_class_check_ins", `occurrence_id = '${C1}'`)).toBe(1);
  expect(
    count(
      "gym_audit_events",
      `class_booking_id = '${martaBooking}' AND event_type = 'class_check_in_recorded'`,
    ),
  ).toBe(1);
  await owner.keyboard.press("Escape");

  // 23 · tomorrow's class refuses a check-in today (UI says so).
  await owner.getByLabel("Go to date").fill(tomorrow.date);
  await owner
    .locator(`[data-list-view] [data-local-start="${tomorrow.date}T18:00:00"]`)
    .first()
    .click();
  await owner.locator("[data-occurrence-details]").getByRole("button", { name: "Roster" }).click();
  const tomorrowRoster = owner.getByRole("dialog", { name: "Tomorrow boxing" });
  await tomorrowRoster.getByRole("button", { name: "Check in Marta K." }).click();
  await expect(tomorrowRoster.locator("[data-booking-problem=notToday]")).toBeVisible();
  expect(count("gym_class_check_ins", `occurrence_id = '${C3}'`)).toBe(0);
  await owner.keyboard.press("Escape");

  // S · the member sees her recorded arrival (UI).
  await go(marta, `/en/app/me/bookings`);
  await expect(
    marta
      .locator("[data-member-bookings=upcoming], [data-member-bookings=past]")
      .filter({ hasText: "Technical boxing" })
      .first(),
  ).toContainText("Checked in");

  // T · 24 · first_check_in is completed by the backend, and the dashboard says so (UI).
  const firstRun = await call(request, OB, "GET", `/api/v1/gyms/${a}/first-run`);
  const items = (firstRun.body.first_run as { checklist: { key: string; status: string }[] })
    .checklist;
  expect(items.find((item) => item.key === "first_check_in")?.status).toBe("completed");
  await go(owner, `/en/app/gyms/${a}`);
  await expect(owner.locator("[data-checklist-key=first_check_in]")).toHaveAttribute(
    "data-checklist-status",
    "completed",
  );

  // P · 18 · the front desk reads the roster too (UI); O · 19 · 20 · the coach only for their class.
  const desk = await newPage(browser);
  await signIn(desk, people.desk.email);
  await go(desk, `/en/app/gyms/${a}/timetable`);
  await desk.getByRole("button", { name: "List", exact: true }).click();
  await desk.getByLabel("Go to date").fill(today1.date);
  await desk
    .locator(`[data-list-view] [data-local-start="${today1.date}T${today1.time}:00"]`)
    .first()
    .click();
  await desk.locator("[data-occurrence-details]").getByRole("button", { name: "Roster" }).click();
  await expect(desk.getByRole("dialog", { name: "Technical boxing" })).toContainText("Marta K.");
  const coach = await newPage(browser);
  await signIn(coach, people.coach.email);
  await go(coach, `/en/app/gyms/${a}/timetable`);
  await coach.getByRole("button", { name: "List", exact: true }).click();
  await coach.getByLabel("Go to date").fill(today1.date);
  await coach
    .locator(`[data-list-view] [data-local-start="${today1.date}T${today1.time}:00"]`)
    .first()
    .click();
  await expect(
    coach.locator("[data-occurrence-details]").getByRole("button", { name: "Roster" }),
  ).toBeVisible();
  await coach
    .locator(`[data-list-view] [data-local-start="${today2.date}T${today2.time}:00"]`)
    .first()
    .click();
  await expect(
    coach.locator("[data-occurrence-details]").getByRole("button", { name: "Roster" }),
  ).toHaveCount(0);
  statuses.coachOwnRoster = (
    await call(request, coachB, "GET", `/api/v1/gyms/${a}/class-occurrences/${C1}/bookings`)
  ).status;
  statuses.coachOtherRoster = (
    await call(request, coachB, "GET", `/api/v1/gyms/${a}/class-occurrences/${C2}/bookings`)
  ).status;
  statuses.managerRoster = (
    await call(request, managerB, "GET", `/api/v1/gyms/${a}/class-occurrences/${C1}/bookings`)
  ).status;
  expect([statuses.coachOwnRoster, statuses.coachOtherRoster, statuses.managerRoster]).toEqual([
    200, 403, 200,
  ]);

  // U · 25 · Gym B (another owner) is isolated both ways.
  const ownerBB = await registerApi(request, people.ownerB.email, people.ownerB.name);
  tokens.push(ownerBB);
  const b = await createGymThroughApi(request, ownerBB, GYM_B);
  statuses.ownerBReadsA = (
    await call(request, ownerBB, "GET", `/api/v1/gyms/${a}/class-occurrences/${C1}/bookings`)
  ).status;
  statuses.ownerAReadsBWithA = (
    await call(request, OB, "GET", `/api/v1/gyms/${b}/class-occurrences/${C1}/bookings`)
  ).status;
  expect([statuses.ownerBReadsA, statuses.ownerAReadsBWithA]).toEqual([404, 404]);
  await go(marta, `/en/app/me/gyms/${b}/classes`);
  await expect(marta.locator("[data-member-state=not-member]")).toBeVisible();

  // 26 · another account cannot read Marta's booking.
  statuses.foreignBooking = (
    await call(request, racers[0]!.bearer, "GET", `/api/v1/me/class-bookings/${martaBooking}`)
  ).status;
  expect(statuses.foreignBooking).toBe(404);

  // V · W · 27 · revocations: a removed member books nothing; a removed front desk reads nothing.
  const removed = racers[1]!;
  expect(
    (await call(request, OB, "POST", `/api/v1/gyms/${a}/members/${removed.member}/remove`)).status,
  ).toBe(200);
  statuses.removedBooks = (
    await call(
      request,
      removed.bearer,
      "POST",
      `/api/v1/me/gym-memberships/${removed.member}/class-bookings`,
      {
        occurrence_id: C3,
        client_request_id: randomUUID(),
      },
    )
  ).status;
  expect(statuses.removedBooks).toBe(409);
  expect((await call(request, OB, "DELETE", `/api/v1/gyms/${a}/staff/${deskStaff}`)).status).toBe(
    200,
  );
  statuses.revokedDeskRoster = (
    await call(request, deskB, "GET", `/api/v1/gyms/${a}/class-occurrences/${C1}/bookings`)
  ).status;
  expect(statuses.revokedDeskRoster).toBe(404);
  // The console no longer opens for them: with no other role, the workspace
  // gate sends them to "Where to start"; no class or roster is shown.
  await go(desk, `/en/app/gyms/${a}/timetable`);
  await desk.waitForURL((url) => !url.pathname.includes(`/gyms/${a}`));
  await expect(desk.locator("[data-occurrence-details], [data-class-roster]")).toHaveCount(0);

  // X · 28 · switching accounts on one page clears the previous account's bookings (UI).
  const piotrBearer = await registerApi(request, people.piotr.email, people.piotr.name);
  tokens.push(piotrBearer);
  await joinMember(request, OB, piotrBearer, a);
  await go(marta, "/en/app/me/bookings");
  await expect(marta.locator(`[data-member-booking="${martaBooking}"]`)).toBeVisible();
  await signOut(marta);
  await signIn(marta, people.piotr.email);
  await go(marta, "/en/app/me/bookings");
  await expect(marta.locator("[data-member-state=no-bookings]")).toBeVisible();
  await expect(marta.locator(`[data-member-booking="${martaBooking}"]`)).toHaveCount(0);
  // Y · signing out and in again keeps the legitimate bookings.
  await signOut(marta);
  await signIn(marta, people.marta.email);
  await go(marta, "/en/app/me/bookings");
  await expect(marta.locator(`[data-member-booking="${martaBooking}"]`)).toBeVisible();

  // 29 · 30 · Z · AA · AB · nothing invented, nothing private, nothing commercial.
  await expect(marta.locator("main")).not.toContainText(
    /PLN|zł|credits? left|waitlist #|QR|refund/i,
  );
  const rosterBody = await call(
    request,
    OB,
    "GET",
    `/api/v1/gyms/${a}/class-occurrences/${C1}/bookings`,
  );
  expect(JSON.stringify(rosterBody.body)).not.toContain("@");
  expect(count("training_sessions")).toBe(before.trainingSessions);
  expect(count("coach_fighter_relationships")).toBe(before.relationships);
  expect(
    sql(
      "SELECT coalesce(string_agg(tablename, ','), 'none') FROM pg_tables WHERE schemaname = 'public' AND tablename ~ '(payment|subscription|entitlement|credit|waitlist|qr)'",
    ),
  ).toBe("none");
  expect(count("gym_class_bookings", `gym_id = '${a}'`)).toBe(
    count("gym_audit_events", `gym_id = '${a}' AND event_type = 'class_booking_created'`),
  );
  expect(count("gym_class_check_ins", `gym_id = '${a}'`)).toBe(1);

  // AC · the API log holds no token, bearer header, email address or full name.
  if (API_LOG) {
    const log = readFileSync(API_LOG, "utf8");
    expect(tokens.filter((token) => log.includes(token.replace("Bearer ", "")))).toEqual([]);
    expect(log.includes("Bearer ")).toBe(false);
    expect(
      Object.values(people).filter((p) => log.includes(p.email) || log.includes(p.name)),
    ).toEqual([]);
  }

  evidence.statuses = statuses;
  evidence.bookings = sql(
    `SELECT string_agg(status || coalesce('/' || cancel_reason, '') || '=' || n, ', ' ORDER BY status) FROM (SELECT status, cancel_reason, count(*) n FROM gym_class_bookings WHERE gym_id = '${a}' GROUP BY 1, 2) t`,
  );
  if (EVIDENCE) writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));
  if (HANDOFF)
    writeFileSync(
      HANDOFF,
      JSON.stringify(
        {
          gymId: a,
          gymName: GYM_A,
          memberEmail: people.marta.email,
          memberId: martaMember,
          ownerEmail: people.owner.email,
          webBookedClass: { id: C3, title: "Tomorrow boxing", date: tomorrow.date },
          todayClass: { id: C1, title: "Technical boxing", date: today1.date },
        },
        null,
        2,
      ),
    );
});

/*
 * The second web leg (E2E_SYNC=1), after the mobile leg: the mobile client
 * cancelled the class the web had booked and booked another; both changes
 * show on the web, and the web cancels the mobile booking (H).
 */
test("F · G · H: the web reflects the mobile client's bookings and cancels one", async ({
  browser,
}) => {
  test.skip(
    !SYNC || !HANDOFF || !existsSync(HANDOFF),
    "the second web leg needs the mobile handoff",
  );
  test.setTimeout(300_000);
  const handoff = JSON.parse(readFileSync(HANDOFF, "utf8")) as {
    gymId: string;
    memberEmail: string;
    webBookedClass: { id: string; title: string; date: string };
    mobileBookedClass: { id: string; title: string; date: string };
  };
  const page = await newPage(browser);
  await signIn(page, handoff.memberEmail);
  await go(page, `/en/app/me/gyms/${handoff.gymId}/classes`);
  await page.locator(`[data-member-day="${handoff.webBookedClass.date}"]`).click();
  // G · the mobile cancellation of the web booking shows on the web.
  await expect(classRow(page, handoff.webBookedClass.title)).toHaveAttribute(
    "data-class-state",
    "open",
  );
  // F (reverse) · the mobile booking shows on the web.
  await page.locator(`[data-member-day="${handoff.mobileBookedClass.date}"]`).click();
  await expect(classRow(page, handoff.mobileBookedClass.title)).toHaveAttribute(
    "data-class-state",
    "booked",
  );
  // H · the web cancels the mobile booking.
  await classRow(page, handoff.mobileBookedClass.title).click();
  await details(page).getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel booking" }).click();
  await expect(details(page)).toHaveAttribute("data-class-state", "open");
  expect(
    count(
      "gym_class_bookings",
      `occurrence_id = '${handoff.mobileBookedClass.id}' AND status = 'cancelled' AND cancel_reason = 'member_cancelled'`,
    ),
  ).toBeGreaterThanOrEqual(1);
  expect(confirmed(handoff.mobileBookedClass.id)).toBe(0);
});
