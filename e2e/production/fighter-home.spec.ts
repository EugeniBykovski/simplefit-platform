import { expect, test, type Page } from "@playwright/test";

import { VIEWPORTS, axeViolations, box, expectBox, expectInView, open, overflow } from "./harness";
import { onboardingApi, type OnboardingApi, type OnboardingApiOptions } from "./onboarding-api";

/*
 * The Fighter web home and its first run on the production build (SF-40;
 * Claude Design 34b FRW1 / FRW2, 1440 × 900): the real route (`/app/home`),
 * the Fighter gate, FighterProfile and the first-run record (simplefit-api
 * ADR 0018) against the test double (./onboarding-api), which applies the
 * contracts' rules. The backend's own tests own the lifecycle rules; these
 * check that the page shows what the backend says and records only explicit
 * outcomes. Geometry against the artboards closes the file.
 */

const HOME = "/en/app/home";
const title = (page: Page) => page.getByRole("heading", { level: 1 });
const welcome = (page: Page) =>
  page.getByRole("heading", { level: 1, name: "Welcome to SimpleFit, Alex K." });
const headerTour = (page: Page) => page.getByRole("button", { name: "Take the tour", exact: true });
const boardTour = (page: Page) => page.getByRole("button", { name: "Take the tour →" });
const dialog = (page: Page) => page.getByRole("dialog", { name: "Your Live Board lives here" });
const navBoard = (page: Page) => page.locator("aside [data-nav-item=board]");

const FIGHTER = { completed: true, fields: { display_name: "Alex K." } } as const;

const writes = (api: OnboardingApi) =>
  api.requests
    .filter((request) => request.method !== "GET" && request.path !== "/api/auth/session/refresh")
    .map((request) => `${request.method} ${request.path} ${JSON.stringify(request.body ?? null)}`);

async function openHome(page: Page, options: OnboardingApiOptions = FIGHTER) {
  const api = await onboardingApi(page.context(), options);
  await page.goto(HOME);
  await expect(title(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return api;
}

/** A normal (post first-run) home: the greeting of the hour, no tour anywhere. */
async function expectNormalHome(page: Page) {
  await expect(page.locator("[data-fighter-home=home]")).toBeVisible();
  await expect(title(page)).toHaveText(/^Good (morning|afternoon|evening), Alex K\.$/);
  await expect(headerTour(page)).toHaveCount(0);
  await expect(boardTour(page)).toHaveCount(0);
}

test.use({ viewport: { width: 1440, height: 900 } });

test.describe("the Fighter gate", () => {
  test("1 · signed out: sign-in, coming back to Home", async ({ page }) => {
    await onboardingApi(page, { signedOut: true });
    await page.goto(HOME);
    await page.waitForURL((url) => url.pathname === "/en/login");
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/app/home");
  });

  test("2 · account registration incomplete: WA5 first", async ({ page }) => {
    await onboardingApi(page, { accountComplete: false });
    await page.goto(HOME);
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/account");
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/app/home");
  });

  test("3 · Fighter onboarding unfinished: back to it, never a bypass", async ({ page }) => {
    await onboardingApi(page, { fields: { display_name: "Alex K." } });
    await page.goto(HOME);
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/fighter");
    await expect(page.locator("[data-fighter-home]")).toHaveCount(0);
  });

  test("3 · no role started: the choice (WA6), no Fighter journey started for them", async ({
    page,
  }) => {
    const api = await onboardingApi(page);
    await page.goto(HOME);
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/role");
    expect(api.requests.filter((r) => r.path === "/api/v1/me/entry").map((r) => r.query)).toEqual(
      expect.arrayContaining([""]),
    );
    expect(api.state()).toBeUndefined();
  });

  test("23 · every Fighter page is gated, not only Home", async ({ page }) => {
    await onboardingApi(page, { fields: { display_name: "Alex K." } });
    await page.goto("/en/app/board");
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/fighter");
  });

  test("21 · the resolver failing: the entry failure with a working retry", async ({ page }) => {
    const api = await onboardingApi(page, FIGHTER);
    api.failEntry(1);
    await page.goto(HOME);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(welcome(page)).toBeVisible();
  });

  test("4, 25 · a completed Fighter signing in reaches Home through SF-45", async ({ page }) => {
    await onboardingApi(page, FIGHTER);
    await page.goto("/en/login");
    await page.waitForURL((url) => url.pathname === HOME);
    await expect(welcome(page)).toBeVisible();
  });
});

test.describe("FRW1 · the first run", () => {
  test("5, 7 · a new Fighter: welcome with their own name, the day, the tour offered", async ({
    page,
  }) => {
    const api = await openHome(page);
    await expect(welcome(page)).toBeVisible();
    await expect(page.locator("[data-fighter-home=first-run]")).toBeVisible();
    await expect(page.locator("hgroup p").first()).toHaveText(/^\w{3} · \w{3} \d{1,2} · Day \d+$/);
    await expect(headerTour(page)).toBeVisible();
    await expect(boardTour(page)).toBeVisible();
    // Opening Home records nothing: the tour is offered, never assumed.
    expect(writes(api)).toEqual([]);
    expect(api.tour()).toBeUndefined();
  });

  test("8, 9, 28 · no invented domain data: 0 / 6, every step not available, no links", async ({
    page,
  }) => {
    const api = await openHome(page);
    const checklist = page.locator("[data-setup-checklist]");
    await expect(checklist.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    await expect(checklist.getByText("0 of 6 steps done")).toBeAttached();
    await expect(checklist.locator("[data-setup-step]")).toHaveCount(6);
    await expect(checklist.getByText("Not available yet")).toHaveCount(6);
    await expect(checklist.getByRole("link")).toHaveCount(0);
    await expect(checklist.locator("s, del, [style*=line-through]")).toHaveCount(0);
    await expect(page.locator("[data-home-board]").getByText("Empty")).toBeVisible();
    // What the artboard fills from domains that do not exist is not on the page.
    for (const invented of [
      "Book a class",
      "Your first class",
      "Warsaw Boxing Club",
      "18:00",
      "Warsaw Boxing Club · confirmed",
      "Tue 18:00 · Technical — 4 spots left",
      "3 people from your gym are here",
    ]) {
      await expect(page.getByText(invented, { exact: true })).toHaveCount(0);
    }
    expect(writes(api)).toEqual([]);
  });

  test("21 · the first-run record failing: a recoverable failure, then the page", async ({
    page,
  }) => {
    const api = await onboardingApi(page.context(), FIGHTER);
    api.failFirstRun(1);
    await page.goto(HOME);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(welcome(page)).toBeVisible();
  });
});

test.describe("FRW2 · the tour", () => {
  test("10, 11 · opens from the header: a modal dialog on the Live Board item", async ({
    page,
  }) => {
    await openHome(page);
    await headerTour(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toHaveAttribute("aria-modal", "true");
    await expect(dialog(page)).toHaveAccessibleDescription(/Every session you train/);
    await expect(dialog(page).getByText("Tour", { exact: true })).toBeVisible();
    // Focus moved into the dialog; the page behind is inert.
    await expect(dialog(page).getByRole("button", { name: "End tour" })).toBeFocused();
    expect(
      await page.locator("main").evaluate((el) => el.closest("[aria-hidden=true]") !== null),
    ).toBe(true);
  });

  test("10 · opens from the Live Board card too", async ({ page }) => {
    await openHome(page);
    await boardTour(page).click();
    await expect(dialog(page)).toBeVisible();
  });

  test("13, 14, 15 · Done records `completed` once, then the normal home", async ({ page }) => {
    const api = await openHome(page);
    await headerTour(page).click();
    await dialog(page).getByRole("button", { name: "Done" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expectNormalHome(page);
    await expect(title(page)).toBeFocused();
    expect(writes(api)).toEqual([
      'PUT /api/v1/me/first-run/fighter_web_tour {"outcome":"completed"}',
    ]);
    expect(api.tour()).toBe("completed");
  });

  test("13, 15 · End tour records `dismissed`", async ({ page }) => {
    const api = await openHome(page);
    await boardTour(page).click();
    await dialog(page).getByRole("button", { name: "End tour" }).click();
    await expectNormalHome(page);
    expect(api.tour()).toBe("dismissed");
  });

  test("13, 32 · keyboard: Enter opens, focus stays inside, Escape ends the tour", async ({
    page,
  }) => {
    const api = await openHome(page);
    await headerTour(page).focus();
    await page.keyboard.press("Enter");
    await expect(dialog(page).getByRole("button", { name: "End tour" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog(page).getByRole("button", { name: "Done" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog(page).getByRole("button", { name: "End tour" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expectNormalHome(page);
    expect(api.tour()).toBe("dismissed");
  });

  test("a click on the dimmed page does not end the tour", async ({ page }) => {
    const api = await openHome(page);
    await headerTour(page).click();
    await page.mouse.click(1200, 700);
    await expect(dialog(page)).toBeVisible();
    expect(api.tour()).toBeUndefined();
  });

  test("16, 21 · a failed write: the dialog stays with the error; the retry records once", async ({
    page,
  }) => {
    const api = await openHome(page);
    await headerTour(page).click();
    api.failFirstRun(1);
    await dialog(page).getByRole("button", { name: "Done" }).click();
    await expect(dialog(page).getByRole("alert")).toHaveText(/couldn't save that/);
    await expect(dialog(page)).toBeVisible();
    expect(api.tour()).toBeUndefined();
    await dialog(page).getByRole("button", { name: "Done" }).click();
    await expectNormalHome(page);
    expect(api.tour()).toBe("completed");
  });

  test("22 · the session ending: the existing sign-in handling, nothing recorded", async ({
    page,
  }) => {
    const api = await openHome(page);
    await headerTour(page).click();
    api.expire();
    await dialog(page).getByRole("button", { name: "Done" }).click();
    await page.waitForURL((url) => url.pathname === "/en/login");
    expect(api.tour()).toBeUndefined();
  });
});

test.describe("lifecycle across reloads, sessions and tabs", () => {
  test("17 · reload after the tour: the normal home, nothing written again", async ({ page }) => {
    const api = await openHome(page);
    await headerTour(page).click();
    await dialog(page).getByRole("button", { name: "Done" }).click();
    await expectNormalHome(page);
    await page.reload();
    await expectNormalHome(page);
    expect(writes(api)).toHaveLength(1);
  });

  test("18 · reload during the tour: unfinished is not an outcome; offered again", async ({
    page,
  }) => {
    const api = await openHome(page);
    await headerTour(page).click();
    await page.reload();
    await expect(welcome(page)).toBeVisible();
    await expect(dialog(page)).toHaveCount(0);
    await expect(headerTour(page)).toBeVisible();
    expect(api.tour()).toBeUndefined();
  });

  test("19 · signing in again after the tour (any browser): the normal home", async ({ page }) => {
    for (const tour of ["completed", "dismissed"] as const) {
      await onboardingApi(page, { ...FIGHTER, tour });
      await page.goto("/en/login");
      await page.waitForURL((url) => url.pathname === HOME);
      await expectNormalHome(page);
      await page.unrouteAll();
    }
  });

  test("20 · two tabs: one ends the tour, the other follows on focus and on reload", async ({
    context,
  }) => {
    const api = await onboardingApi(context, FIGHTER);
    const [a, b] = [await context.newPage(), await context.newPage()];
    for (const page of [a, b]) {
      await page.goto(HOME);
      await expect(welcome(page)).toBeVisible();
    }
    await headerTour(a).click();
    await dialog(a).getByRole("button", { name: "End tour" }).click();
    await expectNormalHome(a);

    await b.bringToFront();
    await b.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await expectNormalHome(b);
    await b.reload();
    await expectNormalHome(b);
    expect(api.tour()).toBe("dismissed");
  });

  test("20 · a tab with the tour open after another tab recorded: the kept outcome wins", async ({
    context,
  }) => {
    const api = await onboardingApi(context, FIGHTER);
    const page = await context.newPage();
    await page.goto(HOME);
    await headerTour(page).click();
    api.recordTourExternally("dismissed");
    await dialog(page).getByRole("button", { name: "Done" }).click();
    await expectNormalHome(page);
    expect(api.tour()).toBe("dismissed");
  });

  test("24 · history: Back from another Fighter page returns to the same home state", async ({
    page,
  }) => {
    await openHome(page);
    await navBoard(page).click();
    await page.waitForURL((url) => url.pathname === "/en/app/board");
    await page.goBack();
    await expect(welcome(page)).toBeVisible();
    await page.goForward();
    await page.waitForURL((url) => url.pathname === "/en/app/board");
  });

  test("30 · nothing about the first run lives in browser storage", async ({ page }) => {
    await openHome(page);
    await headerTour(page).click();
    await dialog(page).getByRole("button", { name: "Done" }).click();
    await expectNormalHome(page);
    const stored = await page.evaluate(() =>
      [...Object.keys(localStorage), ...Object.keys(sessionStorage)].join(" "),
    );
    expect(stored).not.toMatch(/tour|first.?run|home/i);
  });

  test("31 · after the first run the home stays usable: navigation and real data", async ({
    page,
  }) => {
    await openHome(page, { ...FIGHTER, tour: "completed" });
    await expectNormalHome(page);
    await expect(page.locator("[data-setup-checklist]")).toBeVisible();
    await expect(page.locator("[data-home-board]")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Fighter" })).toBeVisible();
  });
});

test("19, 27, 41 · end to end: sign-up → WA5 → WA6 → Fighter → WF6 → Home → tour → reload", async ({
  page,
}) => {
  let api!: OnboardingApi;
  await open(page, "/en/signup", page.getByRole("heading", { level: 1 }), async (page) => {
    api = await onboardingApi(page, { signedOut: true });
  });
  await page.getByRole("link", { name: "Continue with Email" }).click();
  await page.getByRole("textbox", { name: "Email" }).fill("fighter@example.com");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.locator('[data-slot="code-input"]').pressSequentially("482910");
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/account");
  await page.getByLabel("Full name").fill("Alex Kowalski");
  await page.getByLabel("Date of birth").fill("2000-05-17");
  await page.getByRole("checkbox", { name: /Terms of Service/ }).click();
  await page.getByRole("checkbox", { name: /Privacy Policy/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/role");
  await page.locator("[data-journey=fighter]").click();
  await page.locator("form button[type=submit]").click();
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/fighter");
  await page.getByLabel("Name", { exact: true }).fill("Alex K.");
  await page.getByRole("textbox", { name: "Username" }).fill("alex_k");
  await page.getByRole("combobox", { name: "Country" }).click();
  await page.getByRole("combobox", { name: "Search countries" }).fill("Poland");
  await page.keyboard.press("Enter");
  await page.getByLabel("City").fill("Warsaw");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Competitive amateur").click();
  await page.getByText("Orthodox").click();
  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByRole("link", { name: "Go to my home" }).click();
  await page.waitForURL((url) => url.pathname === HOME);

  await expect(welcome(page)).toBeVisible();
  // The double dates completion at its fixed NOW; the day count itself is unit-tested.
  await expect(page.locator("hgroup p").first()).toHaveText(/ · Day \d+$/);
  await headerTour(page).click();
  await dialog(page).getByRole("button", { name: "Done" }).click();
  await expectNormalHome(page);
  await page.reload();
  await expectNormalHome(page);
  await page.goto("/en/app");
  await page.waitForURL((url) => url.pathname === HOME);
  await expectNormalHome(page);

  expect(writes(api).map((write) => write.split(" ").slice(0, 2).join(" "))).toEqual([
    "POST /api/auth/email/registrations",
    "POST /api/auth/email/registrations/verify",
    "PATCH /api/v1/me/account-profile",
    "POST /api/v1/me/account-profile/complete-registration",
    "PATCH /api/v1/me/fighter-profile",
    "PATCH /api/v1/me/fighter-profile",
    "POST /api/v1/me/fighter-profile/complete-onboarding",
    "PUT /api/v1/me/first-run/fighter_web_tour",
  ]);
});

test.describe("geometry and accessibility", () => {
  test("FRW1 at 1440 × 900: shell, header, columns and cards", async ({ page }) => {
    await openHome(page);
    await expectBox(page.locator("aside"), { x: 0, y: 0, w: 240, h: 900 });
    await expectBox(page.locator("main"), { x: 240, w: 1200 });
    await expectBox(page.locator("[data-slot=page-header]"), { x: 240, y: 0, w: 1200, h: 77 });
    await expectBox(headerTour(page), { x: 1264, y: 18, h: 40 });
    // The 1.35 : 1 grid on 24 / 32 px gutters (1136 px): 641.1 and 474.9, 20 apart.
    await expectBox(page.locator("[data-setup-checklist]"), { x: 272, y: 101, w: 641.1 });
    await expectBox(page.locator("[data-home-app]"), { x: 933.1, y: 101, w: 474.9 });
    await expectBox(page.locator("[data-setup-step=gym]"), { h: 56 });
    const checklist = await box(page.locator("[data-setup-checklist]"));
    await expectBox(page.locator("[data-home-board]"), {
      x: 272,
      y: checklist.y + checklist.height + 16,
      w: 641.1,
    });
    await expectBox(page.locator("[data-home-board] p"), { h: 150 });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: "test-results/sf40-frw1-1440.png" });
  });

  test("FRW2 at 1440 × 900: the spotlight on the item, the card beside it", async ({ page }) => {
    await openHome(page);
    await headerTour(page).click();
    await expect(dialog(page)).toBeVisible();
    const item = await box(navBoard(page));
    await expectBox(page.locator("[data-tour-spotlight]"), {
      x: item.x - 4,
      y: item.y - 4,
      w: item.width + 8,
      h: item.height + 8,
    });
    const centre = item.y + item.height / 2;
    await expectBox(dialog(page), { x: item.x + item.width + 4 + 22, y: centre - 37, w: 380 });
    const arrow = await box(page.locator("[data-tour-arrow]"));
    expect(Math.abs(arrow.y + arrow.height / 2 - centre)).toBeLessThanOrEqual(1);
    await expectBox(dialog(page).getByRole("button", { name: "Done" }), { h: 42 });
    await page.screenshot({ path: "test-results/sf40-frw2-1440.png" });
  });

  for (const [width, height] of VIEWPORTS) {
    test(`${width} × ${height}: one composition, the tour anchored and reachable`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openHome(page);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await expectBox(page.locator("aside"), { x: 0, w: 240, h: height });
      const checklist = await box(page.locator("[data-setup-checklist]"));
      const app = await box(page.locator("[data-home-app]"));
      expect(Math.abs(checklist.width / app.width - 1.35)).toBeLessThan(0.01);
      expect(app.x + app.width).toBeCloseTo(width - 32, 0);
      await headerTour(page).click();
      await expectInView(dialog(page), width, height);
      await expectInView(dialog(page).getByRole("button", { name: "Done" }), width, height);
      const item = await box(navBoard(page));
      await expectBox(page.locator("[data-tour-spotlight]"), { x: item.x - 4, y: item.y - 4 });
    });
  }

  test("390 × 844: one column, the tour centred over the page, nothing wider", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHome(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await expect(page.locator("aside")).toBeHidden();
    const checklist = await box(page.locator("[data-setup-checklist]"));
    const app = await box(page.locator("[data-home-app]"));
    expect(app.y).toBeGreaterThan(checklist.y + checklist.height);
    await headerTour(page).click();
    await expect(page.locator("[data-tour-spotlight]")).toHaveCount(0);
    await expect(page.locator("[data-tour-dim]")).toBeAttached();
    await expectInView(dialog(page), 390, 844);
    const card = await box(dialog(page));
    expect(Math.abs(card.x + card.width / 2 - 195)).toBeLessThanOrEqual(1);
    await dialog(page).getByRole("button", { name: "Done" }).click();
    await expectNormalHome(page);
    await page.screenshot({ path: "test-results/sf40-home-390.png", fullPage: true });
  });

  test("axe: first run, the open tour and the home after it", async ({ page }) => {
    await openHome(page);
    expect(await axeViolations(page)).toEqual([]);
    await headerTour(page).click();
    await expect(dialog(page)).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await dialog(page).getByRole("button", { name: "Done" }).click();
    await expectNormalHome(page);
    expect(await axeViolations(page)).toEqual([]);
  });

  test("German: the longest labels keep the composition", async ({ page }) => {
    await onboardingApi(page, FIGHTER);
    await page.goto("/de/app/home");
    await expect(
      page.getByRole("heading", { level: 1, name: "Willkommen bei SimpleFit, Alex K." }),
    ).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await expectBox(page.locator("[data-setup-step=privacy]"), { h: 56 });
  });
});
