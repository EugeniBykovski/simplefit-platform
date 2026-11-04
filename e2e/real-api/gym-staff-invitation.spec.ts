import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, type APIRequestContext, type Browser, type Page, test } from "@playwright/test";

/*
 * SF-133: the staff invitation recipient journey end to end, on the production
 * build against the real API and PostgreSQL (playwright.real-api.config.ts),
 * journeys A–T of the ticket.
 *
 * What is the web UI and what is not, exactly:
 * - every recipient step (open the emailed link, preview, sign up or sign in,
 *   account registration, verify the invited address, accept, decline) and
 *   every owner step (create the gym, invite, cancel, remove) is a browser
 *   action; nothing is accepted through the API or SQL;
 * - the link is the one in the queued E06 email, read through the test adapter
 *   (`mix e2e.staff_invitation_token --link`) and opened as written;
 * - the only writes to the disposable database move time (an expiry) or reset
 *   rate limits;
 * - direct API calls appear only where a refusal is the point (Q, cross-gym,
 *   role escalation), with the recipient's real session;
 * - Google and Apple sign-in cannot run here: they are not covered by this
 *   spec, and only the seeded provider-session variant in
 *   `email-identity-link.spec.ts` exists for them.
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
  secrets.add(code);
  return code;
}

/** The link exactly as the E06 email carries it. */
function emailedLink(address: string): { link: string; token: string } {
  const link = mix(["e2e.staff_invitation_token", "--link", address])
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.includes("/invite/staff#token="));
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
const memberships = (gym: string, user: string) =>
  sql(
    `SELECT role || '|' || status FROM gym_staff_memberships WHERE gym_id = '${gym}' AND user_id = '${user}' ORDER BY inserted_at`,
  );
const invitationStatus = (gym: string, role: string) =>
  sql(
    `SELECT status FROM gym_staff_invitations WHERE gym_id = '${gym}' AND role = '${role}' ORDER BY inserted_at DESC LIMIT 1`,
  );
const activeOf = (gym: string, user: string) =>
  sql(
    `SELECT count(*) FROM gym_staff_memberships WHERE gym_id = '${gym}' AND user_id = '${user}' AND status = 'active'`,
  );

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name });
const state = (page: Page, name: string) => page.locator(`[data-invitation-state="${name}"]`);
const codeInput = (page: Page) => page.locator('[data-slot="code-input"]');

/** Every URL and Referer the browser sent, for the token check. */
type Watch = { traffic: string[]; console: string[] };
const watches: Watch[] = [];

async function newPage(browser: Browser) {
  const context = await browser.newContext({ baseURL: WEB });
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
  return response.status();
}

async function accountForm(page: Page, fullName: string) {
  await page.getByLabel("Full name").fill(fullName);
  await page.getByLabel("Date of birth").fill("1990-05-17");
  await page.getByRole("checkbox", { name: /Terms of Service/ }).click();
  await page.getByRole("checkbox", { name: /Privacy Policy/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
}

async function register(page: Page, email: string, intent: string, fullName: string) {
  resetRateLimits();
  await go(page, `/en/signup/account?intent=${intent}`);
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/en/signup/verify");
  await codeInput(page).pressSequentially(emailedCode(email));
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/account");
  await accountForm(page, fullName);
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
  await page.getByRole("textbox", { name: "City" }).fill("Gdańsk");
  await page.getByRole("textbox", { name: "Address", exact: true }).fill("ul. Morska 5");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Branding")).toBeVisible();
  await page.getByRole("button", { name: "Create gym" }).click();
  await expect(heading(page, `${name} is created.`)).toBeVisible();
}

async function invite(page: Page, email: string, role: RegExp) {
  resetRateLimits();
  await page.getByRole("button", { name: "Invite" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("radio", { name: role }).check();
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(dialog.getByRole("status")).toContainText("is pending until");
  await dialog.getByRole("button", { name: "Done" }).click();
}

/** The console's Sign out: in the sidebar, or the navigation sheet on a phone. */
async function signOutControl(page: Page) {
  if ((page.viewportSize()?.width ?? 1440) >= 768) {
    return page.getByRole("complementary").getByRole("button", { name: "Sign out" });
  }
  await page.getByRole("button", { name: "Open navigation" }).click();
  return page.getByRole("dialog").getByRole("button", { name: "Sign out" });
}
const signOut = async (page: Page) => (await signOutControl(page)).click();

/** No token in the address bar or any storage (the one tab-scoped key aside: see below). */
async function expectCleanLocation(page: Page, token: string) {
  await expect.poll(() => page.url()).not.toContain("#token");
  expect(page.url()).not.toContain(token);
  const stores = await page.evaluate(() => ({
    local: JSON.stringify({ ...window.localStorage }),
    cookie: document.cookie,
  }));
  expect(stores.local).not.toContain(token);
  expect(stores.cookie).not.toContain(token);
}

const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const GYM = `Ring ${tag}`;
const OTHER_GYM = `Other ${tag}`;
const mail = (who: string) => `e2e-sf133-${who}-${tag}@example.com`;

const results: Record<string, unknown> = {};

test("A–T: owner invites, the recipient answers on the web, access follows the backend", async ({
  browser,
  request,
}) => {
  test.setTimeout(600_000);

  // A · the owner creates and completes a gym in the web onboarding.
  const owner = await newPage(browser);
  await register(owner, mail("owner"), "gym", "Yauheni Bykovski");
  await owner.waitForURL((url) => url.pathname === "/en/app/onboarding/gym");
  await createGym(owner, GYM);
  await owner.getByRole("button", { name: "Go to gym" }).click();
  const gym = gymIdOf(GYM);
  await owner.waitForURL(`**/en/app/gyms/${gym}`);
  await go(owner, `/en/app/gyms/${gym}/staff`);

  // B · the owner invites from the staff page.
  const coachEmail = mail("coach");
  await invite(owner, coachEmail, /Coach/);
  expect(invitationStatus(gym, "coach")).toBe("pending");

  // C · the E06 email was queued through the test adapter, with the fragment link.
  const { link, token } = emailedLink(coachEmail);
  expect(new URL(link).origin).toBe(WEB);
  expect(new URL(link).pathname).toBe("/invite/staff");
  expect(new URL(link).search).toBe("");
  expect(new URL(link).hash).toMatch(/^#token=sfs_[A-Za-z0-9_-]{43}$/);

  const usersBefore = sql("SELECT count(*) FROM users");

  // D, E · a stranger's browser opens the actual link: an anonymous preview.
  const coach = await newPage(browser);
  const coachBearer = sessionOf(coach);
  await coach.goto(link);
  await expect(heading(coach, `Join ${GYM} on SimpleFit.`)).toBeVisible();
  await expectCleanLocation(coach, token);
  await expect(coach.getByText("Coach", { exact: true })).toBeVisible();
  await expect(coach.getByText("Yauheni (Owner)")).toBeVisible();
  // Masked or absent: never the invited address, nor anything private.
  await expect(coach.locator("main")).not.toContainText(coachEmail);
  await expect(coach.locator("main")).not.toContainText("Bykovski");
  await expect(coach.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);

  // Opening accepts nothing; nor does reloading the clean URL.
  expect(invitationStatus(gym, "coach")).toBe("pending");
  await coach.reload();
  await expect(heading(coach, `Join ${GYM} on SimpleFit.`)).toBeVisible();
  expect(sql("SELECT count(*) FROM users")).toBe(usersBefore);

  // F, G, H · no account yet: signing up with the invited address proves it;
  // account registration runs; the page returns with the token still in this tab.
  await coach.getByRole("link", { name: "Create account" }).click();
  await coach.waitForURL((url) => url.pathname === "/en/signup/account");
  expect(coach.url()).not.toContain("sfs_");
  await coach.getByRole("textbox", { name: "Email" }).fill(coachEmail);
  resetRateLimits();
  await coach.getByRole("button", { name: "Create account" }).click();
  await coach.waitForURL((url) => url.pathname === "/en/signup/verify");
  await codeInput(coach).pressSequentially(emailedCode(coachEmail));
  await coach.waitForURL((url) => url.pathname === "/en/app/onboarding/account");
  expect(invitationStatus(gym, "coach")).toBe("pending");
  await accountForm(coach, "Natalia Kowalska");
  await coach.waitForURL((url) => url.pathname === "/en/invite/staff");

  // I · the explicit answer, the backend's state only after the click.
  const accept = coach.getByRole("button", { name: "Accept invitation" });
  await expect(accept).toBeVisible();
  await expect(coach.locator("main")).toContainText(coachEmail);
  const coachId = userIdOf(coachEmail);
  expect(memberships(gym, coachId)).toBe("");
  await expectCleanLocation(coach, token);
  await accept.click();

  // J · exactly one active membership, of the invited role.
  await coach.waitForURL(`**/en/app/gyms/${gym}`);
  expect(memberships(gym, coachId)).toBe("coach|active");
  expect(invitationStatus(gym, "coach")).toBe("accepted");
  // No second account was created, no fighter profile, no coaching relationship.
  expect(Number(sql("SELECT count(*) FROM users"))).toBe(Number(usersBefore) + 1);
  expect(sql(`SELECT count(*) FROM identities WHERE user_id = '${coachId}'`)).toBe("1");
  expect(sql(`SELECT count(*) FROM fighter_profiles WHERE user_id = '${coachId}'`)).toBe("0");
  expect(
    sql(
      `SELECT count(*) FROM coach_fighter_relationships r JOIN coach_profiles c ON c.id = r.coach_profile_id WHERE c.user_id = '${coachId}'`,
    ),
  ).toBe("0");
  // The token left the tab with the answer.
  expect(await coach.evaluate(() => JSON.stringify({ ...window.sessionStorage }))).not.toContain(
    token,
  );

  // K, L · the right workspace, with the coach's permissions.
  await go(coach, `/en/app/gyms/${gym}/staff`);
  await expect(coach.getByRole("table", { name: "Active staff" })).toContainText("Natalia K.");
  await expect(coach.getByRole("button", { name: "Invite" })).toHaveCount(0);
  const bearer = coachBearer();
  results["L coach invites staff"] = await call(
    request,
    bearer,
    "POST",
    `/api/v1/gyms/${gym}/staff-invitations`,
    {
      email: mail("escalate"),
      role: "manager",
    },
  );
  expect(results["L coach invites staff"]).toBe(403);
  // Cross-gym isolation: the second gym, of another owner, stays hidden.
  const ownerB = await newPage(browser);
  await register(ownerB, mail("ownerb"), "gym", "Marta Nowak");
  await ownerB.waitForURL((url) => url.pathname === "/en/app/onboarding/gym");
  await createGym(ownerB, OTHER_GYM);
  const otherGym = gymIdOf(OTHER_GYM);
  results["L coach reads another gym"] = await call(
    request,
    bearer,
    "GET",
    `/api/v1/gyms/${otherGym}`,
  );
  expect(results["L coach reads another gym"]).toBe(404);

  // Replay with the same account says so and changes nothing.
  results["R replayed token, same account"] = await call(
    request,
    bearer,
    "POST",
    "/api/v1/me/staff-invitations/accept",
    { token },
  );
  expect(results["R replayed token, same account"]).toBe(200);
  expect(memberships(gym, coachId)).toBe("coach|active");
  await coach.goto(link);
  await expect(state(coach, "already-accepted")).toBeVisible();
  await expect(coach.getByRole("link", { name: "Open the gym" })).toHaveAttribute(
    "href",
    new RegExp(`/app/gyms/${gym}$`),
  );

  // M, N · sign out and in: the access persists and comes from the backend.
  await go(coach, `/en/app/gyms/${gym}`);
  await signOut(coach);
  await coach.waitForURL((url) => !url.pathname.startsWith("/en/app"));
  await go(coach, "/en/login");
  resetRateLimits();
  await coach.getByRole("textbox", { name: "Email" }).fill(coachEmail);
  await coach.getByRole("button", { name: "Email me a sign-in code" }).click();
  await coach.waitForURL((url) => url.pathname === "/en/login/code");
  await codeInput(coach).pressSequentially(emailedCode(coachEmail));
  await coach.waitForURL((url) => url.pathname.startsWith("/en/app"));
  await go(coach, `/en/app/gyms/${gym}`);
  await expect(await signOutControl(coach)).toBeVisible();
  expect(activeOf(gym, coachId)).toBe("1");

  // Anonymous replay of a used link: one state, no oracle.
  const anon = await newPage(browser);
  await anon.goto(link);
  await expect(state(anon, "unavailable")).toBeVisible();
  await expect(anon.locator("main")).not.toContainText(GYM);

  // An existing account whose primary email differs: verify in place, no second
  // user, and another account can't use the link meanwhile (Q).
  const managerPrimary = mail("primary");
  const managerInvited = mail("invited");
  const manager = await newPage(browser);
  const managerBearer = sessionOf(manager);
  await register(manager, managerPrimary, "fighter", "Agnieszka Lis");
  await manager.waitForURL((url) => url.pathname !== "/en/app/onboarding/account");
  const managerId = userIdOf(managerPrimary);

  await go(owner, `/en/app/gyms/${gym}/staff`);
  await invite(owner, managerInvited, /Manager/);
  const invited = emailedLink(managerInvited);

  await manager.goto(invited.link);
  await expect(state(manager, "wrong-account")).toBeVisible();
  await expect(manager.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
  await expectCleanLocation(manager, invited.token);
  await expect(manager.locator("main")).not.toContainText(managerInvited);
  results["Q wrong account accepts by token"] = await call(
    request,
    managerBearer(),
    "POST",
    "/api/v1/me/staff-invitations/accept",
    { token: invited.token },
  );
  expect(results["Q wrong account accepts by token"]).toBe(403);
  expect(activeOf(gym, managerId)).toBe("0");

  const usersBeforeLink = sql("SELECT count(*) FROM users");
  await manager.getByRole("button", { name: "Verify the invited email" }).click();
  resetRateLimits();
  await manager.getByRole("textbox", { name: "Email address" }).fill(managerInvited);
  await manager.getByRole("button", { name: "Send code" }).click();
  const field = manager.getByRole("textbox", { name: "6-digit code" });
  await field.waitFor();
  // Unverified: a sent code links nothing and grants nothing.
  expect(userIdOf(managerInvited)).toBe("");
  results["Q before verification"] = await call(
    request,
    managerBearer(),
    "POST",
    "/api/v1/me/staff-invitations/accept",
    { token: invited.token },
  );
  expect(results["Q before verification"]).toBe(403);
  await field.fill(emailedCode(managerInvited));
  await expect(manager.getByRole("heading", { name: "Email verified" })).toBeVisible();
  await expect(manager.locator("main")).toContainText("Next, review the invitation.");
  // Verified onto the same user: nothing accepted by verifying, no new account.
  expect(userIdOf(managerInvited)).toBe(managerId);
  expect(sql("SELECT count(*) FROM users")).toBe(usersBeforeLink);
  expect(activeOf(gym, managerId)).toBe("0");
  await manager.getByRole("button", { name: "Back to the invitation" }).click();
  await manager.getByRole("button", { name: "Accept invitation" }).click();
  await manager.waitForURL(`**/en/app/gyms/${gym}`);
  expect(memberships(gym, managerId)).toBe("manager|active");
  // The manager's own permissions: invites, but only below their role.
  await go(manager, `/en/app/gyms/${gym}/staff`);
  await manager.getByRole("button", { name: "Invite" }).click();
  await expect(manager.getByRole("dialog").getByRole("radio", { name: /Manager/ })).toHaveCount(0);
  await manager.keyboard.press("Escape");

  // Signed-out recipient with an existing account: signs in, comes back, declines.
  const declineEmail = mail("decline");
  const declining = await newPage(browser);
  await register(declining, declineEmail, "fighter", "Olga Obca");
  await declining.waitForURL((url) => url.pathname !== "/en/app/onboarding/account");
  await go(declining, "/en/app");
  const decliningContext = declining.context();
  await decliningContext.clearCookies();
  await go(owner, `/en/app/gyms/${gym}/staff`);
  await invite(owner, declineEmail, /Front desk/);
  const declineLink = emailedLink(declineEmail);
  const declineTab = await decliningContext.newPage();
  await declineTab.goto(declineLink.link);
  await expect(heading(declineTab, `Join ${GYM} on SimpleFit.`)).toBeVisible();
  resetRateLimits();
  await declineTab.getByRole("link", { name: "Sign in" }).click();
  await declineTab.waitForURL((url) => url.pathname === "/en/login");
  expect(declineTab.url()).not.toContain("sfs_");
  await declineTab.getByRole("textbox", { name: "Email" }).fill(declineEmail);
  await declineTab.getByRole("button", { name: "Email me a sign-in code" }).click();
  await declineTab.waitForURL((url) => url.pathname === "/en/login/code");
  await codeInput(declineTab).pressSequentially(emailedCode(declineEmail));
  await declineTab.waitForURL((url) => url.pathname === "/en/invite/staff");
  await declineTab.getByRole("button", { name: "Decline" }).click();
  // One press only asks.
  await expect(declineTab.getByRole("button", { name: "Keep the invitation" })).toBeVisible();
  expect(invitationStatus(gym, "front_desk")).toBe("pending");
  await declineTab.getByRole("button", { name: "Decline" }).click();
  await expect(state(declineTab, "declined")).toBeVisible();
  expect(invitationStatus(gym, "front_desk")).toBe("declined");
  expect(activeOf(gym, userIdOf(declineEmail))).toBe("0");
  // Replaying a declined link with the same account shows the truth, grants nothing.
  await declineTab.goto(declineLink.link);
  await expect(state(declineTab, "declined")).toBeVisible();
  await expect(declineTab.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);

  // R · a withdrawn invitation: the owner cancels from the UI; the recipient sees it.
  const withdrawnEmail = mail("withdrawn");
  const withdrawn = await newPage(browser);
  await register(withdrawn, withdrawnEmail, "fighter", "Piotr Lis");
  await withdrawn.waitForURL((url) => url.pathname !== "/en/app/onboarding/account");
  await go(owner, `/en/app/gyms/${gym}/staff`);
  await invite(owner, withdrawnEmail, /Coach/);
  const withdrawnLink = emailedLink(withdrawnEmail);
  await withdrawn.goto(withdrawnLink.link);
  await expect(withdrawn.getByRole("button", { name: "Accept invitation" })).toBeVisible();
  const row = owner.locator("[data-staff-invitation-status=pending]");
  await row.getByRole("button", { name: /^Cancel the invitation to/ }).click();
  await owner
    .getByRole("alertdialog")
    .getByRole("button", { name: /Cancel invitation/ })
    .click();
  await expect(row).toHaveCount(0);
  // The open page's next answer finds out: no access, and the truth after a refusal.
  await withdrawn.getByRole("button", { name: "Accept invitation" }).click();
  await expect(state(withdrawn, "cancelled")).toBeVisible();
  expect(activeOf(gym, userIdOf(withdrawnEmail))).toBe("0");
  // Anonymous: the same single state as any other unusable link.
  const anonWithdrawn = await newPage(browser);
  await anonWithdrawn.goto(withdrawnLink.link);
  await expect(state(anonWithdrawn, "unavailable")).toBeVisible();
  await expect(anonWithdrawn.locator("main")).not.toContainText(GYM);

  // R · an expired invitation (time moved in the disposable database).
  const expiredEmail = mail("expired");
  const expired = await newPage(browser);
  await register(expired, expiredEmail, "fighter", "Ewa Lis");
  await expired.waitForURL((url) => url.pathname !== "/en/app/onboarding/account");
  await invite(owner, expiredEmail, /Coach/);
  const expiredLink = emailedLink(expiredEmail);
  sql(
    `UPDATE gym_staff_invitations SET expires_at = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE gym_id = '${gym}' AND status = 'pending'`,
  );
  await expired.goto(expiredLink.link);
  await expect(state(expired, "expired")).toBeVisible();
  await expect(expired.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
  expect(activeOf(gym, userIdOf(expiredEmail))).toBe("0");

  // R · a made-up token gives the same answer as any other.
  const forged = await newPage(browser);
  await forged.goto(`/invite/staff#token=sfs_${"x".repeat(43)}`);
  await expect(state(forged, "unavailable")).toBeVisible();

  // Account switch: "Use another account" ends the session and drops the token, so
  // the next person in this browser inherits nothing and needs the emailed link.
  const switchWrong = mail("switchwrong");
  const switchRight = mail("switchright");
  const shared = await newPage(browser);
  await register(shared, switchWrong, "fighter", "Jan Lis");
  await shared.waitForURL((url) => url.pathname !== "/en/app/onboarding/account");
  const wrongId = userIdOf(switchWrong);
  await go(owner, `/en/app/gyms/${gym}/staff`);
  await invite(owner, switchRight, /Coach/);
  const switchLink = emailedLink(switchRight);
  await shared.goto(switchLink.link);
  await expect(state(shared, "wrong-account")).toBeVisible();
  const signedOut = shared.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/logout") && response.ok(),
  );
  await shared.getByRole("button", { name: "Use another account" }).click();
  await signedOut;
  await expect(state(shared, "wrong-account")).toHaveCount(0);
  await expect
    .poll(() => shared.evaluate(() => JSON.stringify({ ...window.sessionStorage })))
    .not.toContain(switchLink.token);
  await shared.reload();
  await expect(state(shared, "missing")).toBeVisible();
  await shared.goto(switchLink.link);
  await expect(heading(shared, `Join ${GYM} on SimpleFit.`)).toBeVisible();
  await shared.getByRole("link", { name: "Create account" }).click();
  await shared.waitForURL((url) => url.pathname === "/en/signup/account");
  resetRateLimits();
  await shared.getByRole("textbox", { name: "Email" }).fill(switchRight);
  await shared.getByRole("button", { name: "Create account" }).click();
  await shared.waitForURL((url) => url.pathname === "/en/signup/verify");
  await codeInput(shared).pressSequentially(emailedCode(switchRight));
  await shared.waitForURL((url) => url.pathname === "/en/app/onboarding/account");
  await accountForm(shared, "Iga Lis");
  await shared.waitForURL((url) => url.pathname === "/en/invite/staff");
  await shared.getByRole("button", { name: "Accept invitation" }).click();
  await shared.waitForURL(`**/en/app/gyms/${gym}`);
  expect(activeOf(gym, userIdOf(switchRight))).toBe("1");
  expect(activeOf(gym, wrongId)).toBe("0");

  // Logout during the flow: another tab signs out while this page offers the answer.
  // The answer can't land; once back in, the entry lists both gyms from the backend.
  const ownerBEmail = mail("ownerb");
  await invite(owner, ownerBEmail, /Coach/);
  const ownerBLink = emailedLink(ownerBEmail);
  const ownerBId = userIdOf(ownerBEmail);
  const flowTab = await ownerB.context().newPage();
  await flowTab.goto(ownerBLink.link);
  const flowAccept = flowTab.getByRole("button", { name: "Accept invitation" });
  await expect(flowAccept).toBeVisible();
  await go(ownerB, `/en/app/gyms/${otherGym}`);
  await signOut(ownerB);
  await ownerB.waitForURL((url) => !url.pathname.startsWith("/en/app"));
  // Whether the tab already noticed or finds out on the press, nothing is accepted.
  if (await flowAccept.isVisible())
    await flowAccept.click({ timeout: 2_000 }).catch(() => undefined);
  await expect(flowTab.locator('[data-invitation-state="pending"]')).toHaveCount(0);
  expect(activeOf(gym, ownerBId)).toBe("0");
  expect(invitationStatus(gym, "coach")).toBe("pending");
  await flowTab.goto(ownerBLink.link);
  await expect(heading(flowTab, `Join ${GYM} on SimpleFit.`)).toBeVisible();
  resetRateLimits();
  await flowTab.getByRole("link", { name: "Sign in" }).click();
  await flowTab.waitForURL((url) => url.pathname === "/en/login");
  await flowTab.getByRole("textbox", { name: "Email" }).fill(ownerBEmail);
  await flowTab.getByRole("button", { name: "Email me a sign-in code" }).click();
  await flowTab.waitForURL((url) => url.pathname === "/en/login/code");
  await codeInput(flowTab).pressSequentially(emailedCode(ownerBEmail));
  await flowTab.waitForURL((url) => url.pathname === "/en/invite/staff");
  const flowBearer = sessionOf(flowTab);
  await flowTab.getByRole("button", { name: "Accept invitation" }).click();
  await flowTab.waitForURL(`**/en/app/gyms/${gym}`);
  expect(memberships(gym, ownerBId)).toBe("coach|active");
  await expect.poll(flowBearer).not.toBe("");
  const entry = await request.fetch(`${API_URL}/api/v1/me/entry`, {
    headers: { authorization: flowBearer() },
  });
  const workspaces = (
    (await entry.json()) as { entry: { gym_workspaces: { gym_id: string; role: string }[] } }
  ).entry.gym_workspaces;
  results["entry workspaces after a second gym"] = workspaces.map((row) => row.role).sort();
  expect(workspaces.find((row) => row.gym_id === gym)?.role).toBe("coach");
  expect(workspaces.find((row) => row.gym_id === otherGym)?.role).toBe("owner");

  // O, P · the owner removes the coach from the UI; access ends at once.
  await go(owner, `/en/app/gyms/${gym}/staff`);
  await owner.getByRole("button", { name: "Show Natalia K." }).click();
  await owner.getByRole("button", { name: "Remove from team" }).click();
  await owner
    .getByRole("alertdialog", { name: `Remove Natalia K. from ${GYM}?` })
    .getByRole("button", { name: "Remove from team" })
    .click();
  await expect(owner.getByRole("table", { name: "Active staff" })).not.toContainText("Natalia K.");
  expect(activeOf(gym, coachId)).toBe("0");
  // The bearer issued before the removal is refused immediately.
  results["P removed coach reads the gym"] = await call(
    request,
    coachBearer(),
    "GET",
    `/api/v1/gyms/${gym}`,
  );
  expect(results["P removed coach reads the gym"]).toBe(404);
  await go(coach, `/en/app/gyms/${gym}`);
  // With no other workspace, the entry resolver leaves nothing of this gym to open.
  await coach.waitForURL((url) => !url.pathname.includes(`/app/gyms/${gym}`));
  await expect(heading(coach, "What would you like to set up first?")).toBeVisible();
  await expect(coach.getByText(GYM)).toHaveCount(0);

  // The link cannot restore access: it says access ended, and offers no gym.
  await coach.goto(link);
  await expect(state(coach, "access-ended")).toBeVisible();
  await expect(coach.getByRole("link", { name: "Open the gym" })).toHaveCount(0);
  expect(activeOf(gym, coachId)).toBe("0");

  // S · no token or code in the browser's traffic, its console or the API log.
  const seen = watches.flatMap((watch) => [...watch.traffic, ...watch.console]).join("\n");
  for (const secret of secrets) {
    if (secret.startsWith("sfs_")) expect(seen.includes(secret)).toBe(false);
  }
  if (API_LOG) {
    const log = readFileSync(API_LOG, "utf8");
    results["S API log bytes checked"] = log.length;
    for (const secret of secrets) expect(log.includes(secret)).toBe(false);
    expect(/sfs_[A-Za-z0-9_-]{43}/.test(log)).toBe(false);
  }

  results["completed"] = true;
  if (EVIDENCE)
    writeFileSync(
      resolve(EVIDENCE, `journey-${test.info().project.name}.json`),
      `${JSON.stringify(results, null, 2)}\n`,
    );
});
