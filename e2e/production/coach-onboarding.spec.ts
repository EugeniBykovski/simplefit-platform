import { expect, test, type Page } from "@playwright/test";

import { onboardingApi, type OnboardingApi } from "./onboarding-api";

/*
 * Coach web registration on the production build (SF-52): the real route
 * (`/app/onboarding/coach`), its gates and components against a test double
 * of the SF-50 CoachProfile and SF-51 entry APIs (./onboarding-api). Every
 * assertion about persistence reads what the page sent or what the double
 * stored, never client state.
 */

test.use({ viewport: { width: 1440, height: 980 } });

const ROUTE = "/en/app/onboarding/coach";
const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
/** Writes to the API, the session refresh aside. */
const writes = (api: OnboardingApi) =>
  api.requests.filter(
    (request) => request.method !== "GET" && request.path !== "/api/auth/session/refresh",
  );
const PROFILE = { display_name: "Coach Alex", country_code: "PL", city: "Warsaw" };
const FIGHTER = {
  display_name: "Alex K.",
  username: "alex_k",
  country_code: "PL",
  city: "Warsaw",
  experience_level: "amateur",
  stance: "orthodox",
};

async function pickCountry(page: Page, country: string) {
  await page.getByRole("combobox", { name: "Country" }).click();
  await page.getByRole("combobox", { name: "Search countries" }).fill(country);
  await page.keyboard.press("Enter");
}

test("a new Coach: WCR1 → WCR2 → complete → WCR7 → Coach home, every value saved through the API", async ({
  page,
}) => {
  const api = await onboardingApi(page);
  await page.goto(`${ROUTE}?intent=coach`);
  await expect(heading(page, "Your coach profile")).toBeVisible();
  await expect(page).toHaveURL(/step=profile/);
  await expect(page).toHaveURL(/intent=coach/);
  expect(api.coach()).toBeUndefined();

  // The account name is offered as an editable suggestion, nothing is saved yet.
  const name = page.getByRole("textbox", { name: "Coach name" });
  await expect(name).toHaveValue("Alex Kowalski");
  await expect(
    page.getByText("Suggested from your account name. Change it if you coach under another name."),
  ).toBeVisible();
  expect(writes(api)).toEqual([]);

  await name.fill("Coach Alex");
  await page.getByLabel("Brand name · optional").fill("Alex Boxing");
  await pickCountry(page, "Poland");
  await page.getByLabel("City").fill("Warsaw");
  await page.getByLabel("Bio · optional").fill("Footwork first.\nTen-week camps.");
  await page.getByText("Polski", { exact: true }).click();
  await page.getByText("English", { exact: true }).click();
  const preview = page.locator("[data-coach-preview]");
  await expect(preview).toContainText("Coach Alex");
  await expect(preview).toContainText("Alex Boxing · Warsaw, Poland");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(heading(page, "How do you coach?")).toBeVisible();
  await expect(heading(page, "How do you coach?")).toBeFocused();
  await expect(page).toHaveURL(/step=type/);
  expect(writes(api)[0]).toMatchObject({
    method: "PATCH",
    path: "/api/v1/me/coach-profile",
    body: {
      display_name: "Coach Alex",
      brand_name: "Alex Boxing",
      country_code: "PL",
      city: "Warsaw",
      bio: "Footwork first.\nTen-week camps.",
      languages: ["en", "pl"],
    },
  });

  await page.getByText("Personal Training").click();
  await page.getByText("Fight Camps").click();
  await page.getByText("Amateur", { exact: true }).click();
  await expect(preview).toContainText("Personal Training · Fight Camps · Amateur");
  await page.getByRole("button", { name: "Finish" }).click();

  await expect(heading(page, "Your coach profile is ready.")).toBeVisible();
  await expect(page).toHaveURL(/step=complete/);
  const sent = writes(api);
  expect(sent.at(-2)).toMatchObject({
    method: "PATCH",
    body: {
      coaching_formats: ["personal_training", "fight_camps"],
      competition_levels: ["amateur"],
    },
  });
  expect(sent.at(-1)).toMatchObject({
    method: "POST",
    path: "/api/v1/me/coach-profile/complete-onboarding",
  });
  expect(api.coach()?.onboarding.status).toBe("completed");
  // Truthful: no Coach workspace is promised.
  await expect(page.getByText("Coach tools are not available yet.")).toBeVisible();
  const card = page.locator("[data-coach-card]");
  await expect(card).toContainText("Personal Training · Fight Camps");
  await expect(card).toContainText("English · Polski");

  // Continue: the explicit Coach context choice, then the entry resolver.
  await page.getByRole("button", { name: "Continue to coach home" }).click();
  await page.waitForURL("**/en/app/coach");
  expect(api.lastContext()).toBe("coach");
  await expect(page.getByText("Planned")).toBeVisible();
  // Only the Coach profile and the context choice were written: never the account.
  expect(new Set(writes(api).map((request) => request.path))).toEqual(
    new Set([
      "/api/v1/me/coach-profile",
      "/api/v1/me/coach-profile/complete-onboarding",
      "/api/v1/me/entry/context",
    ]),
  );
  expect(api.account().full_name).toBe("Alex Kowalski");
});

test("continuing with the suggestion saves it as the coach name, never touching the account", async ({
  page,
}) => {
  const api = await onboardingApi(page);
  await page.goto(ROUTE);
  await pickCountry(page, "Poland");
  await page.getByLabel("City").fill("Warsaw");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "How do you coach?")).toBeVisible();
  expect(writes(api)).toEqual([
    expect.objectContaining({
      path: "/api/v1/me/coach-profile",
      body: { display_name: "Alex Kowalski", country_code: "PL", city: "Warsaw" },
    }),
  ]);
});

test("a saved coach name is never replaced by the account name", async ({ page }) => {
  await onboardingApi(page, { coachFields: { display_name: "Coach Alex" } });
  await page.goto(`${ROUTE}?step=profile`);
  await expect(page.getByRole("textbox", { name: "Coach name" })).toHaveValue("Coach Alex");
  await expect(page.getByText("Shown to fighters. Up to 60 characters.")).toBeVisible();
});

test("WCR1 checks its requirements before saving, and nothing is sent", async ({ page }) => {
  const api = await onboardingApi(page, { account: { full_name: null, completed: true } });
  await page.goto(ROUTE);
  await expect(page.getByRole("textbox", { name: "Coach name" })).toHaveValue("");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Check the highlighted fields.")).toBeVisible();
  await expect(page.getByText("Enter your coach name.")).toBeVisible();
  await expect(page.getByText("Select your country.")).toBeVisible();
  await expect(page.getByText("Enter your city.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Coach name" })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Coach name" })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(writes(api)).toEqual([]);
});

test("WCR2 needs a format; competition levels stay optional", async ({ page }) => {
  const api = await onboardingApi(page, { coachFields: PROFILE });
  await page.goto(`${ROUTE}?step=type`);
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("Pick at least one format.")).toBeVisible();
  expect(writes(api)).toEqual([]);
  await page.getByText("Group Coaching").click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(heading(page, "Your coach profile is ready.")).toBeVisible();
  expect(api.coach()).toMatchObject({
    coaching_formats: ["group_coaching"],
    competition_levels: [],
  });
});

test("a profile started on mobile resumes at the first missing step; Back keeps saved values", async ({
  page,
}) => {
  const api = await onboardingApi(page, { coachFields: { ...PROFILE, languages: ["pl"] } });
  await page.goto(ROUTE);
  // Only the formats are missing: WCR2.
  await expect(heading(page, "How do you coach?")).toBeVisible();
  await expect(page).toHaveURL(/step=type/);
  await page.getByText("Online Coaching").click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(heading(page, "Your coach profile")).toBeVisible();
  expect(api.coach()).toMatchObject({ coaching_formats: ["online_coaching"] });
  await expect(page.getByRole("textbox", { name: "Coach name" })).toHaveValue("Coach Alex");
  await expect(page.getByLabel("City")).toHaveValue("Warsaw");
  await expect(page.getByRole("combobox", { name: "Country" })).toHaveText(/Poland/);
  // A reload resumes from the backend, not from anything kept in the page.
  await page.reload();
  await expect(heading(page, "Your coach profile")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Coach name" })).toHaveValue("Coach Alex");
});

test("another client's newer value is reconciled, and only this page's edits are sent", async ({
  page,
}) => {
  const api = await onboardingApi(page, { coachFields: PROFILE });
  await page.goto(`${ROUTE}?step=profile`);
  await page.getByLabel("Brand name · optional").fill("Alex Boxing");
  // The mobile app changes the city meanwhile; the page refetches on focus.
  api.externalCoachUpdate({ city: "Kraków" });
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByLabel("City")).toHaveValue("Kraków");
  await expect(page.getByLabel("Brand name · optional")).toHaveValue("Alex Boxing");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "How do you coach?")).toBeVisible();
  expect(writes(api).at(-1)?.body).toEqual({ brand_name: "Alex Boxing" });
  expect(api.coach()).toMatchObject({ city: "Kraków", brand_name: "Alex Boxing" });
});

test("Finish with Coach profile details missing lists them with a way back", async ({ page }) => {
  const api = await onboardingApi(page, {
    coachFields: {
      display_name: "Coach Alex",
      country_code: "PL",
      coaching_formats: ["fight_camps"],
    },
  });
  await page.goto(`${ROUTE}?step=type`);
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("Your coach profile is missing details.")).toBeVisible();
  await expect(page.getByText("Add your city to finish.")).toBeVisible();
  expect(api.coach()?.onboarding.status).toBe("in_progress");
  await page.getByRole("button", { name: "Go to Coach profile" }).click();
  await expect(heading(page, "Your coach profile")).toBeVisible();
});

test("a network failure keeps the form and Retry repeats the save", async ({ page }) => {
  const api = await onboardingApi(page, { coachFields: PROFILE });
  await page.goto(`${ROUTE}?step=profile`);
  api.failWrites(1);
  await page.getByLabel("City").fill("Gdańsk");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("We couldn’t save your changes.")).toBeVisible();
  await expect(page.getByLabel("City")).toHaveValue("Gdańsk");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(heading(page, "How do you coach?")).toBeVisible();
  expect(api.coach()).toMatchObject({ city: "Gdańsk" });
});

test("completion before account registration shows the account notice and completes nothing", async ({
  page,
}) => {
  const api = await onboardingApi(page, {
    coachFields: { ...PROFILE, coaching_formats: ["fight_camps"] },
  });
  // Registration is complete for the gate, then withdrawn on the server (another client).
  await page.goto(`${ROUTE}?step=type`);
  await expect(heading(page, "How do you coach?")).toBeVisible();
  await page.route("**/api/v1/me/coach-profile/complete-onboarding", (call) =>
    call.fulfill({
      status: 422,
      json: {
        error: {
          code: "validation_error",
          message: "",
          details: { fields: {}, field_codes: { account_registration: ["required"] } },
          request_id: null,
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("Finish your account basics first.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Account basics" })).toHaveAttribute(
    "href",
    /\/en\/app\/onboarding\/account\?intent=coach/,
  );
  expect(api.coach()?.onboarding.status).toBe("in_progress");
});

test("WCR7 shows only after backend completion: deep links and FUTURE steps never fake it", async ({
  page,
}) => {
  await onboardingApi(page, { coachFields: PROFILE });
  for (const step of ["complete", "credentials", "size", "gym", "plan"]) {
    await page.goto(`${ROUTE}?step=${step}`);
    await expect(heading(page, "How do you coach?")).toBeVisible();
    await expect(page).toHaveURL(/step=type/);
  }
});

test("a completed Coach opening registration goes to Coach home through the entry", async ({
  page,
}) => {
  const api = await onboardingApi(page, {
    coachFields: { ...PROFILE, coaching_formats: ["fight_camps"] },
    coachCompleted: true,
  });
  await page.goto(`${ROUTE}?step=complete`);
  await page.waitForURL("**/en/app/coach");
  expect(writes(api)).toEqual([]);
});

test("double-clicking Finish completes once", async ({ page }) => {
  const api = await onboardingApi(page, {
    coachFields: { ...PROFILE, coaching_formats: ["fight_camps"] },
  });
  await page.goto(`${ROUTE}?step=type`);
  await page.getByRole("button", { name: "Finish" }).dblclick();
  await expect(heading(page, "Your coach profile is ready.")).toBeVisible();
  expect(
    writes(api).filter((request) => request.path.endsWith("/complete-onboarding")),
  ).toHaveLength(1);
});

test("WCR7: a failed context choice keeps the visitor there; Try again continues", async ({
  page,
}) => {
  const api = await onboardingApi(page, {
    coachFields: { ...PROFILE, coaching_formats: ["fight_camps"] },
  });
  await page.goto(`${ROUTE}?step=type`);
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(heading(page, "Your coach profile is ready.")).toBeVisible();
  api.failContext(1);
  await page.getByRole("button", { name: "Continue to coach home" }).click();
  await expect(page.getByText("We couldn’t open your coach home.")).toBeVisible();
  expect(api.lastContext()).toBeUndefined();
  await page.getByRole("button", { name: "Try again" }).click();
  await page.waitForURL("**/en/app/coach");
  expect(api.lastContext()).toBe("coach");
});

test("Save & exit saves the edits and leaves for the public site", async ({ page }) => {
  const api = await onboardingApi(page, { coachFields: PROFILE });
  await page.goto(`${ROUTE}?step=profile`);
  await page.getByLabel("Bio · optional").fill("Southpaw specialist.");
  await page.getByRole("button", { name: "Save & exit" }).click();
  await page.waitForURL("**/en");
  expect(api.coach()).toMatchObject({ bio: "Southpaw specialist." });
});

test.describe("an existing Fighter becomes a Coach", () => {
  test("the Fighter profile is never written, and both workspaces stay open", async ({ page }) => {
    const api = await onboardingApi(page, { fields: FIGHTER, completed: true });
    await page.goto(`${ROUTE}?intent=coach`);
    await expect(heading(page, "Your coach profile")).toBeVisible();
    await page.getByRole("textbox", { name: "Coach name" }).fill("Coach Alex");
    await pickCountry(page, "Poland");
    await page.getByLabel("City").fill("Warsaw");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Personal Training").click();
    await page.getByRole("button", { name: "Finish" }).click();
    await page.getByRole("button", { name: "Continue to coach home" }).click();
    await page.waitForURL("**/en/app/coach");
    // The Fighter area stays open to a Fighter whose last context is Coach.
    await page.goto("/en/app/home");
    await expect(page).toHaveURL(/\/en\/app\/home$/);
    expect(
      writes(api).filter((request) => request.path.startsWith("/api/v1/me/fighter-profile")),
    ).toEqual([]);
    expect(api.state()).toMatchObject({ display_name: "Alex K.", username: "alex_k" });
  });

  test("a Coach finishing Fighter onboarding goes to Fighter home, not Coach home", async ({
    page,
  }) => {
    await onboardingApi(page, {
      fields: { ...FIGHTER, stance: null },
      coachFields: { ...PROFILE, coaching_formats: ["fight_camps"] },
      coachCompleted: true,
      lastContext: "coach",
    });
    await page.goto("/en/app/onboarding/fighter?step=profile");
    await page.getByText("Orthodox").click();
    await page.getByRole("button", { name: "Finish" }).click();
    await page.getByRole("link", { name: "Go to my home" }).click();
    await page.waitForURL("**/en/app/home");
  });
});

test("the Coach area is closed to anyone without the COACH capability", async ({ page }) => {
  await onboardingApi(page, { fields: FIGHTER, completed: true });
  await page.goto("/en/app/coach");
  await page.waitForURL("**/en/app/home");
  await onboardingApi(page);
  await page.goto("/en/app/coach/fighters");
  await page.waitForURL(/\/en\/app\/onboarding\/role\?returnTo=%2Fapp%2Fcoach%2Ffighters/);
});
