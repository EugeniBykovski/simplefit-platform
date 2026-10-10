import { expect, test, type Page } from "@playwright/test";

import { axeViolations, box, expectBox, expectProviderControls, open, overflow } from "./harness";
import { onboardingApi, type OnboardingApi, type OnboardingApiOptions } from "./onboarding-api";

/*
 * WA6 Choose where to start on the production build (SF-47): the real route
 * (`/app/onboarding/role`), its gates and components against the SF-44 /
 * SF-45 test double (./onboarding-api). The double applies SF-45's order
 * (account registration, explicit intent, role state, role selection); the
 * backend's own tests own that decision matrix, so these tests check that
 * the page asks the resolver and goes where it answers, never re-deciding.
 * Geometry against Claude Design V78 WebRoleSelect (1440 × 980) closes the
 * file.
 */

const ROUTE = "/en/app/onboarding/role";
const heading = (page: Page) =>
  page.getByRole("heading", { level: 1, name: "What would you like to set up first?" });
const journey = (page: Page, name: RegExp | string) => page.getByRole("radio", { name });
const cta = (page: Page) => page.locator("form button[type=submit]");
/** Picks a journey the way a visitor does: a click anywhere on its card. */
const pick = (page: Page, intent: "fighter" | "coach" | "gym" | "sponsor") =>
  page.locator(`[data-journey=${intent}]`).click();
const CARD = {
  fighter: /^Fighter/,
  coach: /^Coach/,
  gym: /^Gym \/ Club/,
  sponsor: /^Sponsor \/ Brand/,
} as const;

/** Anything but a read: WA6 never writes (no role, profile, workspace or membership). */
const writes = (api: OnboardingApi) =>
  api.requests.filter(
    (request) => request.method !== "GET" && request.path !== "/api/auth/session/refresh",
  );
const resolutions = (api: OnboardingApi) =>
  api.requests.filter((request) => request.path === "/api/v1/me/entry").map((r) => r.query);

async function openWa6(page: Page, options: OnboardingApiOptions = {}, query = "") {
  const api = await onboardingApi(page, options);
  await page.goto(`${ROUTE}${query}`);
  await expect(heading(page)).toBeVisible();
  return api;
}

test.use({ viewport: { width: 1440, height: 980 } });

test.describe("entry conditions", () => {
  test("1 · signed out: WA6 sends the visitor to sign-in, with no journey invented", async ({
    page,
  }) => {
    await onboardingApi(page, { signedOut: true });
    await page.goto(ROUTE);
    await page.waitForURL((url) => url.pathname === "/en/login");
    expect(new URL(page.url()).searchParams.get("intent")).toBeNull();
  });

  test("2, 20 · account registration incomplete: WA5 wins, also with an intent", async ({
    page,
  }) => {
    const api = await onboardingApi(page, { accountComplete: false });
    await page.goto(ROUTE);
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/account");
    await page.goto(`${ROUTE}?intent=coach`);
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/account");
    expect(new URL(page.url()).searchParams.get("intent")).toBe("coach");
    await expect(page.getByRole("radio")).toHaveCount(0);
    expect(writes(api)).toEqual([]);
  });

  test("3–5 · complete account, no intent: the four journeys, none picked, Continue explains why it waits", async ({
    page,
  }) => {
    const api = await openWa6(page);
    expect(resolutions(api)).toContain("");
    await expect(page.getByRole("radio")).toHaveCount(4);
    for (const name of Object.values(CARD)) await expect(journey(page, name)).not.toBeChecked();
    await expect(cta(page)).toBeDisabled();
    await expect(cta(page)).toHaveText("Continue");
    await expect(cta(page)).toHaveAccessibleDescription("Choose one to continue.");
    // The step card: Account basics done, Where to start current.
    await expect(page.locator("[aria-current=step]")).toHaveText("2Where to start");
    expect(writes(api)).toEqual([]);
    expect(await axeViolations(page)).toEqual([]);
  });

  test("7 · a Fighter profile in progress: WA6 continues to Fighter onboarding, as the resolver answers", async ({
    page,
  }) => {
    const api = await onboardingApi(page, { fields: { display_name: "Alex K." } });
    await page.goto(ROUTE);
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/fighter");
    expect(writes(api)).toEqual([]);
  });

  test("8 · a completed Fighter: WA6 continues home, never back into onboarding", async ({
    page,
  }) => {
    const api = await onboardingApi(page, { completed: true, fields: { display_name: "Alex K." } });
    await page.goto(ROUTE);
    await page.waitForURL((url) => url.pathname === "/en/app/home");
    expect(writes(api)).toEqual([]);
  });

  test("E · an explicit intent in the URL: the resolver's destination, no bounce through WA6", async ({
    page,
  }) => {
    await onboardingApi(page);
    await page.goto(`${ROUTE}?intent=gym`);
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/gym");
    expect(new URL(page.url()).searchParams.get("intent")).toBe("gym");
  });

  test("17 · invalid, cased, repeated or scripted intents are dropped: WA6 shows, nothing implied", async ({
    page,
  }) => {
    const api = await onboardingApi(page);
    for (const query of [
      "?intent=admin",
      "?intent=FIGHTER",
      "?intent=fighter%00",
      "?intent=fighter&intent=coach",
      "?intent=javascript%3Aalert(1)",
      "?intent=%2566ighter",
    ]) {
      await page.goto(`${ROUTE}${query}`);
      await expect(heading(page)).toBeVisible();
      await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
    }
    expect(resolutions(api).every((search) => search === "")).toBe(true);
  });
});

test.describe("choosing a journey", () => {
  for (const [intent, path, title] of [
    ["fighter", "/en/app/onboarding/fighter", "Your fighter profile"],
    ["coach", "/en/app/onboarding/coach", "Coach registration"],
    ["gym", "/en/app/onboarding/gym", "Gym setup"],
    // SPX2, the public sponsor page (SF-43).
    ["sponsor", "/en/partners/apply", "Apply in 5 minutes. No account needed to start."],
  ] as const) {
    test(`6, 9–16, 33 · ${intent}: the resolver is asked with intent=${intent}; its destination opens, nothing is written`, async ({
      page,
    }) => {
      const api = await openWa6(page);
      await pick(page, intent);
      await expect(journey(page, CARD[intent])).toBeChecked();
      const label = {
        fighter: "Start fighter setup",
        coach: "Start coach setup",
        gym: "Start gym setup",
        sponsor: "Apply as a partner",
      }[intent];
      await expect(cta(page)).toHaveText(label);
      const before = resolutions(api).length;
      await cta(page).click();
      await page.waitForURL((url) => url.pathname === path);
      expect(resolutions(api).slice(before)[0]).toBe(`?intent=${intent}`);
      // The journey's own page (Fighter onboarding, or the truthful placeholder).
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      if (intent === "sponsor") {
        // A public application: no intent carried, never the workspace chooser (WA2).
        expect(new URL(page.url()).search).toBe("");
      } else {
        expect(new URL(page.url()).searchParams.get("intent")).toBe(intent);
      }
      expect(page.url()).not.toContain("workspaces");
      // No role, profile, capability, workspace or membership was written.
      expect(writes(api)).toEqual([]);
      expect(api.state()).toBeUndefined();
    });
  }

  test("18 · unsafe returnTo values never travel on, whatever the choice", async ({ page }) => {
    for (const returnTo of [
      "https://evil.example/app",
      "//evil.example",
      "javascript:alert(1)",
      "data:text/html,<b>x</b>",
      "%2F%2Fevil.example",
      "/\\evil.example",
      "/app/../../evil",
      "/not-a-route",
    ]) {
      await page.context().clearCookies();
      await openWa6(page, {}, `?returnTo=${encodeURIComponent(returnTo)}`);
      await pick(page, "coach");
      await cta(page).click();
      await page.waitForURL((url) => url.pathname === "/en/app/onboarding/coach");
      expect(new URL(page.url()).searchParams.get("returnTo")).toBeNull();
      expect(page.url()).not.toContain("evil");
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  });

  test("19 · a safe returnTo follows the canonical precedence: the explicit journey wins, the returnTo rides along", async ({
    page,
  }) => {
    await openWa6(page, {}, "?returnTo=%2Fapp%2Fmessages");
    await pick(page, "coach");
    await cta(page).click();
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/coach");
    const params = new URL(page.url()).searchParams;
    expect(params.get("intent")).toBe("coach");
    expect(params.get("returnTo")).toBe("/app/messages");
  });

  test("29, 30, 32 · the resolver fails: WA6 stays with the choice, announces it, and Retry continues", async ({
    page,
  }) => {
    const api = await openWa6(page);
    await pick(page, "gym");
    api.failEntry(1);
    await cta(page).click();
    const status = page.locator('main div[role="status"][aria-live="polite"]');
    await expect(status).toContainText("We couldn’t open that setup.");
    await expect(journey(page, CARD.gym)).toBeChecked();
    expect(new URL(page.url()).pathname).toBe(ROUTE);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/production/wa6-failure.png" });
    await page.getByRole("button", { name: "Retry" }).click();
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/gym");
    expect(writes(api)).toEqual([]);
  });

  test("an unknown destination from a newer API is a controlled failure, never a guessed route", async ({
    page,
  }) => {
    await openWa6(page);
    await page.route(
      (url) => url.pathname === "/api/v1/me/entry" && url.searchParams.has("intent"),
      (route) =>
        route.fulfill({
          json: {
            entry: {
              account_registration: "complete",
              capabilities: [],
              destination: "coach_workspace",
              fighter_profile: "not_started",
              intent: "coach",
              mandatory: false,
              reason: "fixture",
            },
          },
        }),
    );
    await pick(page, "coach");
    await cta(page).click();
    await expect(page.locator("[data-choice-notice=unexpected]")).toContainText(
      "This version of SimpleFit can’t open it yet.",
    );
    expect(new URL(page.url()).pathname).toBe(ROUTE);
  });

  test("28 · repeated clicks and Enter resolve once", async ({ page }) => {
    const api = await openWa6(page);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      (url) => url.pathname === "/api/v1/me/entry" && url.searchParams.has("intent"),
      async (route) => {
        await held;
        await route.fallback();
      },
    );
    await pick(page, "fighter");
    await cta(page).click();
    await expect(cta(page)).toHaveText("Opening…");
    await expect(cta(page)).toHaveAttribute("aria-busy", "true");
    await cta(page).click({ force: true });
    await page.keyboard.press("Enter");
    // The choice is locked while it resolves.
    await expect(journey(page, CARD.coach)).toBeDisabled();
    release();
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/fighter");
    expect(resolutions(api).filter((search) => search === "?intent=fighter")).toHaveLength(1);
  });

  test("31 · keyboard only: into the group, arrows choose, Enter on Continue", async ({ page }) => {
    await openWa6(page);
    await journey(page, CARD.fighter).focus();
    await expect(journey(page, CARD.fighter)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(journey(page, CARD.coach)).toBeChecked();
    await expect(journey(page, CARD.coach)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cta(page)).toBeFocused();
    await expect(cta(page)).toHaveText("Start coach setup");
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/coach");
  });

  test("25 · a reload asks again: the pick is not saved", async ({ page }) => {
    await openWa6(page);
    await pick(page, "sponsor");
    await page.reload();
    await expect(heading(page)).toBeVisible();
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  });

  test("26 · Back from the chosen journey returns to WA6; Forward goes back to it", async ({
    page,
  }) => {
    await openWa6(page);
    await pick(page, "fighter");
    await cta(page).click();
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/fighter");
    await page.goBack();
    await page.waitForURL((url) => url.pathname === ROUTE);
    await expect(heading(page)).toBeVisible();
    await page.goForward();
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/fighter");
  });

  test("27 · the session ends while choosing: sign-in, nothing chosen on the account", async ({
    page,
  }) => {
    const api = await openWa6(page);
    await pick(page, "fighter");
    api.expire();
    await cta(page).click();
    await page.waitForURL((url) => url.pathname === "/en/login");
    expect(writes(api)).toEqual([]);
  });

  test("multi-tab · Fighter completed elsewhere: the choice uses the current state and goes home", async ({
    page,
  }) => {
    const api = await openWa6(page);
    api.externalUpdate({
      display_name: "Alex K.",
      username: "alex_k",
      country_code: "PL",
      city: "Warsaw",
      experience_level: "amateur",
      stance: "orthodox",
    });
    api.completeExternally();
    await pick(page, "fighter");
    await cta(page).click();
    await page.waitForURL((url) => url.pathname === "/en/app/home");
  });
});

test.describe("21–24 · sign-in without an intent reaches WA6 after WA5, never a Fighter default", () => {
  async function completeWa5(page: Page) {
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/account");
    await page.getByLabel("Full name").fill("Alex Kowalski");
    await page.getByLabel("Date of birth").fill("2000-05-17");
    await page.getByRole("checkbox", { name: /Terms of Service/ }).click();
    await page.getByRole("checkbox", { name: /Privacy Policy/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((url) => url.pathname === ROUTE);
    await expect(heading(page)).toBeVisible();
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  }

  test("email", async ({ page }) => {
    let api!: OnboardingApi;
    await open(page, "/en/signup", page.getByRole("heading", { level: 1 }), async (page) => {
      api = await onboardingApi(page, { signedOut: true });
    });
    await page.getByRole("link", { name: "Continue with Email" }).click();
    await page.getByRole("textbox", { name: "Email" }).fill("fighter@example.com");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL((url) => url.pathname === "/en/signup/verify");
    await page.locator('[data-slot="code-input"]').pressSequentially("482910");
    await completeWa5(page);
    expect(resolutions(api).every((search) => search === "")).toBe(true);
  });

  test("Google", async ({ page }) => {
    let api!: OnboardingApi;
    await open(page, "/en/login", page.getByRole("heading", { level: 1 }), async (page) => {
      api = await onboardingApi(page, { signedOut: true });
    });
    await expectProviderControls(page);
    await page.evaluate(() =>
      (
        window as unknown as { __gsiConfig: { callback: (r: { credential: string }) => void } }
      ).__gsiConfig.callback({ credential: "fixture-google-id-token" }),
    );
    await completeWa5(page);
    expect(resolutions(api).every((search) => search === "")).toBe(true);
  });

  test("Apple", async ({ page }) => {
    let api!: OnboardingApi;
    await open(page, "/en/login", page.getByRole("heading", { level: 1 }), async (page) => {
      api = await onboardingApi(page, { signedOut: true });
    });
    await expectProviderControls(page);
    await page.evaluate(() => {
      const w = window as unknown as {
        __appleSignIn: (config: { state: string }) => Promise<unknown>;
      };
      w.__appleSignIn = (config) =>
        Promise.resolve({
          authorization: { id_token: "fixture-apple-id-token", state: config.state },
        });
    });
    await page.getByRole("button", { name: "Continue with Apple" }).click();
    await completeWa5(page);
    expect(resolutions(api).every((search) => search === "")).toBe(true);
  });
});

test("a new visitor end to end: generic sign-up → WA5 → WA6 → Fighter → WF0 → WF1 → WF6 → home", async ({
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

  // SF-45 with no intent: role selection.
  await page.waitForURL((url) => url.pathname === ROUTE);
  await pick(page, "fighter");
  await cta(page).click();

  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/fighter");
  await expect(page.getByRole("heading", { level: 1, name: "Your fighter profile" })).toBeVisible();
  // Choosing created no Fighter profile: WF0 creates it on its first save.
  expect(api.state()).toBeUndefined();
  await page.getByLabel("Name", { exact: true }).fill("Alex K.");
  await page.getByRole("textbox", { name: "Username" }).fill("alex_k");
  await page.getByRole("combobox", { name: "Country" }).click();
  await page.getByRole("combobox", { name: "Search countries" }).fill("Poland");
  await page.keyboard.press("Enter");
  await page.getByLabel("City").fill("Warsaw");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your boxing profile" })).toBeVisible();
  await page.getByText("Competitive amateur").click();
  await page.getByText("Orthodox").click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "You’re in, Alex." })).toBeVisible();
  await page.getByRole("link", { name: "Go to my home" }).click();
  await page.waitForURL((url) => url.pathname === "/en/app/home");

  expect(writes(api).map((request) => `${request.method} ${request.path}`)).toEqual([
    "POST /api/auth/email/registrations",
    "POST /api/auth/email/registrations/verify",
    "PATCH /api/v1/me/account-profile",
    "POST /api/v1/me/account-profile/complete-registration",
    "PATCH /api/v1/me/fighter-profile",
    "PATCH /api/v1/me/fighter-profile",
    "POST /api/v1/me/fighter-profile/complete-onboarding",
  ]);
  // The only intent the resolver ever saw is the one the visitor chose.
  expect(new Set(resolutions(api).filter(Boolean))).toEqual(new Set(["?intent=fighter"]));
});

test("a completed Fighter signing in goes home: no repeated onboarding", async ({ page }) => {
  const api = await onboardingApi(page, { completed: true, fields: { display_name: "Alex K." } });
  await page.goto("/en/login");
  await page.waitForURL((url) => url.pathname === "/en/app/home");
  expect(writes(api)).toEqual([]);
});

// ── Geometry (Claude Design V78 WebRoleSelect, 1440 × 980) ──

async function expectFrame(page: Page, width: number) {
  await expectBox(page.locator("[data-role-selection]"), { x: 0, y: 0, w: width });
  await expectBox(page.locator("header").first(), { x: 0, y: 0, w: width, h: 72 });
  await expectBox(page.locator("header a").first(), { x: 56, h: 30 });
  const signOut = await box(page.getByRole("button", { name: "Sign out" }));
  expect(Math.abs(signOut.x + signOut.width - (width - 56))).toBeLessThanOrEqual(1);
  await expectBox(page.locator("[data-step-nav]"), { x: 64, y: 120, w: 250 });
  const formWidth = width - 128 - 250 - 320 - 80;
  await expectBox(page.locator("[data-onboarding-grid] > div").first(), {
    x: 354,
    y: 120,
    w: formWidth,
  });
  await expectBox(page.locator("[data-onboarding-grid] > aside"), {
    x: width - 64 - 320,
    y: 120,
    w: 320,
  });
  return formWidth;
}

const cards = (page: Page) => page.locator("[data-journey]");

test.describe("geometry at the artboard size (1440 × 980)", () => {
  test("WA6: frame, heading, the four 324 × 168 cards, hint, Continue and aside on the artboard", async ({
    page,
  }) => {
    await openWa6(page);
    await page.evaluate(() => document.fonts.ready);
    expect(await expectFrame(page, 1440)).toBe(662);
    await expectBox(page.locator("hgroup p").first(), { x: 354, y: 120 });
    await expectBox(heading(page), { x: 354, y: 141, h: 80 });
    expect(await heading(page).evaluate((el) => getComputedStyle(el).fontSize)).toBe("32px");
    // Two columns of 324, 14 apart; two rows of 168, 14 apart.
    const at: readonly (readonly [number, number])[] = [
      [354, 296],
      [692, 296],
      [354, 478],
      [692, 478],
    ];
    for (const [index, [x, y]] of at.entries()) {
      await expectBox(cards(page).nth(index), { x, y, w: 324, h: 168 });
      const card = cards(page).nth(index);
      await expectBox(card.locator("span[aria-hidden]").first(), {
        x: x + 19,
        y: y + 19,
        w: 42,
        h: 42,
      });
      await expectBox(card.locator("span.ml-auto"), { x: x + 285, y: y + 30, w: 20, h: 20 });
      expect(await card.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("20px");
    }
    // Notes (type-label-tight, 0.08em): one 14 px line each, the longest included.
    for (const intent of ["fighter", "coach", "gym", "sponsor"]) {
      await expectBox(page.locator(`#journey-${intent}-note`), { h: 14 });
    }
    await expectBox(page.locator("#journey-fighter-note"), { x: 373, y: 432 });
    await expectBox(page.getByText("Choose one to continue."), { x: 354, y: 668 });
    const action = await box(cta(page));
    expect(Math.abs(action.height - 48)).toBeLessThanOrEqual(1);
    expect(action.width).toBeGreaterThanOrEqual(120);
    expect(Math.abs(action.x + action.width - 1016)).toBeLessThanOrEqual(1);
    expect(Math.abs(action.y - 722)).toBeLessThanOrEqual(1);
    const account = page.locator("aside section");
    await expectBox(account, { x: 1056, y: 120, w: 320 });
    expect(await account.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("22px");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await expect(cta(page)).toBeInViewport();
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/production/wa6-1440x980.png" });
  });

  test("selected and hovered: the olive well, the filled tile and ring, the CTA names the journey", async ({
    page,
  }) => {
    await openWa6(page);
    const card = cards(page).first();
    const before = await card.evaluate((el) => getComputedStyle(el).borderColor);
    await card.hover();
    await expect
      .poll(() => card.evaluate((el) => getComputedStyle(el).borderColor))
      .not.toBe(before);
    await pick(page, "fighter");
    const styles = await card.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, border: s.borderColor };
    });
    const highlight = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--highlight").trim(),
    );
    expect(styles.background).not.toBe(before);
    expect(highlight).not.toBe("");
    await expect(cta(page)).toHaveText("Start fighter setup");
    await expect(page.getByText("Choose one to continue.")).toHaveCount(0);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/production/wa6-fighter-1440x980.png" });
  });
});

for (const [width, height] of [
  [1280, 720],
  [1366, 768],
  [1440, 980],
  [1512, 982],
  [1728, 1117],
  [1920, 1080],
] as const) {
  test.describe(`${width} × ${height}`, () => {
    test.use({ viewport: { width, height } });

    test("WA6: the same three columns and 2 × 2 cards, full-bleed, Continue reachable, no horizontal scroll", async ({
      page,
    }) => {
      await openWa6(page);
      const formWidth = await expectFrame(page, width);
      const half = (formWidth - 14) / 2;
      await expectBox(cards(page).nth(0), { x: 354, w: half });
      await expectBox(cards(page).nth(1), { x: 354 + half + 14, w: half });
      const action = await box(cta(page));
      expect(Math.abs(action.x + action.width - (354 + formWidth))).toBeLessThanOrEqual(1);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await pick(page, "sponsor");
      await cta(page).scrollIntoViewIfNeeded();
      await expect(cta(page)).toBeInViewport();
      await page.screenshot({
        path: `test-results/production/wa6-${width}x${height}.png`,
        fullPage: true,
      });
    });
  });
}

test.describe("narrow (390 × 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("WA6 stacks into one column: four cards, nothing clipped, no horizontal scroll", async ({
    page,
  }) => {
    await openWa6(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const first = await box(cards(page).nth(0));
    const second = await box(cards(page).nth(1));
    expect(Math.abs(first.x - second.x)).toBeLessThanOrEqual(1);
    expect(second.y).toBeGreaterThan(first.y + first.height);
    expect(first.x + first.width).toBeLessThanOrEqual(390);
    await pick(page, "gym");
    await cta(page).scrollIntoViewIfNeeded();
    await expect(cta(page)).toBeInViewport();
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/production/wa6-390x844.png", fullPage: true });
  });
});
