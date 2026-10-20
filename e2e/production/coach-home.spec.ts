import { expect, test, type Page } from "@playwright/test";

import { onboardingApi, type OnboardingApi } from "./onboarding-api";

/*
 * The Coach web workspace and Fighter ↔ Coach context switching on the
 * production build (SF-54): the real routes (`/app`, `/app/coach`,
 * `/app/home`, `/app/context`), gates and components against the SF-50 /
 * SF-51 test double (./onboarding-api). Persistence is read from what the
 * page sent or what the double stored, never from client state.
 */

test.use({ viewport: { width: 1440, height: 900 } });

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name });
const writes = (api: OnboardingApi) =>
  api.requests.filter(
    (request) => request.method !== "GET" && request.path !== "/api/auth/session/refresh",
  );
const contextWrites = (api: OnboardingApi) =>
  writes(api).filter((request) => request.path === "/api/v1/me/entry/context");

const FIGHTER = {
  display_name: "Alex N.",
  username: "alex_n",
  country_code: "PL",
  city: "Warsaw",
  experience_level: "amateur",
  stance: "orthodox",
};
const COACH = {
  display_name: "Alex Novak",
  brand_name: "Novak Boxing",
  country_code: "PL",
  city: "Warsaw",
  languages: ["en", "pl"],
  coaching_formats: ["personal_training", "fight_camps"],
  competition_levels: ["amateur"],
};
const BOTH = { fields: FIGHTER, completed: true, coachFields: COACH, coachCompleted: true };

/** The sidebar's context switcher (desktop), opened. */
async function openSwitcher(page: Page, name: RegExp) {
  await page.getByRole("complementary").getByRole("button", { name }).click();
  return page.getByRole("menu");
}

test.describe("A · a completed Coach", () => {
  test("enters the real Coach dashboard: saved profile only, no placeholder, no invented figures", async ({
    page,
  }) => {
    const api = await onboardingApi(page, { coachFields: COACH, coachCompleted: true });
    await page.goto("/en/app");
    await page.waitForURL("**/en/app/coach");
    await expect(heading(page, "Welcome, Alex Novak")).toBeVisible();
    await expect(page.getByText("Planned")).toHaveCount(0);

    const profile = page.getByRole("region", { name: "Your coach profile" });
    await expect(profile).toContainText("Novak Boxing · Warsaw, Poland");
    await expect(profile).toContainText("Personal Training · Fight Camps");
    await expect(profile).toContainText("English · Polski");

    // Unknown is not zero: no count for a domain the backend does not have.
    const fills = page.getByRole("region", { name: "What fills this dashboard" });
    await expect(fills.getByText("—")).toHaveCount(3);
    await expect(page.locator("main")).not.toContainText(/€|booked|attendance|rounds/i);

    // The MVP sidebar: Dashboard, (SF-58) Fighters and (SF-64) Sessions
    // linked; Coach settings Soon.
    const sidebar = page.getByRole("complementary");
    await expect(sidebar.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(sidebar.getByRole("link", { name: "Fighters" })).toHaveAttribute(
      "href",
      "/en/app/coach/fighters",
    );
    await expect(sidebar.getByRole("link", { name: "Sessions" })).toHaveAttribute(
      "href",
      "/en/app/coach/sessions",
    );
    await expect(sidebar.getByRole("link", { name: "Coach settings" })).toHaveCount(0);
    await expect(
      sidebar.locator('[data-nav-item][aria-disabled="true"]', { hasText: "Coach settings" }),
    ).toContainText("Soon");
    await expect(sidebar).not.toContainText(/Earnings|Sparring|Team board|Messages/);
    // Reading the dashboard writes nothing.
    expect(writes(api)).toEqual([]);
  });

  test("a Coach without a Fighter profile is offered fighter setup, by intent only", async ({
    page,
  }) => {
    const api = await onboardingApi(page, { coachFields: COACH, coachCompleted: true });
    await page.goto("/en/app/coach");
    const menu = await openSwitcher(page, /Alex Novak, Coach/);
    await expect(menu.getByRole("menuitemradio")).toHaveCount(1);
    await menu.getByRole("menuitem", { name: /Set up a fighter profile/ }).click();
    await page.waitForURL(/\/en\/app\/onboarding\/fighter\?.*intent=fighter/);
    expect(contextWrites(api)).toEqual([]);
  });
});

test.describe("B · a Fighter becomes a Coach", () => {
  test("starts coaching from the Fighter switcher; the Fighter profile is never written", async ({
    page,
  }) => {
    const api = await onboardingApi(page, { fields: FIGHTER, completed: true, tour: "completed" });
    await page.goto("/en/app/home");
    const menu = await openSwitcher(page, /Alex N\., Fighter/);
    await menu.getByRole("menuitem", { name: /Set up coaching/ }).click();
    await page.waitForURL(/\/en\/app\/onboarding\/coach\?.*intent=coach/);
    await expect(heading(page, "Your coach profile")).toBeVisible();
    expect(contextWrites(api)).toEqual([]);
    expect(
      writes(api).filter((request) => request.path.startsWith("/api/v1/me/fighter-profile")),
    ).toEqual([]);
    expect(api.state()).toMatchObject({ display_name: "Alex N.", username: "alex_n" });
  });
});

test.describe("C · two completed contexts", () => {
  test("WCX1 records the choice, the home remembers it, and the switcher moves back", async ({
    page,
  }) => {
    const api = await onboardingApi(page, { ...BOTH, tour: "completed" });
    await page.goto("/en/app");
    await page.waitForURL("**/en/app/context");
    await expect(heading(page, "Where do you want to go?")).toBeVisible();
    await expect(page.getByText("Alex Novak · Coach dashboard")).toBeVisible();
    await page.getByRole("button", { name: /Coach.*Open/ }).click();
    await page.waitForURL("**/en/app/coach");
    expect(contextWrites(api).map((request) => request.body)).toEqual([{ context: "coach" }]);
    expect(api.lastContext()).toBe("coach");

    // Refresh, and a fresh entry: the backend remembers Coach.
    await page.reload();
    await expect(heading(page, "Welcome, Alex Novak")).toBeVisible();
    await page.goto("/en/app");
    await page.waitForURL("**/en/app/coach");

    // Switch to Fighter: recorded, then Fighter home.
    const menu = await openSwitcher(page, /Alex Novak, Coach/);
    await expect(menu.getByRole("menuitemradio", { name: /Coach/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await menu.getByRole("menuitemradio", { name: /Fighter/ }).click();
    await page.waitForURL("**/en/app/home");
    expect(api.lastContext()).toBe("fighter");

    // A requested context still opens directly, whatever is remembered.
    await page.goto("/en/app/coach");
    await expect(heading(page, "Welcome, Alex Novak")).toBeVisible();
    await expect(page).toHaveURL(/\/en\/app\/coach$/);
    // Back and Forward stay on real pages, without a loop.
    await page.goBack();
    await expect(page).toHaveURL(/\/en\/app\/home$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/en\/app\/coach$/);

    // One account throughout: only context choices were written.
    expect(new Set(writes(api).map((request) => request.path))).toEqual(
      new Set(["/api/v1/me/entry/context"]),
    );
    expect(api.state()).toMatchObject({ display_name: "Alex N." });
    expect(api.coach()).toMatchObject({ display_name: "Alex Novak" });
  });

  test("a failed choice keeps the user in their context with a retry; repeated clicks write once", async ({
    page,
  }) => {
    const api = await onboardingApi(page, { ...BOTH, lastContext: "coach", tour: "completed" });
    await page.goto("/en/app/coach");
    api.failContext(1);
    let menu = await openSwitcher(page, /Alex Novak, Coach/);
    await menu.getByRole("menuitemradio", { name: /Fighter/ }).click();
    await expect(menu.getByRole("alert")).toContainText("We couldn’t switch.");
    await expect(page).toHaveURL(/\/en\/app\/coach$/);
    expect(api.lastContext()).toBe("coach");

    await menu.getByRole("menuitemradio", { name: /Fighter/ }).dblclick();
    await page.waitForURL("**/en/app/home");
    expect(api.lastContext()).toBe("fighter");
    // The failed attempt and one successful choice: the double click wrote once.
    expect(contextWrites(api)).toHaveLength(2);
    menu = page.getByRole("menu");
    await expect(menu).toHaveCount(0);
  });

  test("a choice made in another tab is what a fresh entry follows", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const api = await onboardingApi(context, { ...BOTH, lastContext: "coach", tour: "completed" });
    const first = await context.newPage();
    const second = await context.newPage();
    await first.goto("/en/app/coach");
    await second.goto("/en/app/coach");
    const menu = await openSwitcher(second, /Alex Novak, Coach/);
    await menu.getByRole("menuitemradio", { name: /Fighter/ }).click();
    await second.waitForURL("**/en/app/home");
    // The first tab keeps its requested context; a fresh entry follows the new choice.
    await first.reload();
    await expect(heading(first, "Welcome, Alex Novak")).toBeVisible();
    await first.goto("/en/app");
    await first.waitForURL("**/en/app/home");
    expect(api.lastContext()).toBe("fighter");
    await context.close();
  });

  test("an expired session during a switch returns to sign-in, never to stale Coach data", async ({
    page,
  }) => {
    const api = await onboardingApi(page, { ...BOTH, lastContext: "coach", tour: "completed" });
    await page.goto("/en/app/coach");
    await expect(heading(page, "Welcome, Alex Novak")).toBeVisible();
    api.expire();
    const menu = await openSwitcher(page, /Alex Novak, Coach/);
    await menu.getByRole("menuitemradio", { name: /Fighter/ }).click();
    await page.waitForURL(/\/en\/login/);
    await expect(page.getByText("Alex Novak")).toHaveCount(0);
  });
});

test("signing out of the Coach dashboard leaves no Coach data behind (Back shows nothing)", async ({
  page,
}) => {
  await onboardingApi(page, { coachFields: COACH, coachCompleted: true });
  await page.goto("/en/app/coach");
  await expect(heading(page, "Welcome, Alex Novak")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.waitForURL(/\/en\/login$/);
  await page.goBack();
  // Whatever the browser restores, the previous user's Coach profile is gone.
  await expect(page.getByText("Novak Boxing")).toHaveCount(0);
  await expect(page.getByText("Alex Novak")).toHaveCount(0);
});

test.describe("D · two unfinished journeys (E11)", () => {
  test("WCX1 continues either setup by intent and records no context", async ({ page }) => {
    const api = await onboardingApi(page, {
      fields: { display_name: "Alex N." },
      coachFields: { display_name: "Alex Novak" },
    });
    await page.goto("/en/app");
    await page.waitForURL("**/en/app/context");
    await expect(heading(page, "Which setup do you want to continue?")).toBeVisible();
    await expect(page.getByRole("button", { name: /Open/ })).toHaveCount(0);
    await page.getByRole("button", { name: /Continue coach setup/ }).click();
    await page.waitForURL(/\/en\/app\/onboarding\/coach\?.*intent=coach/);

    await page.goto("/en/app/context");
    await page.getByRole("button", { name: /Continue fighter setup/ }).click();
    await page.waitForURL(/\/en\/app\/onboarding\/fighter\?.*intent=fighter/);
    expect(contextWrites(api)).toEqual([]);
    expect(api.lastContext()).toBeUndefined();
  });
});

test.describe("E · access", () => {
  test("no COACH: the Coach area sends the user to their own home", async ({ page }) => {
    await onboardingApi(page, { fields: FIGHTER, completed: true, tour: "completed" });
    await page.goto("/en/app/coach");
    await page.waitForURL("**/en/app/home");
    await expect(page.getByText("Novak Boxing")).toHaveCount(0);
  });

  test("no FIGHTER: the Fighter area sends a Coach to Coach home", async ({ page }) => {
    await onboardingApi(page, { coachFields: COACH, coachCompleted: true });
    await page.goto("/en/app/home");
    await page.waitForURL("**/en/app/coach");
  });

  test("a forged query or returnTo grants nothing", async ({ page }) => {
    const api = await onboardingApi(page, { fields: FIGHTER, completed: true, tour: "completed" });
    await page.goto("/en/app?context=coach&returnTo=%2F%2Fevil.example%2Fapp%2Fcoach");
    await page.waitForURL("**/en/app/home");
    await page.goto("/en/app/context");
    // Not a context_selection answer: the chooser leaves for the entry's destination.
    await page.waitForURL("**/en/app/home");
    expect(writes(api)).toEqual([]);
  });

  test("an unfinished account registration comes first", async ({ page }) => {
    await onboardingApi(page, { accountComplete: false });
    await page.goto("/en/app/context");
    await page.waitForURL(/\/en\/app\/onboarding\/account/);
  });
});

test.describe("narrow viewport", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the switcher is in the navigation sheet and the dashboard fits without horizontal scroll", async ({
    page,
  }) => {
    await onboardingApi(page, { ...BOTH, lastContext: "coach", tour: "completed" });
    await page.goto("/en/app/coach");
    await expect(heading(page, "Welcome, Alex Novak")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Open navigation" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: /Alex Novak, Coach/ }).click();
    await page.getByRole("menuitemradio", { name: /Fighter/ }).click();
    await page.waitForURL("**/en/app/home");
  });
});
