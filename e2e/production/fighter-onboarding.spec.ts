import { expect, test, type Page } from "@playwright/test";

import { fighterApi } from "./onboarding-api";

/*
 * Fighter web registration on the production build (SF-38): the real route
 * (`/app/onboarding/fighter`), its gates and components against a test double
 * of the SF-25 API (./onboarding-api). Every assertion about persistence reads
 * what the page sent or what the double stored, never client state.
 */

test.use({ viewport: { width: 1440, height: 980 } });

const ROUTE = "/en/app/onboarding/fighter";
const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
/** Writes to the API, the session refresh aside. */
const writes = (api: Awaited<ReturnType<typeof fighterApi>>) =>
  api.requests.filter(
    (request) => request.method !== "GET" && request.path !== "/api/auth/session/refresh",
  );

async function fillBasics(page: Page, { country = "Poland" } = {}) {
  await page.getByLabel("Name", { exact: true }).fill("Alex K.");
  await page.getByRole("textbox", { name: "Username" }).fill("alex_k");
  await page.getByRole("combobox", { name: "Country" }).click();
  await page.getByRole("combobox", { name: "Search countries" }).fill(country);
  await page.keyboard.press("Enter");
  await page.getByLabel("City").fill("Warsaw");
}

test("a new Fighter: WF0 → WF1 → complete → WF6 → home, every value saved through the API", async ({
  page,
}) => {
  const api = await fighterApi(page);
  await page.goto(`${ROUTE}?intent=fighter`);
  // No profile yet (not_started): Profile basics, with the step and intent in the URL.
  await expect(heading(page, "Your fighter profile")).toBeVisible();
  await expect(page).toHaveURL(/step=basics/);
  await expect(page).toHaveURL(/intent=fighter/);
  expect(api.state()).toBeUndefined();

  await fillBasics(page);
  await expect(page.locator("[data-profile-preview]")).toContainText("Alex K.");
  await expect(page.locator("[data-profile-preview]")).toContainText("@alex_k · Warsaw");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Your boxing profile")).toBeVisible();
  await expect(heading(page, "Your boxing profile")).toBeFocused();
  // The first save creates the profile with the ISO code, not the label.
  expect(writes(api)[0]).toMatchObject({
    method: "PATCH",
    body: { display_name: "Alex K.", username: "alex_k", country_code: "PL", city: "Warsaw" },
  });

  await page.getByText("Competitive amateur").click();
  await page.getByText("Orthodox").click();
  await page.getByLabel("Amateur bouts · optional").fill("14");
  await page.getByText("Improve technique").click();
  await page.getByText("Competition", { exact: true }).click();
  await page.getByLabel("Current weight · optional").fill("73.8");
  await page.getByLabel("Height · optional").fill("178");
  await page.getByLabel("Next fight event · optional").fill("Warsaw Cup");
  await page.getByRole("button", { name: "Finish" }).click();

  await expect(heading(page, "You’re in, Alex.")).toBeVisible();
  await expect(page).toHaveURL(/step=complete/);
  const sent = writes(api);
  expect(sent.at(-2)).toMatchObject({
    method: "PATCH",
    body: {
      experience_level: "competitive_amateur",
      stance: "orthodox",
      amateur_bout_count: 14,
      goals: ["improve_technique", "competition"],
      current_weight_kg: 73.8,
      height_cm: 178,
      next_fight_name: "Warsaw Cup",
    },
  });
  // Only what was changed is sent: the untouched date stays out of the PATCH.
  expect(sent.at(-2)?.body).not.toHaveProperty("next_fight_on");
  expect(sent.at(-1)).toMatchObject({
    method: "POST",
    path: "/api/v1/me/fighter-profile/complete-onboarding",
  });
  expect(api.state()?.onboarding.status).toBe("completed");
  await expect(page.getByText("@alex_k · Warsaw · Competitive amateur · Orthodox")).toBeVisible();

  // Home goes through the application entry: the resolver sends a completed Fighter home.
  await page.getByRole("link", { name: "Go to my home" }).click();
  await page.waitForURL("**/en/app/home");
  // Nothing but the Fighter profile was written: no gym, coach, notification or workspace data.
  expect(new Set(writes(api).map((request) => request.path))).toEqual(
    new Set(["/api/v1/me/fighter-profile", "/api/v1/me/fighter-profile/complete-onboarding"]),
  );
});

test("WF0 checks its requirements before saving, and nothing is sent", async ({ page }) => {
  const api = await fighterApi(page);
  await page.goto(ROUTE);
  await expect(heading(page, "Your fighter profile")).toBeVisible();
  await page.getByRole("textbox", { name: "Username" }).fill("_alex");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Check the highlighted fields.")).toBeVisible();
  await expect(page.getByText("Enter your name.")).toBeVisible();
  await expect(
    page.getByText("Use 3–30 letters, digits or _, starting and ending with a letter or digit."),
  ).toBeVisible();
  await expect(page.getByText("Select your country.")).toBeVisible();
  await expect(page.getByText("Enter your city.")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Name", { exact: true })).toHaveAttribute("aria-invalid", "true");
  expect(writes(api)).toEqual([]);
});

test("a taken username keeps every value, marks the field and is fixed in place", async ({
  page,
}) => {
  const api = await fighterApi(page, { taken: ["alex_k"] });
  await page.goto(ROUTE);
  await fillBasics(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That username is taken. Try another.")).toBeVisible();
  await expect(heading(page, "Your fighter profile")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Alex K.");
  await expect(page.getByLabel("City")).toHaveValue("Warsaw");
  await expect(page.getByRole("combobox", { name: "Country" })).toHaveText(/Poland/);
  const username = page.getByRole("textbox", { name: "Username" });
  await expect(username).toBeFocused();
  // The rejected request changed nothing on the server.
  expect(api.state()).toBeUndefined();
  await username.fill("alex_k2");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Your boxing profile")).toBeVisible();
  expect(api.state()).toMatchObject({ username: "alex_k2" });
});

test("a partial save survives a reload; Back keeps saved values", async ({ page }) => {
  const api = await fighterApi(page);
  await page.goto(ROUTE);
  await fillBasics(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Your boxing profile")).toBeVisible();
  await page.getByText("Southpaw").click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(heading(page, "Your fighter profile")).toBeVisible();
  // Back saved the change before leaving.
  expect(api.state()).toMatchObject({ stance: "southpaw" });

  await page.reload();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Alex K.");
  await expect(page.getByRole("textbox", { name: "Username" })).toHaveValue("alex_k");
  await page.goto(`${ROUTE}?step=profile`);
  await expect(page.getByRole("radio", { name: "Southpaw" })).toBeChecked();
});

test("a weight with two decimals is rejected by the API, never rounded", async ({ page }) => {
  const api = await fighterApi(page, {
    fields: { display_name: "Alex K.", username: "alex_k", country_code: "PL", city: "Warsaw" },
  });
  await page.goto(`${ROUTE}?step=profile`);
  await page.getByText("Amateur", { exact: true }).click();
  await page.getByText("Orthodox").click();
  await page.getByLabel("Current weight · optional").fill("73.85");
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("Use at most one decimal place, like 73.8.")).toBeVisible();
  await expect(page.getByLabel("Current weight · optional")).toHaveValue("73.85");
  expect(writes(api).at(-1)).toMatchObject({ body: { current_weight_kg: 73.85 } });
  expect(api.state()?.onboarding.status).toBe("in_progress");
  expect(writes(api).some((request) => request.path.endsWith("complete-onboarding"))).toBe(false);
});

test("Finish with a missing requirement stays on WF1 with the backend's list", async ({ page }) => {
  const api = await fighterApi(page, {
    fields: { display_name: "Alex K.", username: "alex_k", country_code: "PL", city: null },
  });
  await page.goto(`${ROUTE}?step=profile`);
  await page.getByText("Recreational").click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("A few details are still missing.")).toBeVisible();
  await expect(page.getByText("Profile basics: City · Boxing profile: Stance")).toBeVisible();
  await expect(page.getByText("Choose one to finish.")).toBeVisible();
  expect(api.state()?.onboarding.status).toBe("in_progress");
  await page.getByRole("button", { name: "Go to Profile basics" }).click();
  await expect(heading(page, "Your fighter profile")).toBeVisible();
});

test("optional fields stay optional: Finish with the requirements only", async ({ page }) => {
  const api = await fighterApi(page, {
    fields: { display_name: "Alex K.", username: "alex_k", country_code: "PL", city: "Warsaw" },
  });
  await page.goto(`${ROUTE}?step=profile`);
  await page.getByText("New to boxing").click();
  await page.getByText("Switch").click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(heading(page, "You’re in, Alex.")).toBeVisible();
  expect(api.state()).toMatchObject({
    amateur_bout_count: null,
    current_weight_kg: null,
    goals: [],
    onboarding: { status: "completed" },
  });
});

test("a network failure keeps the form and Retry repeats the save", async ({ page }) => {
  const api = await fighterApi(page);
  await page.goto(ROUTE);
  await fillBasics(page);
  api.failWrites(1);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("We couldn’t save your changes.")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Alex K.");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(heading(page, "Your boxing profile")).toBeVisible();
  expect(api.state()).toMatchObject({ city: "Warsaw" });
});

test("completion before account registration: the account notice, no completion", async ({
  page,
}) => {
  const api = await fighterApi(page, {
    accountComplete: false,
    fields: {
      display_name: "Alex K.",
      username: "alex_k",
      country_code: "PL",
      city: "Warsaw",
      experience_level: "amateur",
      stance: "orthodox",
    },
  });
  // The onboarding gate sends an incomplete account to WA5 first; here the
  // resolver reports the Fighter step, so the completion call itself is refused.
  await page.route(
    (url) => url.pathname === "/api/v1/me/entry",
    (call) =>
      call.fulfill({
        json: {
          entry: {
            account_registration: "complete",
            capabilities: [],
            destination: "fighter_onboarding",
            fighter_profile: "in_progress",
            intent: null,
            mandatory: true,
            reason: "fixture",
          },
        },
      }),
  );
  await page.goto(`${ROUTE}?step=profile&intent=fighter`);
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("Finish your account basics first.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Account basics" })).toHaveAttribute(
    "href",
    "/en/app/onboarding/account?intent=fighter",
  );
  expect(api.state()?.onboarding.status).toBe("in_progress");
});

test("a profile started on mobile resumes on the web at the first missing step", async ({
  page,
}) => {
  await fighterApi(page, {
    fields: {
      display_name: "Alex K.",
      username: "alex_k",
      country_code: "PL",
      city: "Warsaw",
      experience_level: "competitive_amateur",
      goals: ["competition"],
    },
  });
  await page.goto(ROUTE);
  await expect(heading(page, "Your boxing profile")).toBeVisible();
  await expect(page).toHaveURL(/step=profile/);
  await expect(page.getByRole("radio", { name: "Competitive amateur" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Competition" })).toBeChecked();
  await expect(page.getByRole("button", { name: /Profile basics/ })).toContainText("done");
});

test.describe("a completed Fighter", () => {
  for (const query of ["", "?step=basics", "?step=profile", "?step=complete"]) {
    test(`never restarts onboarding (${query || "no step"}): out through /app to home`, async ({
      page,
    }) => {
      await fighterApi(page, {
        completed: true,
        fields: {
          display_name: "Alex K.",
          username: "alex_k",
          country_code: "PL",
          city: "Warsaw",
          experience_level: "amateur",
          stance: "orthodox",
        },
      });
      await page.goto(`${ROUTE}${query}`);
      await page.waitForURL("**/en/app/home");
      await expect(heading(page, "You’re in, Alex.")).toHaveCount(0);
    });
  }
});

test("?step=complete on an unfinished profile never fakes success", async ({ page }) => {
  const api = await fighterApi(page, { fields: { display_name: "Alex K." } });
  await page.goto(`${ROUTE}?step=complete`);
  await expect(heading(page, "Your fighter profile")).toBeVisible();
  await expect(page).toHaveURL(/step=basics/);
  expect(writes(api)).toEqual([]);
});

test("double-clicking Finish completes once", async ({ page }) => {
  const api = await fighterApi(page, {
    fields: {
      display_name: "Alex K.",
      username: "alex_k",
      country_code: "PL",
      city: "Warsaw",
      experience_level: "amateur",
      stance: "orthodox",
    },
  });
  await page.goto(`${ROUTE}?step=profile`);
  await page.getByRole("button", { name: "Finish" }).dblclick();
  await expect(heading(page, "You’re in, Alex.")).toBeVisible();
  expect(
    api.requests.filter((request) => request.path.endsWith("complete-onboarding")),
  ).toHaveLength(1);
});

test("Save & exit saves the edits and leaves for the public site", async ({ page }) => {
  const api = await fighterApi(page);
  await page.goto(ROUTE);
  await page.getByLabel("Name", { exact: true }).fill("Alex K.");
  await page.getByRole("button", { name: "Save & exit" }).click();
  await page.waitForURL((url) => url.pathname === "/en");
  expect(api.state()).toMatchObject({
    display_name: "Alex K.",
    onboarding: { status: "in_progress" },
  });
});

test("an expired session goes to sign-in, keeping the Fighter journey", async ({ page }) => {
  const api = await fighterApi(page);
  await page.goto(ROUTE);
  await expect(heading(page, "Your fighter profile")).toBeVisible();
  api.expire();
  await page.getByLabel("Name", { exact: true }).fill("Alex K.");
  await fillBasics(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => url.pathname === "/en/login");
  expect(new URL(page.url()).searchParams.get("intent")).toBe("fighter");
});

test("display_name and weight_class round-trip: sent under their SF-25 names, restored after a reload", async ({
  page,
}) => {
  const api = await fighterApi(page);
  await page.goto(ROUTE);
  await fillBasics(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Your boxing profile")).toBeVisible();
  // Weight class: the private `weight_class` enum, chosen from its select.
  await page.getByRole("combobox", { name: "Weight class · private" }).click();
  await page.getByRole("option", { name: "−75 kg" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(heading(page, "Your fighter profile")).toBeVisible();

  const bodies = writes(api).map((request) => request.body as Record<string, unknown>);
  expect(bodies[0]).toMatchObject({ display_name: "Alex K." });
  expect(bodies[0]).not.toHaveProperty("name");
  expect(bodies.at(-1)).toMatchObject({ weight_class: "minus_75" });
  expect(api.state()).toMatchObject({ display_name: "Alex K.", weight_class: "minus_75" });

  await page.goto(`${ROUTE}?step=profile`);
  await expect(page.getByRole("combobox", { name: "Weight class · private" })).toHaveText(/−75 kg/);
  await page.goto(`${ROUTE}?step=basics`);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Alex K.");
});

test.describe("concurrent clients (SF-27)", () => {
  const SAVED = {
    display_name: "Alex K.",
    username: "alex_k",
    country_code: "PL",
    city: "Warsaw",
    experience_level: "amateur",
    height_cm: 178,
  };

  test("a save sends only what this page changed: another client's newer values survive", async ({
    page,
  }) => {
    const api = await fighterApi(page, { fields: SAVED });
    await page.goto(`${ROUTE}?step=profile`);
    await expect(heading(page, "Your boxing profile")).toBeVisible();
    await page.getByText("Southpaw").click();
    // Meanwhile the mobile app saves the height and the city.
    api.externalUpdate({ height_cm: 181, city: "Kraków" });
    await page.getByRole("button", { name: "Back" }).click();
    await expect(heading(page, "Your fighter profile")).toBeVisible();

    expect(writes(api).at(-1)?.body).toEqual({ stance: "southpaw" });
    expect(api.state()).toMatchObject({ stance: "southpaw", height_cm: 181, city: "Kraków" });
    // And the page now shows the newest backend values.
    await expect(page.getByLabel("City")).toHaveValue("Kraków");
  });

  test("an untouched field takes another client's newer value while you edit a different one", async ({
    page,
  }) => {
    const api = await fighterApi(page, { fields: SAVED });
    await page.goto(`${ROUTE}?step=basics`);
    await page.getByLabel("Name", { exact: true }).fill("Alex Kowalski");
    api.externalUpdate({ city: "Gdańsk" });
    // Focus returning to the tab refetches the profile (TanStack Query).
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByLabel("City")).toHaveValue("Gdańsk");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Alex Kowalski");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(heading(page, "Your boxing profile")).toBeVisible();
    expect(writes(api).at(-1)?.body).toEqual({ display_name: "Alex Kowalski" });
    expect(api.state()).toMatchObject({ display_name: "Alex Kowalski", city: "Gdańsk" });
  });

  test("a profile completed in another tab sends this tab home on its next look", async ({
    page,
  }) => {
    const api = await fighterApi(page, { fields: { ...SAVED, stance: "orthodox" } });
    await page.goto(`${ROUTE}?step=profile`);
    await expect(heading(page, "Your boxing profile")).toBeVisible();
    // Tab B finishes onboarding; this tab still shows WF1.
    api.completeExternally();
    // Returning to this tab refetches the profile: completed, so it leaves for home
    // (never WF6, which only the completing tab shows).
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await page.waitForURL("**/en/app/home");
    expect(writes(api)).toEqual([]);
  });
});

test.describe("entry and resume boundaries (SF-27)", () => {
  test("account registration incomplete: the onboarding gate sends the visitor to account basics, keeping the Fighter intent", async ({
    page,
  }) => {
    const api = await fighterApi(page, { accountComplete: false });
    await page.goto(`${ROUTE}?step=basics&intent=fighter`);
    await page.waitForURL("**/en/app/onboarding/account?intent=fighter");
    // WA5 (SF-46): the account basics form, nothing written on arrival.
    await expect(heading(page, "Before you start")).toBeVisible();
    expect(writes(api)).toEqual([]);
  });

  test("Save & exit, then a later visit resumes from the saved profile", async ({ page }) => {
    const api = await fighterApi(page);
    await page.goto(ROUTE);
    await page.getByLabel("Name", { exact: true }).fill("Alex K.");
    await page.getByRole("textbox", { name: "Username" }).fill("alex_k");
    await page.getByRole("button", { name: "Save & exit" }).click();
    await page.waitForURL((url) => url.pathname === "/en");
    expect(api.state()).toMatchObject({ display_name: "Alex K.", username: "alex_k" });
    // Coming back (another day, another tab): the resolver's step, the saved values.
    await page.goto(ROUTE);
    await expect(heading(page, "Your fighter profile")).toBeVisible();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Alex K.");
    await expect(page.getByRole("textbox", { name: "Username" })).toHaveValue("alex_k");
  });

  test("Save & exit that fails stays put: no navigation, no false success", async ({ page }) => {
    const api = await fighterApi(page);
    await page.goto(ROUTE);
    await page.getByLabel("Name", { exact: true }).fill("Alex K.");
    api.failWrites(1);
    await page.getByRole("button", { name: "Save & exit" }).click();
    await expect(page.getByText("We couldn’t save your changes.")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/en/app/onboarding/fighter");
    expect(api.state()).toBeUndefined();
  });

  test("a boxing value the API rejects (invalid_choice) is marked on its field", async ({
    page,
  }) => {
    await fighterApi(page, {
      fields: { display_name: "Alex K.", username: "alex_k", country_code: "PL", city: "Warsaw" },
    });
    await page.route(
      (url) => url.pathname === "/api/v1/me/fighter-profile",
      (call) =>
        call.request().method() === "PATCH"
          ? call.fulfill({
              status: 422,
              json: {
                error: {
                  code: "validation_error",
                  message: "",
                  details: {
                    fields: { stance: ["is invalid"] },
                    field_codes: { stance: ["invalid_choice"] },
                  },
                  request_id: null,
                },
              },
            })
          : call.fallback(),
    );
    await page.goto(`${ROUTE}?step=profile`);
    await page.getByText("Southpaw").click();
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByText("Choose one of the options.")).toBeVisible();
    await expect(page.getByText("Check the highlighted fields.")).toBeVisible();
  });
});
