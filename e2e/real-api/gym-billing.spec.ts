import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { expect, type APIRequestContext, type Browser, type Page, test } from "@playwright/test";

/*
 * SF-102: the gym's SimpleFit plan (WG25) on the production build against
 * the real SF-101/SF-102 API and PostgreSQL (playwright.real-api.config.ts).
 *
 * The API runs on a disposable database (`e2e` in its name) either with
 * Stripe disabled (`E2E_STRIPE=disabled`) or in Stripe test mode with
 * placeholder credentials (`E2E_STRIPE=test`). **No journey reaches Stripe:**
 * the published plan has no Stripe Price mapping, so checkout is refused
 * before any provider call, and the only webhooks sent are signed events of
 * types SimpleFit does not process. Real Stripe-hosted Checkout, Customer
 * Portal and invoice journeys need Stripe test credentials and are not part
 * of this run.
 *
 * Browser: registration, gym creation, the console's Settings item, the
 * settings sections, the plan page's states, choosing a plan, the refusal,
 * withdrawing the request, a restricted manager, sign-out. API (with each
 * person's own session): staff joining, a stranger's and a manager's
 * refusals, webhook deliveries (raw body, signature, replay). Backend checks
 * read the disposable database.
 */

const API_URL = process.env.E2E_REAL_API_URL ?? "";
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";
const STRIPE = process.env.E2E_STRIPE ?? "disabled";
/** The placeholder webhook secret the test-mode API was started with (not a credential). */
const WEBHOOK_SECRET = process.env.E2E_STRIPE_WEBHOOK_SECRET ?? "";

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
  method: "GET" | "PATCH" | "PUT" | "POST",
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
  // Nothing in this run may leave for Stripe.
  const stripe: string[] = [];
  page.on("request", (request) => {
    if (/stripe\.com/.test(new URL(request.url()).hostname)) stripe.push(request.url());
  });
  return { page, stripe };
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

/** A Stripe-format signature over the exact body (as Stripe signs a delivery). */
const sign = (body: string, timestamp: number, secret = WEBHOOK_SECRET) =>
  `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

const run = randomUUID().slice(0, 8);
const OWNER = `sf102-owner-${run}@example.com`;
const MANAGER = `sf102-manager-${run}@example.com`;
const GYM = `Ring Billing ${run}`;
const state: { gymId: string; ownerBearer: string } = { gymId: "", ownerBearer: "" };

test("A–F: the owner reaches the SimpleFit plan, chooses a plan, is refused before any payment, and withdraws", async ({
  browser,
}) => {
  test.skip(test.info().project.name !== "chromium-1440", "one owner journey per run");
  const { page, stripe } = await newPage(browser);
  const bearer = sessionOf(page);

  await register(page, OWNER, "Yauheni Bykovski", "gym");
  await go(page, "/en/app/onboarding/gym");
  await createGymInBrowser(page, GYM);
  state.gymId = sql(`SELECT id FROM gyms WHERE name = '${GYM}'`);
  await go(page, `/en/app/gyms/${state.gymId}`);

  // B: the console's Settings item is live and opens the settings sections.
  await page
    .getByRole("link", { name: "Gym settings & plan" })
    .locator("visible=true")
    .first()
    .click();
  await page.waitForURL((url) => url.pathname === `/en/app/gyms/${state.gymId}/settings`);
  await page
    .getByRole("link", { name: /SimpleFit plan/ })
    .last()
    .click();
  await page.waitForURL((url) => url.pathname === `/en/app/gyms/${state.gymId}/settings/plan`);
  state.ownerBearer = bearer();

  // C: the backend's provider state, no subscription, the published plan.
  const current = page.getByRole("region", { name: "Current plan" });
  await expect(current.getByText("No SimpleFit plan")).toBeVisible();
  if (STRIPE === "disabled") {
    await expect(
      page.getByText("Payments are not available in this environment. Nothing is charged."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /149\.00 monthly/ })).toBeDisabled();
  } else {
    await expect(current.getByText("Test mode")).toBeVisible();
    // D: choosing records the intent; checkout is refused before Stripe (no price mapping).
    await page.getByRole("button", { name: /149\.00 monthly/ }).click();
    await expect(page.getByText("This price can't be paid here yet.")).toBeVisible();
    expect(
      count(
        "gym_saas_subscriptions",
        `gym_id = '${state.gymId}' AND status = 'pending_activation'`,
      ),
    ).toBe(1);
    expect(count("stripe_checkouts", `gym_id = '${state.gymId}'`)).toBe(0);
    expect(count("stripe_customers", `gym_id = '${state.gymId}'`)).toBe(0);

    // E: the pending request, nothing paid, nothing active.
    await page.reload();
    await expect(page.getByText(/checkout not finished yet/)).toBeVisible();
    await expect(current.getByText("Waiting for payment")).toBeVisible();

    // F: withdrawing the request (no Stripe object exists, so nothing is called).
    await page.getByRole("button", { name: "Withdraw request" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Withdraw request" }).click();
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await expect(current.getByText(/previous plan was cancelled/)).toBeVisible();
    expect(sql(`SELECT status FROM gym_saas_subscriptions WHERE gym_id = '${state.gymId}'`)).toBe(
      "cancelled",
    );
  }

  await expect(page.getByText("No invoices yet.")).toBeVisible();
  expect(count("stripe_invoices", `gym_id = '${state.gymId}'`)).toBe(0);
  expect(stripe).toEqual([]);
});

test("G–H: a manager sees the restriction and reads nothing; a stranger gets 404", async ({
  browser,
  request,
}) => {
  test.skip(test.info().project.name !== "chromium-1440", "one owner journey per run");
  expect(state.gymId).not.toBe("");

  const managerBearer = await registerApi(request, MANAGER, "Ola Nowak");
  const invited = await call(
    request,
    state.ownerBearer,
    "POST",
    `/api/v1/gyms/${state.gymId}/staff-invitations`,
    {
      email: MANAGER,
      role: "manager",
    },
  );
  expect(invited.status).toBe(201);
  const invitationId = (invited.body.invitation as { invitation_id: string }).invitation_id;
  expect(
    (
      await call(
        request,
        managerBearer,
        "POST",
        `/api/v1/me/staff-invitations/${invitationId}/accept`,
      )
    ).status,
  ).toBe(200);

  for (const path of ["/billing", "/billing/invoices"]) {
    expect(
      (await call(request, managerBearer, "GET", `/api/v1/gyms/${state.gymId}${path}`)).status,
    ).toBe(403);
  }
  expect(
    (
      await call(
        request,
        managerBearer,
        "POST",
        `/api/v1/gyms/${state.gymId}/billing/portal-session`,
      )
    ).status,
  ).toBe(403);

  const strangerBearer = await registerApi(
    request,
    `sf102-stranger-${run}@example.com`,
    "Piotr Z.",
  );
  expect(
    (await call(request, strangerBearer, "GET", `/api/v1/gyms/${state.gymId}/billing`)).status,
  ).toBe(404);
  expect((await request.get(`${API_URL}/api/v1/gyms/${state.gymId}/billing`)).status()).toBe(401);

  // The manager's browser: the plan page shows the restriction.
  const { page } = await newPage(browser);
  resetRateLimits();
  await go(page, "/en/login");
  await page.getByRole("textbox", { name: "Email" }).fill(MANAGER);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await page.waitForURL((url) => url.pathname === "/en/login/code");
  const billingReads: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/billing")) billingReads.push(r.url());
  });
  await codeInput(page).pressSequentially(emailedCode(MANAGER));
  await page.waitForURL((url) => url.pathname !== "/en/login/code");
  await go(page, `/en/app/gyms/${state.gymId}/settings/plan`);
  await expect(page.getByText("Only the gym's owner manages the SimpleFit plan")).toBeVisible();
  expect(billingReads).toEqual([]);
});

test("I: webhooks over real HTTP verify the raw body and record an event once", async ({
  request,
}) => {
  test.skip(test.info().project.name !== "chromium-1440", "one webhook journey per run");
  const event = {
    id: `evt_e2e${run}`,
    object: "event",
    type: "customer.created",
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: `cus_e2e${run}`, object: "customer" } },
  };
  const body = JSON.stringify(event);
  const deliver = (raw: string, signature?: string) =>
    request.post(`${API_URL}/api/webhooks/stripe`, {
      headers: {
        "content-type": "application/json",
        ...(signature ? { "stripe-signature": signature } : {}),
      },
      data: raw,
    });

  if (STRIPE === "disabled") {
    const refused = await deliver(body, sign(body, Math.floor(Date.now() / 1000), "whsec_unused"));
    expect(refused.status()).toBe(503);
    expect(refused.headers()["retry-after"]).toBe("60");
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const accepted = await deliver(body, sign(body, now));
  expect(accepted.status()).toBe(200);
  expect(await accepted.json()).toEqual({ received: true, duplicate: false });
  const replay = await deliver(body, sign(body, now));
  expect(await replay.json()).toEqual({ received: true, duplicate: true });

  // The same JSON re-serialized, a stale timestamp, another secret, none: 400.
  expect((await deliver(JSON.stringify(event, null, 2), sign(body, now))).status()).toBe(400);
  expect((await deliver(body, sign(body, now - 600))).status()).toBe(400);
  expect((await deliver(body, sign(body, now, "whsec_attackersecret"))).status()).toBe(400);
  expect((await deliver(body)).status()).toBe(400);
  const live = JSON.stringify({ ...event, id: `evt_e2elive${run}`, livemode: true });
  expect((await deliver(live, sign(live, now))).status()).toBe(400);

  expect(count("stripe_webhook_events", `stripe_event_id = 'evt_e2e${run}'`)).toBe(1);
  expect(count("stripe_webhook_events", `stripe_event_id = 'evt_e2elive${run}'`)).toBe(0);
  // Ids and type only: no payload column exists.
  expect(
    sql(
      "SELECT count(*) FROM information_schema.columns WHERE table_name = 'stripe_webhook_events' AND column_name IN ('payload', 'data', 'body')",
    ),
  ).toBe("0");
  await expect
    .poll(
      () =>
        sql(
          `SELECT status || ':' || coalesce(outcome, '') FROM stripe_webhook_events WHERE stripe_event_id = 'evt_e2e${run}'`,
        ),
      { timeout: 20_000 },
    )
    .toBe("ignored:unhandled_type");
});

test("J: existing gym features keep working (no entitlement is enforced)", async ({ request }) => {
  test.skip(test.info().project.name !== "chromium-1440", "one owner journey per run");
  const entitlements = await call(
    request,
    state.ownerBearer,
    "GET",
    `/api/v1/gyms/${state.gymId}/entitlements`,
  );
  expect(entitlements.status).toBe(200);
  expect(
    (entitlements.body.features as { enforced: boolean }[]).every((f) => f.enforced === false),
  ).toBe(true);
  for (const path of ["", "/staff", "/members", "/venues", "/class-templates"]) {
    expect(
      (await call(request, state.ownerBearer, "GET", `/api/v1/gyms/${state.gymId}${path}`)).status,
    ).toBe(200);
  }
});
