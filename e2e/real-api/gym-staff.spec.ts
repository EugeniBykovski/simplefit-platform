import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { expect, type APIRequestContext, type Browser, type Page, test } from "@playwright/test";

/*
 * SF-94: the gym's coaches & staff end to end, against the real API and
 * PostgreSQL (playwright.real-api.config.ts), scenarios A–V of the ticket.
 *
 * What is the web UI and what is not, exactly:
 * - every staff administration step (open the page, invite, resend, change
 *   a role, remove) is a browser action on the production build;
 * - a recipient's acceptance is the real SF-93 recipient API
 *   (`acceptMyStaffInvitation`) called with that recipient's own session,
 *   because no recipient web page or app inbox exists yet: this is not an
 *   email-to-web acceptance journey;
 * - backend checks read the disposable database (psql) or call the API with
 *   a page's own session, and record its status codes.
 *
 * Scenario Q needs a Coach–Fighter relationship with a planned session; it
 * is inserted by `fixtures/staff-private-training-seed.exs` (SimpleFit's own
 * schemas, refused on any database without `e2e` in its name).
 */

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
const membership = (gym: string, user: string) =>
  sql(
    `SELECT role || '|' || status || '|' || coalesce(ended_reason, '') FROM gym_staff_memberships WHERE gym_id = '${gym}' AND user_id = '${user}' ORDER BY inserted_at DESC LIMIT 1`,
  );
const activeCount = (gym: string) =>
  Number(
    sql(`SELECT count(*) FROM gym_staff_memberships WHERE gym_id = '${gym}' AND status = 'active'`),
  );

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name });
const codeInput = (page: Page) => page.locator('[data-slot="code-input"]');
const focus = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
const roster = (page: Page) => page.getByRole("table", { name: "Active staff" });

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
}

async function signIn(page: Page, email: string) {
  resetRateLimits();
  await go(page, "/en/login");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await page.waitForURL((url) => url.pathname === "/en/login/code");
  await codeInput(page).pressSequentially(emailedCode(email));
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

/** The recipient accepts through the SF-93 recipient API with their own session (no recipient UI yet). */
async function acceptAsRecipient(request: APIRequestContext, bearer: string, gymId: string) {
  const inbox = await call(request, bearer, "GET", "/api/v1/me/staff-invitations?status=pending");
  expect(inbox.status).toBe(200);
  const item = (
    inbox.body.invitations as { invitation_id: string; gym: { gym_id: string } }[]
  ).find((invitation) => invitation.gym.gym_id === gymId);
  if (!item) throw new Error("the invitation is not in the recipient's inbox");
  const accepted = await call(
    request,
    bearer,
    "POST",
    `/api/v1/me/staff-invitations/${item.invitation_id}/accept`,
  );
  expect(accepted.status).toBe(200);
  return accepted.body as { staff_membership_id: string; role: string; outcome: string };
}

async function inviteInBrowser(page: Page, email: string, role: RegExp) {
  await page.getByRole("button", { name: "Invite" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("radio", { name: role }).check();
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(dialog.getByRole("status")).toContainText("is pending until");
  await dialog.getByRole("button", { name: "Done" }).click();
}

const run = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const tag = run();
const GYM_A = `Staff A ${tag}`;
const GYM_B = `Staff B ${tag}`;
const people = {
  owner: { email: `e2e-sf94-owner-${tag}@example.com`, name: "Yauheni Bykovski" },
  manager: { email: `e2e-sf94-manager-${tag}@example.com`, name: "Agnieszka Lis" },
  coach: { email: `e2e-sf94-coach-${tag}@example.com`, name: "Tomasz Zieliński" },
  ownerB: { email: `e2e-sf94-ownerb-${tag}@example.com`, name: "Marta Nowak" },
  outsider: { email: `e2e-sf94-outsider-${tag}@example.com`, name: "Olga Obca" },
};
const statuses: Record<string, number> = {};

test("A–V: staff administration on the web, acceptance through the backend, isolation and privacy", async ({
  browser,
  request,
}) => {
  test.setTimeout(600_000);

  // A · the owner creates and completes a gym in the web onboarding.
  const owner = await newPage(browser);
  const ownerBearer = sessionOf(owner);
  await register(owner, people.owner.email, "gym", people.owner.name);
  await owner.waitForURL((url) => url.pathname === "/en/app/onboarding/gym");
  await createGymInBrowser(owner, GYM_A);
  await owner.getByRole("button", { name: "Go to gym" }).click();
  const a = gymIdOf(GYM_A);
  await owner.waitForURL(`**/en/app/gyms/${a}`);

  // R (before) · the checklist offers inviting staff and leads to the staff page.
  const item = owner.locator("[data-checklist-key=invite_staff]");
  await expect(item).toHaveAttribute("data-checklist-status", "available");
  await item.getByRole("link", { name: "Invite your staff" }).click();
  await owner.waitForURL(`**/en/app/gyms/${a}/staff`);

  // B · the staff page with only the real owner membership.
  await expect(roster(owner).locator("[data-staff-member]")).toHaveCount(1);
  await expect(roster(owner)).toContainText("Yauheni B.");
  expect(activeCount(a)).toBe(1);
  await expect(owner.locator("[data-staff-invitations]")).toContainText("No invitations yet.");

  // C, D · a Manager invitation from the web UI; the backend keeps exactly one pending.
  await inviteInBrowser(owner, people.manager.email, /Manager/);
  const pending = () =>
    sql(
      `SELECT count(*) || '|' || coalesce(max(send_count), 0) || '|' || coalesce(max(expires_at)::text, '') FROM gym_staff_invitations WHERE gym_id = '${a}' AND status = 'pending'`,
    );
  expect(pending().split("|").slice(0, 2)).toEqual(["1", "1"]);
  await expect(owner.locator("[data-staff-invitation-status=pending]")).toHaveCount(1);
  // The same address and role again: still one row (the backend's 200).
  await inviteInBrowser(owner, people.manager.email, /Manager/);
  expect(pending().split("|")[0]).toBe("1");
  await expect(owner.locator("[data-staff-invitation]")).toHaveCount(1);
  await inviteInBrowser(owner, people.coach.email, /Coach/);
  expect(sql(`SELECT count(*) FROM gym_staff_invitations WHERE gym_id = '${a}'`)).toBe("2");

  // E · resend after the 60 s cooldown (moved back in the disposable database); the expiry is the API's.
  const before = sql(
    `SELECT expires_at FROM gym_staff_invitations WHERE gym_id = '${a}' AND role = 'manager'`,
  );
  sql(
    `UPDATE gym_staff_invitations SET last_sent_at = last_sent_at - interval '2 minutes' WHERE gym_id = '${a}' AND role = 'manager'`,
  );
  // Both addresses mask to "e•••@example.com": the Manager invitation's own row.
  await owner
    .locator("[data-staff-invitation]")
    .filter({ hasText: "Manager" })
    .getByRole("button", { name: /^Resend the invitation to/ })
    .click();
  await expect(owner.getByText(/A new invitation to .* is pending until/)).toBeVisible();
  const after = sql(
    `SELECT expires_at || '|' || send_count FROM gym_staff_invitations WHERE gym_id = '${a}' AND role = 'manager'`,
  );
  expect(after.split("|")[1]).toBe("2");
  expect(new Date(after.split("|")[0] ?? "") > new Date(before)).toBe(true);

  // F · the recipients sign up with the invited addresses and accept through the backend.
  const manager = await newPage(browser);
  const managerBearer = sessionOf(manager);
  await register(manager, people.manager.email, "fighter", people.manager.name);
  await manager.waitForURL((url) => url.pathname !== "/en/app/onboarding/account");
  const managerAccept = await acceptAsRecipient(request, managerBearer(), a);
  expect(managerAccept.outcome).toBe("accepted");
  expect(managerAccept.role).toBe("manager");

  const coach = await newPage(browser);
  const coachBearer = sessionOf(coach);
  await register(coach, people.coach.email, "coach", people.coach.name);
  await coach.waitForURL((url) => url.pathname !== "/en/app/onboarding/account");
  const coachId = userId(people.coach.email);
  // The coach completes a CoachProfile (their own, independent of any gym).
  for (const [method, path, body] of [
    [
      "PATCH",
      "/api/v1/me/coach-profile",
      {
        display_name: "Coach Tomasz",
        brand_name: "Tomasz Boxing",
        country_code: "PL",
        city: "Gdańsk",
        coaching_formats: ["personal_training"],
      },
    ],
    ["POST", "/api/v1/me/coach-profile/complete-onboarding", undefined],
  ] as const) {
    expect((await call(request, coachBearer(), method, path, body)).status).toBe(200);
  }
  const profileBefore = sql(
    `SELECT row_to_json(p)::text FROM coach_profiles p WHERE user_id = '${coachId}'`,
  );
  const relationshipsBefore = sql("SELECT count(*) FROM coach_fighter_relationships");
  expect((await acceptAsRecipient(request, coachBearer(), a)).role).toBe("coach");

  // G · the owner sees both active memberships in the web UI; the database agrees.
  await focus(owner);
  await expect(roster(owner)).toContainText("Agnieszka L.");
  await expect(roster(owner)).toContainText("Tomasz Z.");
  expect(activeCount(a)).toBe(3);
  await expect(owner.locator("[data-staff-invitation-status=accepted]")).toHaveCount(2);

  // R · the checklist completes from the backend (an acceptance, not a sending).
  await go(owner, `/en/app/gyms/${a}`);
  await expect(owner.locator("[data-checklist-key=invite_staff]")).toHaveAttribute(
    "data-checklist-status",
    "completed",
  );

  // H · the owner changes the coach to front desk in the web UI.
  await go(owner, `/en/app/gyms/${a}/staff`);
  await owner.getByRole("button", { name: "Show Tomasz Z." }).click();
  await owner.getByRole("button", { name: "Change role" }).click();
  const change = owner.getByRole("dialog");
  await change.getByRole("radio", { name: /Front desk/ }).check();
  await change.getByRole("button", { name: "Change role" }).click();
  await expect(owner.getByText("Tomasz Z. is now Front desk.")).toBeVisible();
  expect(membership(a, coachId)).toBe("front_desk|active|");

  // I · the manager sees only the permitted actions.
  // Still signed in from registration (the page's own session).
  await go(manager, `/en/app/gyms/${a}/staff`);
  await expect(roster(manager)).toContainText("Yauheni B.");
  await manager.getByRole("button", { name: "Show Yauheni B." }).click();
  await expect(manager.getByRole("button", { name: /Change role|Remove from team/ })).toHaveCount(
    0,
  );
  await manager.getByRole("button", { name: "Invite" }).click();
  await expect(manager.getByRole("dialog").getByRole("radio")).toHaveCount(2);
  await expect(manager.getByRole("dialog").getByRole("radio", { name: /Manager/ })).toHaveCount(0);
  await manager.keyboard.press("Escape");
  await manager.getByRole("button", { name: "Show Tomasz Z." }).click();
  await manager.getByRole("button", { name: "Change role" }).click();
  await expect(manager.getByRole("dialog").getByRole("radio")).toHaveCount(1);
  await manager.keyboard.press("Escape");

  // J · the backend refuses what the manager is not offered.
  const ownerRow = sql(
    `SELECT id FROM gym_staff_memberships WHERE gym_id = '${a}' AND role = 'owner' AND status = 'active'`,
  );
  const coachRow = sql(
    `SELECT id FROM gym_staff_memberships WHERE gym_id = '${a}' AND user_id = '${coachId}' AND status = 'active'`,
  );
  statuses["J manager invites a manager"] = (
    await call(request, managerBearer(), "POST", `/api/v1/gyms/${a}/staff-invitations`, {
      email: `e2e-sf94-x-${tag}@example.com`,
      role: "manager",
    })
  ).status;
  statuses["J manager invites an owner"] = (
    await call(request, managerBearer(), "POST", `/api/v1/gyms/${a}/staff-invitations`, {
      email: `e2e-sf94-y-${tag}@example.com`,
      role: "owner",
    })
  ).status;
  statuses["J manager promotes to manager"] = (
    await call(request, managerBearer(), "PATCH", `/api/v1/gyms/${a}/staff/${coachRow}`, {
      role: "manager",
    })
  ).status;
  statuses["J manager changes the owner"] = (
    await call(request, managerBearer(), "PATCH", `/api/v1/gyms/${a}/staff/${ownerRow}`, {
      role: "coach",
    })
  ).status;
  statuses["J manager removes the owner"] = (
    await call(request, managerBearer(), "DELETE", `/api/v1/gyms/${a}/staff/${ownerRow}`)
  ).status;
  expect(statuses["J manager invites a manager"]).toBe(403);
  expect(statuses["J manager invites an owner"]).toBe(422);
  expect(statuses["J manager promotes to manager"]).toBe(403);
  expect(statuses["J manager changes the owner"]).toBe(409);
  expect(statuses["J manager removes the owner"]).toBe(403);
  expect(
    sql(
      `SELECT count(*) FROM gym_staff_memberships WHERE gym_id = '${a}' AND role = 'owner' AND status = 'active'`,
    ),
  ).toBe("1");

  // M · the same person also joins Gym B (another owner, through the API).
  const ownerB = await newPage(browser);
  const ownerBBearer = sessionOf(ownerB);
  await register(ownerB, people.ownerB.email, "fighter", people.ownerB.name);
  await ownerB.waitForURL((url) => url.pathname !== "/en/app/onboarding/account");
  const b = await createGymThroughApi(request, ownerBBearer(), GYM_B);
  expect(
    (
      await call(request, ownerBBearer(), "POST", `/api/v1/gyms/${b}/staff-invitations`, {
        email: people.coach.email,
        role: "manager",
      })
    ).status,
  ).toBe(201);
  expect((await acceptAsRecipient(request, coachBearer(), b)).role).toBe("manager");
  expect(membership(b, coachId)).toBe("manager|active|");

  // K, N · the owner of Gym A removes them in the web UI; Gym B is untouched.
  await focus(owner);
  await owner.getByRole("button", { name: "Show Tomasz Z." }).click();
  await owner.getByRole("button", { name: "Remove from team" }).click();
  const confirm = owner.getByRole("alertdialog", { name: `Remove Tomasz Z. from ${GYM_A}?` });
  await expect(confirm).toContainText("not affected");
  await confirm.getByRole("button", { name: "Remove from team" }).click();
  await expect(roster(owner)).not.toContainText("Tomasz Z.");
  expect(membership(a, coachId)).toBe("front_desk|ended|removed");
  expect(membership(b, coachId)).toBe("manager|active|");

  // L · removed staff lose Gym A at once (and keep Gym B and their session).
  statuses["L removed reads gym A"] = (
    await call(request, coachBearer(), "GET", `/api/v1/gyms/${a}`)
  ).status;
  statuses["L removed reads A staff"] = (
    await call(request, coachBearer(), "GET", `/api/v1/gyms/${a}/staff`)
  ).status;
  statuses["L removed reads gym B"] = (
    await call(request, coachBearer(), "GET", `/api/v1/gyms/${b}`)
  ).status;
  expect([
    statuses["L removed reads gym A"],
    statuses["L removed reads A staff"],
    statuses["L removed reads gym B"],
  ]).toEqual([404, 404, 200]);
  await go(coach, `/en/app/gyms/${a}/staff`);
  await expect(coach.getByText("This gym isn’t available")).toBeVisible();
  await go(coach, `/en/app/gyms/${b}/staff`);
  await expect(roster(coach)).toContainText("Marta N.");

  // O · another account cannot see Gym A's staff.
  const outsider = await newPage(browser);
  const outsiderBearer = sessionOf(outsider);
  await register(outsider, people.outsider.email, "fighter", people.outsider.name);
  await outsider.waitForURL((url) => url.pathname !== "/en/app/onboarding/account");
  for (const path of [`/api/v1/gyms/${a}/staff`, `/api/v1/gyms/${a}/staff-invitations`]) {
    statuses[`O outsider GET ${path.split("/").pop()}`] = (
      await call(request, outsiderBearer(), "GET", path)
    ).status;
  }
  expect(
    Object.entries(statuses)
      .filter(([k]) => k.startsWith("O "))
      .map(([, v]) => v),
  ).toEqual([404, 404]);

  // P · the coach's affiliations created no Coach–Fighter relationship; the profile is unchanged.
  expect(sql("SELECT count(*) FROM coach_fighter_relationships")).toBe(relationshipsBefore);
  expect(
    sql(`SELECT row_to_json(p)::text FROM coach_profiles p WHERE user_id = '${coachId}'`),
  ).toBe(profileBefore);

  // Q · a private relationship and session elsewhere: no gym role reaches them; its own coach does.
  const seeded = execFileSync(
    "mix",
    ["run", "--no-start", resolve("e2e/real-api/fixtures/staff-private-training-seed.exs"), tag],
    {
      cwd: API_DIR,
      // The API of this run has Coach–Fighter sharing on with the test-only disclosure (README).
      env: {
        ...mixEnv(),
        COACHING_ACCESS_ENABLED: "true",
        COACHING_DISCLOSURES: "fighter-coach-disclosure-test-1=basic_profile",
        COACHING_DATA_RULES_VERSION: "coach-data-rules-test-1",
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  )
    .trim()
    .split("\n")
    .pop()
    ?.split(" ");
  const [relationship, session, outsideCoachEmail] = seeded ?? [];
  if (!relationship || !session || !outsideCoachEmail) throw new Error("no seeded relationship");
  for (const [label, bearer] of [
    ["owner", ownerBearer()],
    ["manager", managerBearer()],
    ["gym coach (now manager at B)", coachBearer()],
  ] as const) {
    statuses[`Q ${label} session`] = (
      await call(request, bearer, "GET", `/api/v1/me/coach/training-sessions/${session}`)
    ).status;
    statuses[`Q ${label} relationship`] = (
      await call(request, bearer, "GET", `/api/v1/me/coach/fighters/${relationship}`)
    ).status;
    expect(statuses[`Q ${label} session`]).toBe(404);
    expect(statuses[`Q ${label} relationship`]).toBe(404);
  }
  const outsideCoach = await newPage(browser);
  const outsideBearer = sessionOf(outsideCoach);
  await signIn(outsideCoach, outsideCoachEmail);
  await outsideCoach.waitForURL((url) => url.pathname !== "/en/login/code");
  statuses["Q the relationship's own coach"] = (
    await call(request, outsideBearer(), "GET", `/api/v1/me/coach/training-sessions/${session}`)
  ).status;
  expect(statuses["Q the relationship's own coach"]).toBe(200);

  // S · a terminal first run stays terminal: B's owner dismissed it; later staff changes never reopen it.
  expect(
    (await call(request, ownerBBearer(), "POST", `/api/v1/gyms/${b}/first-run/dismiss`)).status,
  ).toBe(200);
  const firstRunB = await call(request, ownerBBearer(), "GET", `/api/v1/gyms/${b}/first-run`);
  expect((firstRunB.body.first_run as { status: string }).status).toBe("dismissed");
  const firstRunA = await call(request, ownerBearer(), "GET", `/api/v1/gyms/${a}/first-run`);
  expect((firstRunA.body.first_run as { status: string }).status).toBe("not_started");

  // T · nothing invented: the web roster and invitation list are exactly the database's rows.
  await go(owner, `/en/app/gyms/${a}/staff`);
  await expect(roster(owner).locator("[data-staff-member]")).toHaveCount(activeCount(a));
  await expect(owner.locator("[data-staff-invitation]")).toHaveCount(
    Number(sql(`SELECT count(*) FROM gym_staff_invitations WHERE gym_id = '${a}'`)),
  );
  await expect(owner.locator("main")).not.toContainText(/on shift|last active|payout|revenue/i);

  // Ownership invariant.
  expect(
    sql(
      `SELECT count(*) FROM gyms g WHERE (SELECT count(*) FROM gym_staff_memberships m WHERE m.gym_id = g.id AND m.role = 'owner' AND m.status = 'active') <> 1`,
    ),
  ).toBe("0");

  // The recorded status codes, as evidence of the run (no credential or address).
  writeFileSync(test.info().outputPath("statuses.json"), JSON.stringify(statuses, null, 2));
});
