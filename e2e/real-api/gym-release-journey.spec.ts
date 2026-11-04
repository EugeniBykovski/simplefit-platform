import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, type APIRequestContext, type Browser, type Page, test } from "@playwright/test";

/*
 * SF-104: the Operational Gym MVP release journey, end to end on the
 * production build against the real API and PostgreSQL (one disposable
 * database; playwright.real-api.config.ts):
 *
 *   new owner (UI) → gym setup (UI) → sign out / in → the same gym, no
 *   duplicate → staff invitation (UI) → the recipient's emailed link →
 *   acceptance → member enrollment → owner approval (UI) → a class → member
 *   booking (UI) → My bookings after a reload → roster check-in (UI) → the
 *   first-run checklist → multi-gym / multi-context identity → forged and
 *   foreign gym ids → revoked access while a page is open → account switch.
 *
 * Steps marked API-ASSISTED have no client UI in the product (SF-104 finding
 * F-01/F-02): accepting a staff invitation and joining a gym by code exist
 * only as API operations, so the recipient calls them with their own
 * session; the spec first proves that the emailed link reaches no
 * acceptance page. Everything else goes through the web UI. Backend facts
 * are read from the disposable database.
 */

const API_URL = process.env.E2E_REAL_API_URL ?? "";
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";
const API_LOG = process.env.E2E_API_LOG ?? "";

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

/** The console's own Sign out (SF-28). */
async function signOut(page: Page) {
  await page.getByRole("complementary").getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/en/login");
}

const tag = randomUUID().slice(0, 8);
const person = (key: string, name: string) => ({ email: `sf104-${key}-${tag}@example.com`, name });
const people = {
  owner: person("owner", "Yauheni Bykovski"),
  coach: person("coach", "Tomasz Zieliński"),
  member: person("member", "Marta Kowalska"),
  rival: person("rival", "Ola Nowak"),
};
const GYM_A = `Release A ${tag}`;
const GYM_B = `Release B ${tag}`;
const userId = (email: string) =>
  sql(
    `SELECT i.user_id FROM identities i WHERE i.provider = 'email' AND i.provider_subject = '${email}'`,
  );
const evidence: Record<string, unknown> = { tag };
const relationships = () => count("coach_fighter_relationships");
let relationshipsBefore = -1;
const state = {
  a: "",
  b: "",
  ownerBearer: "",
  coachBearer: "",
  memberBearer: "",
  memberId: "",
  occurrence: "",
};
const only = () => test.skip(test.info().project.name !== "chromium-1440", "one journey per run");

test("1–17: a new owner registers, sets up a gym, signs out and in, and reopens the same gym", async ({
  browser,
}) => {
  only();
  relationshipsBefore = relationships();
  const page = await newPage(browser);
  const bearer = sessionOf(page);
  await register(page, people.owner.email, people.owner.name, "gym");
  await go(page, "/en/app/onboarding/gym");
  await createGymInBrowser(page, GYM_A);
  state.a = sql(`SELECT id FROM gyms WHERE name = '${GYM_A}'`);
  state.ownerBearer = bearer();
  const owner = userId(people.owner.email);
  expect(sql(`SELECT setup_status FROM gyms WHERE id = '${state.a}'`)).toBe("completed");

  // 12, 13: the workspace with the backend's gym.
  await go(page, `/en/app/gyms/${state.a}`);
  await expect(page.getByText(GYM_A).first()).toBeVisible();

  // 14–16: sign out, sign in, reopen.
  await signOut(page);
  await signIn(page, people.owner.email);
  await go(page, `/en/app/gyms/${state.a}`);
  await expect(page.getByText(GYM_A).first()).toBeVisible();
  state.ownerBearer = bearer() || state.ownerBearer;

  // 17: exactly one gym, one owner membership, no other draft.
  expect(count("gyms", `created_by_user_id = '${owner}'`)).toBe(1);
  expect(
    count("gym_staff_memberships", `user_id = '${owner}' AND role = 'owner' AND status = 'active'`),
  ).toBe(1);
  expect(count("gyms", `created_by_user_id = '${owner}' AND setup_status = 'draft'`)).toBe(0);
  evidence.owner = { gym: state.a, gyms: 1, ownerMemberships: 1 };
});

test("staff: the owner invites a coach (UI); the emailed link reaches no acceptance page; acceptance is API-only", async ({
  browser,
  request,
}) => {
  only();
  state.coachBearer = await registerApi(request, people.coach.email, people.coach.name);
  const page = await newPage(browser);
  await signIn(page, people.owner.email);
  await go(page, `/en/app/gyms/${state.a}/staff`);
  await page.getByRole("button", { name: "Invite" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill(people.coach.email);
  await dialog.getByRole("radio", { name: /Coach/ }).check();
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(dialog.getByRole("status")).toContainText("is pending until");
  await dialog.getByRole("button", { name: "Done" }).click();
  expect(count("gym_staff_invitations", `gym_id = '${state.a}' AND status = 'pending'`)).toBe(1);

  // The recipient's E06 link: <web>/invite/staff#token=… (the token stays in the fragment).
  const recipient = await newPage(browser);
  await signIn(recipient, people.coach.email);
  await go(recipient, "/en/invite/staff#token=sf104-no-token-is-ever-sent-to-the-server");
  const accept = recipient.getByRole("button", { name: /accept/i });
  evidence.staffAcceptancePage = {
    url: "/en/invite/staff",
    acceptButtons: await accept.count(),
    notFound: await recipient.getByText(/not found|doesn.t exist|couldn.t find/i).count(),
  };
  // F-01: no acceptance UI exists on the web.
  await expect(accept).toHaveCount(0);

  // API-ASSISTED: the recipient accepts from their own inbox (token-free, bound to the verified email).
  const inbox = await call(
    request,
    state.coachBearer,
    "GET",
    "/api/v1/me/staff-invitations?status=pending",
  );
  const item = (inbox.body.invitations as { invitation_id: string }[])[0]!;
  const stolen = await call(
    request,
    state.ownerBearer,
    "POST",
    `/api/v1/me/staff-invitations/${item.invitation_id}/accept`,
  );
  expect([403, 404]).toContain(stolen.status);
  const accepted = await call(
    request,
    state.coachBearer,
    "POST",
    `/api/v1/me/staff-invitations/${item.invitation_id}/accept`,
  );
  expect(accepted.status).toBe(200);
  const replay = await call(
    request,
    state.coachBearer,
    "POST",
    `/api/v1/me/staff-invitations/${item.invitation_id}/accept`,
  );
  expect([200, 409]).toContain(replay.status);
  expect(
    count(
      "gym_staff_memberships",
      `gym_id = '${state.a}' AND user_id = '${userId(people.coach.email)}' AND status = 'active'`,
    ),
  ).toBe(1);

  // The staff workspace appears for the coach, with role-limited permissions.
  await go(recipient, `/en/app/gyms/${state.a}`);
  await expect(recipient.getByText(GYM_A).first()).toBeVisible();
  expect(
    (await call(request, state.coachBearer, "GET", `/api/v1/gyms/${state.a}/business-verification`))
      .status,
  ).toBe(403);
  expect(
    (
      await call(request, state.coachBearer, "POST", `/api/v1/gyms/${state.a}/staff-invitations`, {
        email: "x@example.com",
        role: "front_desk",
      })
    ).status,
  ).toBe(403);
});

test("members: a member without a profile joins (API-ASSISTED), the owner approves in the UI", async ({
  browser,
  request,
}) => {
  only();
  const memberPage = await newPage(browser);
  const memberBearer = sessionOf(memberPage);
  await register(memberPage, people.member.email, people.member.name);
  await expect.poll(() => memberBearer()).not.toBe("");
  state.memberBearer = memberBearer();
  // F-02: no client offers joining by code; the member calls the API with their own session.
  const rotated = await call(
    request,
    state.ownerBearer,
    "POST",
    `/api/v1/gyms/${state.a}/join-code/rotate`,
  );
  const code = (rotated.body.enrollment as { join_code: string }).join_code;
  resetRateLimits();
  const joined = await call(
    request,
    state.memberBearer,
    "POST",
    "/api/v1/me/gym-memberships/join",
    { code },
  );
  expect(joined.status).toBe(201);
  state.memberId = (joined.body.membership as { gym_member_id: string }).gym_member_id;
  const again = await call(request, state.memberBearer, "POST", "/api/v1/me/gym-memberships/join", {
    code,
  });
  expect([200, 409]).toContain(again.status);

  const owner = await newPage(browser);
  await signIn(owner, people.owner.email);
  await go(owner, `/en/app/gyms/${state.a}/members`);
  await owner.getByRole("tab", { name: /^Join requests/ }).click();
  await owner
    .locator("[data-members-requests]")
    .getByRole("button", { name: "Approve Marta K." })
    .click();
  await expect
    .poll(() => sql(`SELECT status FROM gym_members WHERE id = '${state.memberId}'`))
    .toBe("active");

  const member = userId(people.member.email);
  expect(
    count(
      "gym_members",
      `user_id = '${member}' AND gym_id = '${state.a}' AND status IN ('requested','active')`,
    ),
  ).toBe(1);
  expect(count("fighter_profiles", `user_id = '${member}'`)).toBe(0);
  expect(count("coach_profiles", `user_id = '${member}'`)).toBe(0);
  expect(count("gym_staff_memberships", `user_id = '${member}'`)).toBe(0);
  expect(relationships()).toBe(relationshipsBefore);
});

test("class → booking (UI) → My bookings after reload → roster check-in (UI) → first-run checklist", async ({
  browser,
  request,
}) => {
  only();
  const a = state.a;
  const venue = await call(request, state.ownerBearer, "POST", `/api/v1/gyms/${a}/venues`, {
    client_request_id: randomUUID(),
    gym_location_id: sql(`SELECT id FROM gym_locations WHERE gym_id = '${a}' LIMIT 1`),
    name: "Ring 1",
    capacity: 20,
    time_zone: "Europe/Warsaw",
  });
  expect(venue.status).toBe(201);
  const template = await call(
    request,
    state.ownerBearer,
    "POST",
    `/api/v1/gyms/${a}/class-templates`,
    {
      client_request_id: randomUUID(),
      title: "Release boxing",
      default_duration_minutes: 45,
      default_capacity: 2,
      default_venue_id: (venue.body.venue as { venue_id: string }).venue_id,
    },
  );
  const when = warsawSoon(60);
  expect(when.date, "run before 22:40 Warsaw time").toBe(warsaw(new Date()).date);
  const occurrence = await call(
    request,
    state.ownerBearer,
    "POST",
    `/api/v1/gyms/${a}/class-occurrences`,
    {
      client_request_id: randomUUID(),
      template_id: (template.body.template as { template_id: string }).template_id,
      starts_at: when.instant,
      capacity: 2,
    },
  );
  expect(occurrence.status).toBe(201);
  state.occurrence = (occurrence.body.occurrence as { occurrence_id: string }).occurrence_id;

  // The member books in the web UI.
  const member = await newPage(browser);
  await signIn(member, people.member.email);
  await go(member, `/en/app/me/gyms/${a}/classes`);
  const row = member.locator("[data-member-class]").filter({ hasText: "Release boxing" }).first();
  await expect(row).toContainText("2 of 2 left");
  await row.click();
  await member
    .locator("[data-member-class-details]")
    .getByRole("button", { name: "Confirm booking" })
    .click();
  await expect(member.locator("[data-booking-confirmed]")).toContainText("Booking confirmed");
  expect(
    count("gym_class_bookings", `occurrence_id = '${state.occurrence}' AND status = 'confirmed'`),
  ).toBe(1);
  await member.reload();
  await member.getByRole("link", { name: "My bookings" }).click();
  await member.waitForURL("**/en/app/me/bookings");
  await expect(member.locator("[data-member-bookings=upcoming]")).toContainText("Release boxing");

  // The owner checks the member in from the roster (UI).
  const owner = await newPage(browser);
  await signIn(owner, people.owner.email);
  await go(owner, `/en/app/gyms/${a}/timetable`);
  await owner.getByRole("button", { name: "List", exact: true }).click();
  await owner.getByLabel("Go to date").fill(when.date);
  await owner
    .locator(`[data-list-view] [data-local-start="${when.date}T${when.time}:00"]`)
    .first()
    .click();
  await owner.locator("[data-occurrence-details]").getByRole("button", { name: "Roster" }).click();
  const roster = owner.getByRole("dialog", { name: "Release boxing" });
  await expect(roster.locator("[data-roster-entries=confirmed]")).toContainText("Marta K.");
  await expect(roster).not.toContainText("@");
  await roster.getByRole("button", { name: "Check in Marta K." }).click();
  await expect(roster.locator("[data-check-in-done]")).toContainText("Marta K. is checked in.");
  expect(count("gym_class_check_ins", `occurrence_id = '${state.occurrence}'`)).toBe(1);

  // Duplicate check-in through the API is the same arrival.
  const booking = sql(
    `SELECT id FROM gym_class_bookings WHERE occurrence_id = '${state.occurrence}'`,
  );
  const twice = await call(
    request,
    state.ownerBearer,
    "POST",
    `/api/v1/gyms/${a}/class-bookings/${booking}/check-in`,
  );
  expect([200, 409]).toContain(twice.status);
  expect(count("gym_class_check_ins", `occurrence_id = '${state.occurrence}'`)).toBe(1);

  // The backend's checklist: real facts only.
  const firstRun = await call(request, state.ownerBearer, "GET", `/api/v1/gyms/${a}/first-run`);
  const checklist = (firstRun.body.first_run as { checklist: { key: string; status: string }[] })
    .checklist;
  expect(checklist.map((item) => item.key)).toEqual([
    "create_gym",
    "add_class",
    "invite_staff",
    "invite_members",
    "first_check_in",
  ]);
  expect(checklist.every((item) => item.status === "completed")).toBe(true);
  evidence.checklist = checklist;
  // Staff do not get the owner's introduction.
  expect(
    (await call(request, state.coachBearer, "GET", `/api/v1/gyms/${a}/first-run`)).status,
  ).toBe(403);
});

test("multi-gym, multi-context: the coach owns Gym B and is a member of Gym A; tabs, forged and foreign ids", async ({
  browser,
  request,
}) => {
  only();
  // The coach (staff at A) creates Gym B through the API with their own session.
  const created = await call(request, state.coachBearer, "POST", "/api/v1/gyms", {
    client_request_id: randomUUID(),
    name: GYM_B,
    gym_type: "boxing_gym",
  });
  expect(created.status).toBe(201);
  state.b = (created.body.gym as { id: string }).id;
  expect(
    (
      await call(
        request,
        state.coachBearer,
        "PUT",
        `/api/v1/gyms/${state.b}/setup/primary-location`,
        {
          expected_revision: 1,
          country_code: "PL",
          city: "Kraków",
          address_line: "ul. Długa 1",
        },
      )
    ).status,
  ).toBe(200);
  expect(
    (await call(request, state.coachBearer, "POST", `/api/v1/gyms/${state.b}/complete-setup`))
      .status,
  ).toBe(200);

  // The coach also joins Gym A as a member; staff and member stay separate facts.
  const rotated = await call(
    request,
    state.ownerBearer,
    "POST",
    `/api/v1/gyms/${state.a}/join-code/rotate`,
  );
  const code = (rotated.body.enrollment as { join_code: string }).join_code;
  resetRateLimits();
  const joined = await call(request, state.coachBearer, "POST", "/api/v1/me/gym-memberships/join", {
    code,
  });
  evidence.coachJoinsGymWhereStaff = joined.status;
  const coach = userId(people.coach.email);
  expect(count("gym_staff_memberships", `user_id = '${coach}' AND status = 'active'`)).toBe(2);
  expect(relationships()).toBe(relationshipsBefore);

  // Two tabs, two gyms: each console shows its own gym.
  const page = await newPage(browser);
  await signIn(page, people.coach.email);
  const second = await page.context().newPage();
  await go(page, `/en/app/gyms/${state.a}`);
  await go(second, `/en/app/gyms/${state.b}`);
  await expect(page.getByText(GYM_A).first()).toBeVisible();
  await expect(second.getByText(GYM_B).first()).toBeVisible();
  await expect(second.getByText(GYM_A)).toHaveCount(0);

  // A stranger and forged ids: 404 everywhere, never a 403 that reveals the gym.
  const rival = await registerApi(request, people.rival.email, people.rival.name);
  for (const path of [
    "",
    "/staff",
    "/members",
    "/class-occurrences",
    "/go-live",
    "/business-verification",
    "/billing",
    "/first-run",
  ]) {
    expect((await call(request, rival, "GET", `/api/v1/gyms/${state.a}${path}`)).status, path).toBe(
      404,
    );
  }
  expect(
    (await call(request, state.coachBearer, "GET", `/api/v1/gyms/${randomUUID()}`)).status,
  ).toBe(404);
  expect((await call(request, state.coachBearer, "GET", "/api/v1/gyms/not-a-uuid")).status).toBe(
    404,
  );
  const rivalPage = await newPage(browser);
  await signIn(rivalPage, people.rival.email);
  await go(rivalPage, `/en/app/gyms/${state.a}`);
  await expect(rivalPage.getByText(GYM_A)).toHaveCount(0);
});

test("revoked access while a page is open, and an account switch in the same browser", async ({
  browser,
  request,
}) => {
  only();
  const page = await newPage(browser);
  await signIn(page, people.coach.email);
  await go(page, `/en/app/gyms/${state.a}/timetable`);
  await expect(page.getByText(GYM_A).first()).toBeVisible();

  // The owner removes the coach while the page is open.
  const membership = sql(
    `SELECT id FROM gym_staff_memberships WHERE gym_id = '${state.a}' AND user_id = '${userId(people.coach.email)}' AND status = 'active'`,
  );
  expect(
    (
      await call(
        request,
        state.ownerBearer,
        "DELETE",
        `/api/v1/gyms/${state.a}/staff/${membership}`,
      )
    ).status,
  ).toBe(200);
  expect(
    (await call(request, state.coachBearer, "GET", `/api/v1/gyms/${state.a}/class-occurrences`))
      .status,
  ).toBe(404);
  await page.reload();
  await expect(page.getByText(GYM_A)).toHaveCount(0);
  // The coach's own Gym B is untouched.
  expect((await call(request, state.coachBearer, "GET", `/api/v1/gyms/${state.b}`)).status).toBe(
    200,
  );

  // Account switch: the coach signs out, the member signs in; nothing of the coach remains.
  await go(page, `/en/app/gyms/${state.b}`);
  await expect(page.getByText(GYM_B).first()).toBeVisible();
  await signOut(page);
  await signIn(page, people.member.email);
  await go(page, `/en/app/gyms/${state.b}`);
  await expect(page.getByText(GYM_B)).toHaveCount(0);
  await go(page, "/en/app/me/gyms");
  await expect(page.getByText(GYM_A).first()).toBeVisible();
  await expect(page.getByText(GYM_B)).toHaveCount(0);
});

test("logs and evidence: no token, code or address in the API log", () => {
  only();
  const log = API_LOG ? readFileSync(API_LOG, "utf8") : "";
  test.skip(log === "", "E2E_API_LOG is not set");
  for (const secret of [
    state.ownerBearer.replace("Bearer ", ""),
    state.memberBearer.replace("Bearer ", ""),
    ...Object.values(people).map((p) => p.email),
  ]) {
    if (secret) expect(log).not.toContain(secret);
  }
  const out = process.env.E2E_EVIDENCE;
  if (out) writeFileSync(`${out}-release-journey.json`, JSON.stringify(evidence, null, 2));
});
