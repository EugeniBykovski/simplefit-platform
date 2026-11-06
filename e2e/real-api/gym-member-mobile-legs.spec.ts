import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, type APIRequestContext, type Browser, type Page, test } from "@playwright/test";

/*
 * SF-135: the web legs of the native member journeys. The native steps run on an
 * iOS simulator; each leg here is one thing another person or device does through
 * the web UI between them, on the production build against the same real API:
 *
 *   E2E_LEG=setup     owners register and create gyms; classes are API fixtures
 *   E2E_LEG=approve   the owner approves a request in the Members console
 *   E2E_LEG=auto      the owner switches auto-approval (E2E_ON)
 *   E2E_LEG=rotate    the owner issues a new join code
 *   E2E_LEG=invite    the owner invites E2E_EMAIL
 *   E2E_LEG=withdraw  the owner cancels the pending invitation
 *   E2E_LEG=book      the member (E2E_EMAIL) books a class on the web
 *   E2E_LEG=bookings  the member's web My bookings shows E2E_EXPECT, or nothing
 *   E2E_LEG=gyms      the member's web My gyms shows a gym's status (E2E_STATUS)
 *   E2E_LEG=join      the member (E2E_EMAIL, a new account) joins a gym by code on the web
 *   E2E_LEG=checkin   the owner checks a member (E2E_NAME) in from the class roster
 *
 * State between legs is a file (E2E_STATE); it holds join codes, so it stays in
 * the test's scratch directory. Skipped without E2E_LEG: it runs only from the
 * native runner.
 */

const LEG = process.env.E2E_LEG ?? "";
const API_URL = process.env.E2E_REAL_API_URL ?? "";
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";
const STATE = process.env.E2E_STATE ?? "";

test.skip(!LEG || !API_URL, "runs only as a leg of the native journeys");
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
const resetRateLimits = () => sql("DELETE FROM auth_rate_limits; DELETE FROM rate_limit_events");

function emailedCode(address: string): string {
  const code = execFileSync("mix", ["e2e.email_code", address], {
    cwd: API_DIR,
    env: { ...process.env, MIX_ENV: "dev", DATABASE_URL: disposableDatabase() },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^\d{6}$/.test(line));
  if (!code) throw new Error("no code was emailed");
  return code;
}

type State = {
  ownerA: string;
  ownerB: string;
  a: string;
  b: string;
  gymA: string;
  gymB: string;
  codeA: string;
  codeB: string;
  classA: string;
  classB: string;
};
const load = () => JSON.parse(readFileSync(STATE, "utf8")) as State;
const save = (state: State) => writeFileSync(STATE, JSON.stringify(state));

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name });
const codeInput = (page: Page) => page.locator('[data-slot="code-input"]');
const tab = (page: Page, name: string | RegExp) => page.getByRole("tab", { name }).click();

async function newPage(browser: Browser) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    timezoneId: "Europe/Warsaw",
  });
  const page = await context.newPage();
  await page.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());
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

async function post(request: APIRequestContext, bearer: string, path: string, data: unknown) {
  const response = await request.post(`${API_URL}${path}`, {
    headers: { authorization: bearer },
    data,
  });
  expect(response.status(), path).toBe(201);
  return (await response.json()) as Record<string, Record<string, string>>;
}

async function register(page: Page, email: string, name: string) {
  resetRateLimits();
  await page.goto("/en/signup/account?intent=gym");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/en/signup/verify");
  await codeInput(page).pressSequentially(emailedCode(email));
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/account");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Date of birth").fill("1990-05-17");
  await page.getByRole("checkbox", { name: /Terms of Service/ }).click();
  await page.getByRole("checkbox", { name: /Privacy Policy/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/gym");
}

async function signIn(page: Page, email: string) {
  resetRateLimits();
  await page.goto("/en/login");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await page.waitForURL((url) => url.pathname === "/en/login/code");
  await codeInput(page).pressSequentially(emailedCode(email));
  await page.waitForURL((url) => url.pathname !== "/en/login/code");
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

/** Fixture: one real class, with the owner's session. */
async function scheduleClass(
  request: APIRequestContext,
  bearer: string,
  gym: string,
  title: string,
) {
  const venue = await post(request, bearer, `/api/v1/gyms/${gym}/venues`, {
    client_request_id: randomUUID(),
    gym_location_id: sql(`SELECT id FROM gym_locations WHERE gym_id = '${gym}' LIMIT 1`),
    name: `Ring ${title}`,
    capacity: 40,
    time_zone: "Europe/Warsaw",
  });
  const template = await post(request, bearer, `/api/v1/gyms/${gym}/class-templates`, {
    client_request_id: randomUUID(),
    title,
    default_duration_minutes: 30,
    default_capacity: 8,
    default_venue_id: venue.venue?.venue_id,
  });
  const at = new Date(Date.now() + 2 * 3_600_000);
  await post(request, bearer, `/api/v1/gyms/${gym}/class-occurrences`, {
    client_request_id: randomUUID(),
    template_id: template.template?.template_id,
    starts_at: new Date(at.getTime() - (at.getTime() % 300_000)).toISOString(),
    capacity: 8,
  });
}

async function turnOnCode(page: Page, gym: string) {
  await page.goto(`/en/app/gyms/${gym}/members`);
  await tab(page, "Join code & approval");
  await page.getByRole("button", { name: "Turn on joining by code" }).click();
  const code = (await page.locator("[data-join-code]").textContent())?.trim() ?? "";
  expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  return code;
}

async function asOwner(browser: Browser, gym: "a" | "b" = "a") {
  const state = load();
  const page = await newPage(browser);
  await signIn(page, gym === "a" ? state.ownerA : state.ownerB);
  await page.goto(`/en/app/gyms/${gym === "a" ? state.a : state.b}/members`);
  return { page, state };
}

test("the leg", async ({ browser, request }) => {
  test.setTimeout(240_000);
  const email = process.env.E2E_EMAIL ?? "";
  const gym = process.env.E2E_GYM === "b" ? "b" : "a";

  if (LEG === "setup") {
    const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const state = {
      ownerA: `e2e-sf135-ownera-${tag}@example.com`,
      ownerB: `e2e-sf135-ownerb-${tag}@example.com`,
      gymA: `Harbour ${tag}`,
      gymB: `Riverside ${tag}`,
      classA: `Technical ${tag}`,
      classB: `Sparring ${tag}`,
    } as State;
    for (const [address, name, gymName, title, key, codeKey] of [
      [state.ownerA, "Yauheni Bykovski", state.gymA, state.classA, "a", "codeA"],
      [state.ownerB, "Marta Nowak", state.gymB, state.classB, "b", "codeB"],
    ] as const) {
      const page = await newPage(browser);
      const bearer = sessionOf(page);
      await register(page, address, name);
      await createGym(page, gymName);
      const id = sql(`SELECT id FROM gyms WHERE name = '${gymName}'`);
      state[key] = id;
      await expect.poll(bearer).not.toBe("");
      await scheduleClass(request, bearer(), id, title);
      state[codeKey] = await turnOnCode(page, id);
    }
    save(state);
  } else if (LEG === "approve") {
    const { page } = await asOwner(browser, gym);
    await tab(page, /^Join requests/);
    await page
      .locator("[data-members-requests]")
      .getByRole("button", { name: `Approve ${process.env.E2E_NAME}` })
      .click();
    await expect(
      page.locator("[data-members-requests]").getByRole("button", {
        name: `Approve ${process.env.E2E_NAME}`,
      }),
    ).toHaveCount(0);
  } else if (LEG === "auto") {
    const { page } = await asOwner(browser, gym);
    await tab(page, "Join code & approval");
    const on = process.env.E2E_ON === "1";
    await page.getByRole("switch").click();
    if (on) await page.getByRole("alertdialog").getByRole("button", { name: "Turn on" }).click();
    await expect(page.getByRole("switch")).toBeChecked({ checked: on });
  } else if (LEG === "rotate") {
    const { page, state } = await asOwner(browser, gym);
    await tab(page, "Join code & approval");
    const before = gym === "a" ? state.codeA : state.codeB;
    await page.getByRole("button", { name: "New code" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Issue new code" }).click();
    await expect(page.locator("[data-join-code]")).not.toHaveText(before);
    const code = (await page.locator("[data-join-code]").textContent())?.trim() ?? "";
    save({ ...state, ...(gym === "a" ? { codeA: code } : { codeB: code }) });
  } else if (LEG === "invite") {
    const { page } = await asOwner(browser, gym);
    resetRateLimits();
    await page.getByRole("button", { name: "Invite member" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email address").fill(email);
    await dialog.getByRole("button", { name: "Create invitation" }).click();
    await expect(dialog.getByText("Invitation pending")).toBeVisible();
  } else if (LEG === "withdraw") {
    const { page } = await asOwner(browser, gym);
    await tab(page, /^Invitations/);
    const pending = page.locator("[data-member-invitation-status=pending]");
    await expect(pending.first()).toBeVisible();
    const before = await pending.count();
    await pending
      .getByRole("button", { name: /^Cancel the invitation for/ })
      .first()
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /Cancel invitation/ })
      .click();
    await expect(pending).toHaveCount(before - 1);
  } else if (LEG === "book") {
    const state = load();
    const page = await newPage(browser);
    await signIn(page, email);
    await page.goto(`/en/app/me/gyms/${gym === "a" ? state.a : state.b}/classes`);
    const title = gym === "a" ? state.classA : state.classB;
    await expect(heading(page, "Book a class")).toBeVisible();
    const row = page.locator("[data-member-class]").filter({ hasText: title }).first();
    const days = page.locator("[data-member-day]");
    await expect(days.first()).toBeVisible();
    for (let day = 0; day < (await days.count()) && !(await row.isVisible()); day += 1) {
      await days.nth(day).click();
      await page.waitForTimeout(200);
    }
    await row.click();
    await page
      .locator("[data-member-class-details]")
      .getByRole("button", { name: "Confirm booking" })
      .click();
    await expect(page.locator("[data-booking-confirmed]")).toContainText("Booking confirmed");
  } else if (LEG === "bookings") {
    const state = load();
    const page = await newPage(browser);
    await signIn(page, email);
    await page.goto("/en/app/me/bookings");
    await expect(heading(page, /bookings/i)).toBeVisible();
    const upcoming = page.locator("[data-member-bookings=upcoming]");
    if (process.env.E2E_EXPECT === "booked") await expect(upcoming).toContainText(state.classA);
    else await expect(upcoming.getByText(state.classA)).toHaveCount(0);
  } else if (LEG === "gyms") {
    const state = load();
    const page = await newPage(browser);
    await signIn(page, email);
    await page.goto("/en/app/me/gyms");
    await expect(
      page.locator(`[data-member-gym="${gym === "a" ? state.a : state.b}"]`).first(),
    ).toHaveAttribute("data-membership-status", process.env.E2E_STATUS ?? "active");
  } else if (LEG === "join") {
    const state = load();
    const page = await newPage(browser);
    await signIn(page, email);
    await page.goto("/en/app/me/gyms/join");
    await page.getByLabel("Gym code").fill(gym === "a" ? state.codeA : state.codeB);
    await page.getByRole("button", { name: "Find gym" }).click();
    await page.getByRole("button", { name: "Send join request" }).click();
    await expect(page.locator('[data-join-state="requested"]')).toBeVisible();
  } else if (LEG === "checkin") {
    const { page, state } = await asOwner(browser, gym);
    await page.goto(`/en/app/gyms/${gym === "a" ? state.a : state.b}/timetable`);
    await page.getByRole("button", { name: "List", exact: true }).click();
    const title = gym === "a" ? state.classA : state.classB;
    await page
      .locator("[data-list-view] [data-local-start]")
      .filter({ hasText: title })
      .first()
      .click();
    await page.locator("[data-occurrence-details]").getByRole("button", { name: "Roster" }).click();
    const roster = page.getByRole("dialog", { name: title });
    await roster.getByRole("button", { name: `Check in ${process.env.E2E_NAME}` }).click();
    await expect(roster.locator("[data-check-in-done]")).toBeVisible();
  } else {
    throw new Error(`unknown leg ${LEG}`);
  }
});
