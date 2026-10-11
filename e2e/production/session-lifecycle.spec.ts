import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/*
 * The browser session lifecycle on the production build (SF-28): sign-out,
 * Back after sign-out, sign-out in another tab, a session that expires while
 * the page is open, and a sign-out that cannot reach the API. The API is a
 * deterministic double at the network edge holding one session: refresh works
 * while it is alive, logout revokes it, and every call is recorded. The real
 * Phoenix behaviour behind it is asserted in simplefit-api
 * (session_lifecycle_test.exs).
 */

test.use({ viewport: { width: 1440, height: 900 } });

const USER = { id: "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5", created_at: "2026-10-06T12:00:00Z" };
const unauthorized = {
  error: { code: "unauthorized", message: "", details: {}, request_id: null },
};

type Recorded = { path: string; authorization: string | null; csrf: string | null };

/** One session on the fake API, shared by every page of the browser context. */
async function fakeSessionApi(
  context: BrowserContext,
  options: { entry?: "ok" | "expired"; refreshes?: number } = {},
) {
  const state = { alive: true, logoutReachable: true, refreshUnavailable: false };
  const calls: Recorded[] = [];
  let issued = 0;

  await context.route(
    (url) => url.pathname.startsWith("/api/") && url.port !== "3100",
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      calls.push({
        path,
        authorization: request.headers()["authorization"] ?? null,
        csrf: request.headers()["x-simplefit-csrf"] ?? null,
      });
      switch (path) {
        case "/api/auth/session/refresh":
          if (state.refreshUnavailable) {
            return route.fulfill({
              status: 503,
              json: { error: { code: "service_unavailable", message: "", details: {} } },
            });
          }
          if (!state.alive || (options.refreshes !== undefined && issued >= options.refreshes)) {
            return route.fulfill({ status: 401, json: unauthorized });
          }
          issued += 1;
          return route.fulfill({
            json: {
              access_token: `sfa_${issued}`,
              access_token_expires_at: "2099-01-01T00:00:00Z",
              refresh_token_expires_at: "2099-01-01T00:00:00Z",
              refresh_token_transport: "cookie",
              token_type: "Bearer",
            },
          });
        case "/api/auth/logout":
          if (!state.logoutReachable) return route.abort("internetdisconnected");
          state.alive = false;
          return route.fulfill({ status: 204 });
        case "/api/me":
          return state.alive
            ? route.fulfill({ json: { user: USER } })
            : route.fulfill({ status: 401, json: unauthorized });
        case "/api/v1/me/entry":
          // The protected call the Fighter pages make: rejected once the session expired.
          if (!state.alive || options.entry === "expired") {
            return route.fulfill({ status: 401, json: unauthorized });
          }
          return route.fulfill({
            json: {
              entry: {
                destination: "fighter_home",
                reason: "fighter_completed",
                mandatory: false,
                intent: null,
                account_registration: "complete",
                fighter_profile: "completed",
                capabilities: ["FIGHTER"],
              },
            },
          });
        default:
          return route.fulfill({ status: 401, json: unauthorized });
      }
    },
  );

  return {
    state,
    calls,
    count: (path: string) => calls.filter((call) => call.path === path).length,
  };
}

const signedInPage = async (page: Page, path = "/en/app/messages") => {
  await page.goto(path);
  await expect(page.getByRole("button", { name: "Sign out" }).first()).toBeVisible();
};

test("sign out: the session is revoked, sign-in carries nothing back, Back shows nothing", async ({
  page,
  context,
}) => {
  const api = await fakeSessionApi(context);
  await page.goto("/en/pricing");
  await signedInPage(page);

  await page.getByRole("button", { name: "Sign out" }).first().click();

  // A deliberate sign-out goes to plain /login (no returnTo of the previous page).
  await page.waitForURL(/\/en\/login$/);
  await expect(
    page.getByRole("status").filter({ hasText: "signed out on this browser" }),
  ).toBeVisible();
  const logout = api.calls.find((call) => call.path === "/api/auth/logout");
  expect(logout?.authorization).toMatch(/^Bearer sfa_\d+$/);
  expect(logout?.csrf).toBe("1");

  // Back: the protected page's history entry was replaced by sign-in, so the
  // browser returns to the page before it; nothing authenticated renders and
  // no refresh tries to bring the terminated session back.
  await page.goBack();
  await page.waitForURL(/\/en\/pricing$/);
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  // And straight to the protected URL: sign-in again, never the old session.
  await page.goto("/en/app/messages");
  await page.waitForURL(/\/en\/login/);
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  expect(api.state.alive).toBe(false);
});

test("signing out in one tab signs every tab out", async ({ context }) => {
  await fakeSessionApi(context);
  const first = await context.newPage();
  const second = await context.newPage();
  await signedInPage(first);
  await signedInPage(second);

  await first.getByRole("button", { name: "Sign out" }).first().click();

  await second.waitForURL(/\/en\/login$/);
  await expect(second.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  await expect(
    second.getByRole("status").filter({ hasText: "signed out on this browser" }),
  ).toBeVisible();
});

test("a session rejected while the page is open ends with a notice and a safe returnTo", async ({
  page,
  context,
}) => {
  // The restore works once; then the Fighter home's entry call is rejected and
  // so is the one refresh after it: the API no longer accepts the session.
  await fakeSessionApi(context, { entry: "expired", refreshes: 1 });

  await page.goto("/en/app/home");

  await page.waitForURL(/\/en\/login\?returnTo=%2Fapp%2Fhome/);
  await expect(page.getByRole("status").filter({ hasText: "Your session ended" })).toBeVisible();
});

test("an offline sign-out stays signed out: the next load retries the logout, never refreshes", async ({
  page,
  context,
}) => {
  const api = await fakeSessionApi(context);
  await signedInPage(page);
  api.state.logoutReachable = false;

  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.waitForURL(/\/en\/login$/);

  // The server session is still alive (the logout never arrived)...
  expect(api.state.alive).toBe(true);
  const refreshes = api.count("/api/auth/session/refresh");

  // ...yet a reload of a protected page does not revive it: it retries the logout.
  api.state.logoutReachable = true;
  await page.goto("/en/app/messages");
  await page.waitForURL(/\/en\/login/);
  expect(api.count("/api/auth/session/refresh")).toBe(refreshes);
  expect(api.state.alive).toBe(false);

  // Later loads restore normally again (here: no session, so a plain sign-in page).
  await page.goto("/en/app/messages");
  await page.waitForURL(/\/en\/login/);
  expect(api.count("/api/auth/session/refresh")).toBe(refreshes + 1);
});

test("a server failure during restore is not a sign-out", async ({ page, context }) => {
  const api = await fakeSessionApi(context);
  api.state.refreshUnavailable = true;

  await page.goto("/en/app/messages");

  await expect(page.getByRole("button", { name: /Try again|Retry/ })).toBeVisible();
  expect(page.url()).toContain("/en/app/messages");
  expect(api.count("/api/auth/logout")).toBe(0);

  // Once the API answers again, the same session continues.
  api.state.refreshUnavailable = false;
  await page.getByRole("button", { name: /Try again|Retry/ }).click();
  await expect(page.getByRole("button", { name: "Sign out" }).first()).toBeVisible();
});
