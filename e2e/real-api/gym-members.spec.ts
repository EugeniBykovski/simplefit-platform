import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { expect, type APIRequestContext, type Browser, type Page, test } from "@playwright/test";

/*
 * SF-96: the gym's members end to end, against the real API and PostgreSQL
 * (playwright.real-api.config.ts), scenarios A–AF of the ticket. The API of
 * this run keeps member invitations off, as production does until the
 * recipient page exists (README: started with `member_invitations: false`).
 *
 * What is the web UI and what is not, exactly:
 * - every staff step on the members page (open it, read and rotate the join
 *   code, switch auto-approval, approve, reject, end, try to invite, choose,
 *   map and validate a CSV) is a browser action on the production build;
 * - joining with a code is the real SF-95 `POST /api/v1/me/gym-memberships/
 *   join` called with the applicant's own session, because no member-side
 *   web page exists yet (backend-assisted); so are the staff acceptances
 *   (`/me/staff-invitations`, SF-93) that give the gym its manager, front
 *   desk and coach, and Gym B's own setup;
 * - the unverified applicant (R) is created by `fixtures/member-unverified-
 *   join.exs` (a completed account with no sign-in identity, joining through
 *   `SimpleFit.Gyms.join_gym/4`), since every sign-up path creates one;
 * - the CSV preview is a dry run only: no import exists or is tested;
 * - backend checks read the disposable database (psql) or call the API with
 *   a page's own session, and record its status codes.
 */

const API_URL = process.env.E2E_REAL_API_URL ?? "";
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
/** The API server's log of this run (AF): scanned for secrets, never printed. */
const API_LOG = process.env.E2E_API_LOG ?? "";
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";

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
const member = (gym: string, user: string) =>
  sql(
    `SELECT status || '|' || auto_approved || '|' || coalesce(ended_reason, '') FROM gym_members WHERE gym_id = '${gym}' AND user_id = '${user}' ORDER BY inserted_at DESC LIMIT 1`,
  );
const count = (table: string, where = "true") =>
  Number(sql(`SELECT count(*) FROM ${table} WHERE ${where}`));
const activeMembers = (gym: string) =>
  count("gym_members", `gym_id = '${gym}' AND status = 'active'`);
const staffRow = (gym: string, user: string) =>
  sql(
    `SELECT id FROM gym_staff_memberships WHERE gym_id = '${gym}' AND user_id = '${user}' AND status = 'active'`,
  );

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name });
const codeInput = (page: Page) => page.locator('[data-slot="code-input"]');
const focus = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
const active = (page: Page) => page.getByRole("table", { name: "Active members" });
const tab = (page: Page, name: string | RegExp) => page.getByRole("tab", { name }).click();
const requests = (page: Page) => page.locator("[data-members-requests]");

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

/** Every API path the page calls (method and path only: never a body or header). */
function pathsOf(page: Page) {
  const seen: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(API_URL)) {
      seen.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });
  return seen;
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
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
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
  expect(
    (
      await call(request, bearer, "PUT", `/api/v1/gyms/${id}/setup/primary-location`, {
        expected_revision: 1,
        country_code: "PL",
        city: "Sopot",
        address_line: "ul. Morska 1",
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
    {
      email,
      role,
    },
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

/** A person joins with the code through the SF-95 member API, with their own session. */
async function joinWithCode(request: APIRequestContext, bearer: string, code: string) {
  return call(request, bearer, "POST", "/api/v1/me/gym-memberships/join", { code });
}

const run = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const tag = run();
const GYM_A = `Members A ${tag}`;
const GYM_B = `Members B ${tag}`;
const person = (key: string, name: string) => ({
  email: `e2e-sf96-${key}-${tag}@example.com`,
  name,
});
const people = {
  owner: person("owner", "Yauheni Bykovski"),
  manager: person("manager", "Agnieszka Lis"),
  desk: person("desk", "Michał Sowa"),
  coach: person("coach", "Tomasz Zieliński"),
  p1: person("p1", "Marta Kowal"),
  p2: person("p2", "Piotr Zając"),
  p3: person("p3", "Ewa Malec"),
  p4: person("p4", "Rafał Tur"),
  p5: person("p5", "Kamila Lew"),
  ownerB: person("ownerb", "Ola Nowak"),
};
const statuses: Record<string, number> = {};
const IMPORT_EMAILS = [`csv-anna-${tag}@example.com`, `csv-bart-${tag}@example.com`];

test("A–AF: members on the web, joins through the backend, isolation, privacy and the dry run", async ({
  browser,
  request,
}) => {
  test.setTimeout(300_000);
  const relationshipsBefore = sql("SELECT count(*) FROM coach_fighter_relationships");

  // A · the owner creates and completes Gym A in the web onboarding.
  const owner = await newPage(browser);
  const ownerBearer = sessionOf(owner);
  const ownerPaths = pathsOf(owner);
  await register(owner, people.owner.email, "gym", people.owner.name);
  await owner.waitForURL((url) => url.pathname === "/en/app/onboarding/gym");
  await createGymInBrowser(owner, GYM_A);
  await owner.getByRole("button", { name: "Go to gym" }).click();
  const a = gymIdOf(GYM_A);
  await owner.waitForURL(`**/en/app/gyms/${a}`);

  // AE (before) · invite_members is available, not done, and leads to the members page.
  const milestone = owner.locator("[data-checklist-key=invite_members]");
  await expect(milestone).toHaveAttribute("data-checklist-status", "available");

  // B · the owner opens Members from the console's sidebar.
  await (await navigation(owner)).getByRole("link", { name: "Members" }).click();
  await owner.waitForURL(`**/en/app/gyms/${a}/members`);
  await expect(heading(owner, "Members")).toBeVisible();

  // C · the roster is empty, on screen and in the database.
  await expect(owner.locator("[data-members-empty=active]")).toContainText("No members yet");
  expect(count("gym_members", `gym_id = '${a}'`)).toBe(0);

  // Joining by code is off by default; the owner turns it on in the web UI.
  await tab(owner, "Join code & approval");
  await expect(owner.locator("[data-join-code-off]")).toBeVisible();
  await owner.getByRole("button", { name: "Turn on joining by code" }).click();
  const firstCode = (await owner.locator("[data-join-code]").textContent())?.trim() ?? "";
  expect(firstCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  await expect(owner.getByRole("switch")).not.toBeChecked();

  // D · an authenticated user with no FighterProfile asks to join (their own API call).
  const p1 = await newPage(browser);
  const p1Bearer = sessionOf(p1);
  await register(p1, people.p1.email, "fighter", people.p1.name);
  const p1Id = userId(people.p1.email);
  expect(count("fighter_profiles", `user_id = '${p1Id}'`)).toBe(0);
  resetRateLimits();
  const joined = await joinWithCode(request, p1Bearer(), firstCode);
  statuses["D join with the code"] = joined.status;
  expect(joined.status).toBe(201);
  expect(member(a, p1Id)).toBe("requested|false|");

  // E · the owner sees the pending request in the web UI.
  await tab(owner, /^Join requests/);
  await expect(requests(owner)).toContainText("Marta K.");

  // F, G · approved in the web UI; exactly one active membership.
  await requests(owner).getByRole("button", { name: "Approve Marta K." }).click();
  await expect(owner.getByText(`Marta K. is now a member of ${GYM_A}.`)).toBeVisible();
  expect(member(a, p1Id)).toBe("active|false|");
  expect(count("gym_members", `gym_id = '${a}' AND user_id = '${p1Id}'`)).toBe(1);
  expect(activeMembers(a)).toBe(1);
  await tab(owner, "Members");
  await expect(active(owner).locator("[data-member]")).toHaveCount(1);
  await expect(active(owner)).toContainText("Marta K.");

  // AE · the milestone completes from the backend's projection (an active member).
  const firstRun = await call(request, ownerBearer(), "GET", `/api/v1/gyms/${a}/first-run`);
  expect(
    (firstRun.body.first_run as { checklist: { key: string; status: string }[] }).checklist.find(
      (item) => item.key === "invite_members",
    )?.status,
  ).toBe("completed");
  await go(owner, `/en/app/gyms/${a}`);
  await expect(milestone).toHaveAttribute("data-checklist-status", "completed");
  await go(owner, `/en/app/gyms/${a}/members`);

  // H · another request is rejected in the web UI (confirmed first).
  const p2 = await newPage(browser);
  const p2Bearer = sessionOf(p2);
  await register(p2, people.p2.email, "fighter", people.p2.name);
  const p2Id = userId(people.p2.email);
  resetRateLimits();
  expect((await joinWithCode(request, p2Bearer(), firstCode)).status).toBe(201);
  await tab(owner, /^Join requests/);
  await requests(owner).getByRole("button", { name: "Reject Piotr Z." }).click();
  await owner.getByRole("alertdialog").getByRole("button", { name: "Reject request" }).click();
  await expect(owner.getByText("Piotr Z.’s request was rejected.")).toBeVisible();
  expect(member(a, p2Id)).toBe("rejected|false|");
  expect(activeMembers(a)).toBe(1);

  // Staff for I, J, K: manager, front desk and coach accept SF-93 invitations (backend-assisted).
  const manager = await newPage(browser);
  const managerBearer = sessionOf(manager);
  await register(manager, people.manager.email, "fighter", people.manager.name);
  await joinStaff(request, ownerBearer(), managerBearer(), a, people.manager.email, "manager");
  const desk = await newPage(browser);
  const deskBearer = sessionOf(desk);
  await register(desk, people.desk.email, "fighter", people.desk.name);
  await joinStaff(request, ownerBearer(), deskBearer(), a, people.desk.email, "front_desk");
  const coach = await newPage(browser);
  const coachBearer = sessionOf(coach);
  await register(coach, people.coach.email, "coach", people.coach.name);
  await joinStaff(request, ownerBearer(), coachBearer(), a, people.coach.email, "coach");

  // I · the manager approves a request in the web UI.
  const p3 = await newPage(browser);
  const p3Bearer = sessionOf(p3);
  await register(p3, people.p3.email, "fighter", people.p3.name);
  const p3Id = userId(people.p3.email);
  resetRateLimits();
  expect((await joinWithCode(request, p3Bearer(), firstCode)).status).toBe(201);
  await go(manager, `/en/app/gyms/${a}/members`);
  await tab(manager, /^Join requests/);
  await requests(manager).getByRole("button", { name: "Approve Ewa M." }).click();
  await expect(manager.getByText(`Ewa M. is now a member of ${GYM_A}.`)).toBeVisible();
  expect(member(a, p3Id)).toBe("active|false|");

  // J · the front desk approves a request and reads the code, without settings or ending.
  const p4 = await newPage(browser);
  const p4Bearer = sessionOf(p4);
  await register(p4, people.p4.email, "fighter", people.p4.name);
  const p4Id = userId(people.p4.email);
  resetRateLimits();
  expect((await joinWithCode(request, p4Bearer(), firstCode)).status).toBe(201);
  await go(desk, `/en/app/gyms/${a}/members`);
  await expect(desk.getByRole("button", { name: "End membership" })).toHaveCount(0);
  await tab(desk, /^Join requests/);
  await requests(desk).getByRole("button", { name: "Approve Rafał T." }).click();
  await expect(desk.getByText(`Rafał T. is now a member of ${GYM_A}.`)).toBeVisible();
  expect(member(a, p4Id)).toBe("active|false|");
  await tab(desk, "Join code & approval");
  await expect(desk.locator("[data-join-code]")).toHaveText(firstCode);
  await expect(desk.getByRole("button", { name: "New code" })).toHaveCount(0);
  await expect(desk.getByRole("switch")).toBeDisabled();
  const p4Row = sql(`SELECT id FROM gym_members WHERE gym_id = '${a}' AND user_id = '${p4Id}'`);
  statuses["J front desk ends a membership"] = (
    await call(request, deskBearer(), "POST", `/api/v1/gyms/${a}/members/${p4Row}/remove`)
  ).status;
  statuses["J front desk rotates the code"] = (
    await call(request, deskBearer(), "POST", `/api/v1/gyms/${a}/join-code/rotate`)
  ).status;
  expect([
    statuses["J front desk ends a membership"],
    statuses["J front desk rotates the code"],
  ]).toEqual([403, 403]);
  expect(member(a, p4Id)).toBe("active|false|");

  // K · the coach: the backend's 403, shown as restricted; no member data reaches the page.
  for (const path of ["members", "join-requests", "enrollment", "member-invitations"]) {
    statuses[`K coach GET ${path}`] = (
      await call(request, coachBearer(), "GET", `/api/v1/gyms/${a}/${path}`)
    ).status;
  }
  expect(
    Object.entries(statuses)
      .filter(([key]) => key.startsWith("K "))
      .map(([, value]) => value),
  ).toEqual([403, 403, 403, 403]);
  await go(coach, `/en/app/gyms/${a}/members`);
  await expect(coach.locator("[data-members-restricted]")).toBeVisible();
  await expect(coach.getByText("Marta K.")).toHaveCount(0);

  // L · the same user joins Gym B on their own (Gym B's owner sets it up through the API).
  const ownerB = await newPage(browser);
  const ownerBBearer = sessionOf(ownerB);
  await register(ownerB, people.ownerB.email, "fighter", people.ownerB.name);
  const b = await createGymThroughApi(request, ownerBBearer(), GYM_B);
  const codeB = (
    (await call(request, ownerBBearer(), "POST", `/api/v1/gyms/${b}/join-code/rotate`)).body
      .enrollment as { join_code: string }
  ).join_code;
  resetRateLimits();
  expect((await joinWithCode(request, p1Bearer(), codeB)).status).toBe(201);
  const p1RowB = sql(`SELECT id FROM gym_members WHERE gym_id = '${b}' AND user_id = '${p1Id}'`);
  expect(
    (
      await call(
        request,
        ownerBBearer(),
        "POST",
        `/api/v1/gyms/${b}/join-requests/${p1RowB}/approve`,
      )
    ).status,
  ).toBe(200);
  expect(member(b, p1Id)).toBe("active|false|");
  expect(member(a, p1Id)).toBe("active|false|");
  // Gym B also has a member who never joined Gym A.
  resetRateLimits();
  expect((await joinWithCode(request, p2Bearer(), codeB)).status).toBe(201);

  // M · Gym A never shows Gym B's members or requests; A's owner cannot read B.
  await go(owner, `/en/app/gyms/${a}/members`);
  await expect(active(owner).locator("[data-member]")).toHaveCount(activeMembers(a));
  await tab(owner, /^Join requests/);
  await expect(requests(owner)).not.toContainText("Piotr Z.");
  statuses["M owner A reads B members"] = (
    await call(request, ownerBearer(), "GET", `/api/v1/gyms/${b}/members`)
  ).status;
  expect(statuses["M owner A reads B members"]).toBe(404);

  // N, O · the owner rotates the code in the web UI; the old code no longer works.
  await tab(owner, "Join code & approval");
  await owner.getByRole("button", { name: "New code" }).click();
  await owner.getByRole("alertdialog").getByRole("button", { name: "Issue new code" }).click();
  await expect(owner.locator("[data-join-code]")).not.toHaveText(firstCode);
  const secondCode = (await owner.locator("[data-join-code]").textContent())?.trim() ?? "";
  expect(secondCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  await expect(owner.getByText(firstCode)).toHaveCount(0);
  const p5 = await newPage(browser);
  const p5Bearer = sessionOf(p5);
  await register(p5, people.p5.email, "fighter", people.p5.name);
  const p5Id = userId(people.p5.email);
  resetRateLimits();
  statuses["O join with the old code"] = (
    await joinWithCode(request, p5Bearer(), firstCode)
  ).status;
  expect(statuses["O join with the old code"]).toBe(404);
  expect(count("gym_members", `user_id = '${p5Id}'`)).toBe(0);

  // P · auto-approval: explained, confirmed, persisted by the backend.
  await owner.getByRole("switch").click();
  const explain = owner.getByRole("alertdialog");
  await expect(explain).toContainText("verified sign-in");
  await explain.getByRole("button", { name: "Turn on" }).click();
  await expect(owner.getByRole("switch")).toBeChecked();
  expect(sql(`SELECT auto_approve FROM gym_enrollment_settings WHERE gym_id = '${a}'`)).toBe("t");
  await owner.reload();
  await tab(owner, "Join code & approval");
  await expect(owner.getByRole("switch")).toBeChecked();

  // Q · a verified applicant is auto-approved under the policy.
  resetRateLimits();
  const auto = await joinWithCode(request, p5Bearer(), secondCode);
  statuses["Q verified join with auto-approval"] = auto.status;
  expect(member(a, p5Id)).toBe("active|true|");

  // R · an applicant without a verified identity still waits (fixture: no sign-in identity).
  const unverified = execFileSync(
    "mix",
    ["run", "--no-start", resolve("e2e/real-api/fixtures/member-unverified-join.exs"), tag],
    {
      cwd: API_DIR,
      env: { ...mixEnv(), SF96_JOIN_CODE: secondCode },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  )
    .trim()
    .split("\n")
    .pop()
    ?.split(" ");
  expect(unverified?.slice(1)).toEqual(["requested", "false"]);
  await tab(owner, /^Join requests/);
  await expect(requests(owner)).toContainText("Nina N.");

  // S, T · member invitations are off on this server: the backend's 409, said truthfully.
  const jobsBefore = count("oban_jobs");
  await owner.getByRole("button", { name: "Invite member" }).click();
  const invite = owner.getByRole("dialog");
  await invite.getByLabel("Email address").fill(`e2e-sf96-invitee-${tag}@example.com`);
  await invite.getByRole("button", { name: "Create invitation" }).click();
  await expect(invite).toContainText("Member invitations aren’t available yet");
  await expect(invite).toContainText("Nothing was created and no email was sent.");
  await expect(invite).not.toContainText(/pending until|delivered/i);
  await invite.getByRole("button", { name: "OK" }).click();
  await expect(owner.getByRole("button", { name: "Invite member" })).toHaveCount(0);
  statuses["S create a member invitation"] = (
    await call(request, ownerBearer(), "POST", `/api/v1/gyms/${a}/member-invitations`, {
      email: `e2e-sf96-invitee-${tag}@example.com`,
    })
  ).status;
  expect(statuses["S create a member invitation"]).toBe(409);
  expect(count("gym_member_invitations", `gym_id = '${a}'`)).toBe(0);
  expect(count("oban_jobs")).toBe(jobsBefore);

  // U–Z · the CSV dry run in the web UI: mapped, validated, masked; nothing stored or sent.
  const before = {
    members: count("gym_members"),
    invitations: count("gym_member_invitations"),
    users: count("users"),
    identities: count("identities"),
    jobs: count("oban_jobs"),
    audit: count("gym_audit_events"),
  };
  const csv = [
    "Imię i nazwisko;e-mail;karnet;tel",
    `Anna Nowak;${IMPORT_EMAILS[0]};Open;+48 600 000 001`,
    `Marta Kowal;${people.p1.email};Open;+48 600 000 002`,
    `Anna N;${IMPORT_EMAILS[0]!.toUpperCase()};Open;`,
    `Bartek;${IMPORT_EMAILS[1]};Open;`,
    ";not-an-email;x;",
    "Ola;;x;",
  ].join("\n");
  await tab(owner, "Import preview");
  await owner.locator("[data-import-input]").setInputFiles({
    name: "members.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(owner.locator("[data-import-mapping]")).toBeVisible();
  // Map by hand: email → "e-mail", name → "Imię i nazwisko".
  await owner.locator("[data-import-map=email]").click();
  await owner.getByRole("option", { name: "e-mail" }).click();
  await owner.locator("[data-import-map=name]").click();
  await owner.getByRole("option", { name: "Imię i nazwisko" }).click();
  await owner.getByRole("button", { name: "Run validation" }).click();
  const results = owner.locator("[data-import-results]");
  await expect(results).toContainText("Validation complete: 6 rows checked.");
  await expect(results).toContainText(
    "Validation complete. Importing member records is not available yet.",
  );
  await expect(results.locator("[data-import-outcome=ready]")).toHaveCount(2);
  await expect(results.locator("[data-import-outcome=already_member]")).toHaveCount(1);
  await expect(results.locator("[data-import-outcome=duplicate]")).toContainText(
    "Same address as line 2",
  );
  await expect(results.locator("[data-import-outcome=invalid_email]")).toHaveCount(1);
  await expect(results.locator("[data-import-outcome=missing_email]")).toHaveCount(1);
  await expect(results).toContainText("Not used: karnet and tel.");
  for (const address of [...IMPORT_EMAILS, people.p1.email]) {
    await expect(owner.locator("main")).not.toContainText(address);
  }
  await expect(owner.locator("main")).not.toContainText(
    /imported successfully|import completed|members added|matched to verified/i,
  );
  await expect(owner.getByRole("button", { name: /^(import|commit|send invit)/i })).toHaveCount(0);
  expect({
    members: count("gym_members"),
    invitations: count("gym_member_invitations"),
    users: count("users"),
    identities: count("identities"),
    jobs: count("oban_jobs"),
    audit: count("gym_audit_events"),
  }).toEqual(before);
  for (const address of IMPORT_EMAILS) {
    expect(count("identities", `lower(provider_subject) = lower('${address}')`)).toBe(0);
  }
  // Z · the page called the preview only; the API has no commit route.
  expect(ownerPaths.filter((path) => path.includes("member-imports"))).toEqual([
    `POST /api/v1/gyms/${a}/member-imports/preview`,
  ]);
  statuses["Z POST member-imports (no commit route)"] = (
    await call(request, ownerBearer(), "POST", `/api/v1/gyms/${a}/member-imports`, {
      csv: "email\n",
    })
  ).status;
  statuses["Z POST member-imports/commit"] = (
    await call(request, ownerBearer(), "POST", `/api/v1/gyms/${a}/member-imports/commit`, {})
  ).status;
  expect(statuses["Z POST member-imports (no commit route)"]).toBe(404);
  expect(statuses["Z POST member-imports/commit"]).toBe(404);
  expect(
    await owner.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toMatch(/csv-anna|K\d|@example\.com/);

  // The owner ends a membership in the web UI (confirmed; the account and Gym B untouched).
  await tab(owner, "Members");
  await owner.getByRole("button", { name: "Show details for Marta K." }).click();
  await owner.getByRole("button", { name: "End membership" }).click();
  const end = owner.getByRole("alertdialog");
  await expect(end).toContainText("Memberships at other gyms aren’t affected.");
  await end.getByRole("button", { name: "End membership" }).click();
  await expect(owner.getByText(`Marta K. is no longer a member of ${GYM_A}.`)).toBeVisible();
  expect(member(a, p1Id)).toBe("ended|false|removed");
  expect(member(b, p1Id)).toBe("active|false|");
  expect(count("users", `id = '${p1Id}'`)).toBe(1);

  // AB · revoking the front desk's staff access blocks their next member operation.
  const deskRow = staffRow(a, userId(people.desk.email));
  expect(
    (await call(request, ownerBearer(), "DELETE", `/api/v1/gyms/${a}/staff/${deskRow}`)).status,
  ).toBe(200);
  const nina = sql(
    `SELECT id FROM gym_members WHERE gym_id = '${a}' AND status = 'requested' LIMIT 1`,
  );
  statuses["AB revoked desk approves"] = (
    await call(request, deskBearer(), "POST", `/api/v1/gyms/${a}/join-requests/${nina}/approve`)
  ).status;
  expect(statuses["AB revoked desk approves"]).toBe(404);
  // Without any gym left, the console's entry gate leaves the console altogether.
  await focus(desk);
  await desk.waitForURL((url) => !url.pathname.startsWith(`/en/app/gyms/${a}`));
  await expect(desk.locator("[data-gym-members]")).toHaveCount(0);
  await expect(desk.getByText("Rafał T.")).toHaveCount(0);
  await expect(desk.getByText(firstCode)).toHaveCount(0);
  await expect(desk.getByText(secondCode)).toHaveCount(0);

  // AA · switching accounts in the same browser leaves nothing of Gym A behind.
  await (await navigation(owner)).getByRole("button", { name: "Sign out" }).click();
  await owner.waitForURL((url) => url.pathname === "/en/login");
  await expect(owner.getByText("Ewa M.")).toHaveCount(0);
  await signIn(owner, people.p2.email);
  // A member of Gym B, staff nowhere: no gym console opens for this account.
  await go(owner, `/en/app/gyms/${a}/members`);
  await owner.waitForURL((url) => !url.pathname.startsWith(`/en/app/gyms/${a}`));
  await expect(owner.locator("[data-gym-members]")).toHaveCount(0);
  await expect(owner.locator("body")).not.toContainText(/Ewa M\.|Rafał T\.|Kamila L\./);
  statuses["AA second account reads Gym A members"] = (
    await call(request, ownerBearer(), "GET", `/api/v1/gyms/${a}/members`)
  ).status;
  expect(statuses["AA second account reads Gym A members"]).toBe(404);

  // AC · enrollment created no Coach–Fighter relationship.
  expect(sql("SELECT count(*) FROM coach_fighter_relationships")).toBe(relationshipsBefore);

  // AD · the roster contract: no email, user id, profile or training field for any member.
  const again = await newPage(browser);
  const againBearer = sessionOf(again);
  await signIn(again, people.owner.email);
  await go(again, `/en/app/gyms/${a}/members`);
  await expect(active(again).locator("[data-member]")).toHaveCount(activeMembers(a));
  await expect(again.locator("main")).not.toContainText(/@example\.com/);
  for (const part of ["[data-members-roster]", "[data-member-person]"]) {
    await expect(again.locator(part)).not.toContainText(/weight|goal|coach note|training/i);
  }
  const roster = await call(
    request,
    againBearer(),
    "GET",
    `/api/v1/gyms/${a}/members?status=active`,
  );
  const keys = new Set(
    (roster.body.members as Record<string, unknown>[]).flatMap((row) => Object.keys(row)),
  );
  expect([...keys].sort()).toEqual(
    [
      "auto_approved",
      "ended_at",
      "ended_reason",
      "gym_member_id",
      "joined_at",
      "joined_via",
      "name",
      "requested_at",
      "responded_at",
      "status",
    ].sort(),
  );
  expect(JSON.stringify(roster.body)).not.toMatch(/@example\.com|user_id|weight|goal/);

  // AF · the API's own log of this run holds no join code, invitation token, imported
  // address, access token or emailed code (matched here; nothing is printed).
  if (API_LOG) {
    const log = readFileSync(API_LOG, "utf8");
    const leaks = {
      joinCodes: [firstCode, secondCode, codeB].filter(
        (code) => log.includes(code) || log.includes(code.replace("-", "")),
      ).length,
      importedAddresses: IMPORT_EMAILS.filter((address) => log.includes(address)).length,
      invitationTokens: (log.match(/sgm_[A-Za-z0-9_-]{8,}/g) ?? []).length,
      bearerTokens: (log.match(/Bearer\s+[A-Za-z0-9._-]{16,}/g) ?? []).length,
      csvRows: log.includes("Anna Nowak") || log.includes("not-an-email") ? 1 : 0,
    };
    expect(leaks).toEqual({
      joinCodes: 0,
      importedAddresses: 0,
      invitationTokens: 0,
      bearerTokens: 0,
      csvRows: 0,
    });
  }

  // The recorded status codes, as evidence of the run (no code, token or address).
  writeFileSync(test.info().outputPath("statuses.json"), JSON.stringify(statuses, null, 2));
});
