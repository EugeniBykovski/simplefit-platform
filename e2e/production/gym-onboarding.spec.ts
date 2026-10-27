import { expect, test, type Page } from "@playwright/test";

import { gymApi, type GymApi } from "./gym-api";
import { onboardingApi } from "./onboarding-api";

/*
 * Gym owner web registration on the production build (SF-86): the real
 * route (`/app/onboarding/gym`), its gates and components against test
 * doubles of the SF-83 / SF-84 / SF-85 APIs (./gym-api over
 * ./onboarding-api). Every assertion about persistence reads what the page
 * sent or what the double stored, never client state.
 */

test.use({ viewport: { width: 1440, height: 900 } });

const ROUTE = "/en/app/onboarding/gym";
const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
const writes = (api: GymApi) =>
  api.requests.filter((request) => request.method !== "GET" && request.path !== "/api/v1/me/entry");
const LOCATION = {
  id: "loc-1",
  name: "Warsaw",
  country_code: "PL",
  city: "Warsaw",
  address_line: "ul. Ząbkowska 31",
  entrance_note: null,
  is_primary: true,
};

async function start(page: Page, options: Parameters<typeof gymApi>[1] = {}) {
  await onboardingApi(page);
  return gymApi(page, options);
}

async function pickCountry(page: Page, country: string) {
  await page.getByRole("combobox", { name: "Country" }).click();
  await page.getByRole("combobox", { name: "Search countries" }).fill(country);
  await page.keyboard.press("Enter");
}

async function fillOg1(page: Page, name = "Simple Boxing Gym") {
  await page.getByRole("textbox", { name: "Gym name" }).fill(name);
  await page.getByText("Boxing gym", { exact: true }).click();
}

/** Business state lives in the API only: nothing gym-related in browser storage. */
async function expectNoStoredGymState(page: Page) {
  const stored = await page.evaluate(() =>
    [localStorage, sessionStorage].flatMap((storage) =>
      Object.keys(storage).map((key) => `${key}=${storage.getItem(key) ?? ""}`),
    ),
  );
  expect(stored.filter((entry) => /gym|client_request|revision/i.test(entry))).toEqual([]);
}

test("a new owner: OG1 → OG2 → OG3 → Create gym → OG6b → Go to gym, every value through the API", async ({
  page,
}) => {
  const api = await start(page);
  await page.goto(`${ROUTE}?intent=gym`);
  await expect(heading(page, "Gym name & type")).toBeVisible();
  await expect(page).toHaveURL(/step=type/);
  await expect(page).toHaveURL(/intent=gym/);
  expect(writes(api)).toEqual([]);

  // OG1: nothing is created until Continue, and nothing claimed before the API answers.
  await fillOg1(page);
  await page.getByLabel("Phone · optional").fill("+48 22 000 00 00");
  await page.getByLabel("Website · optional").fill("simpleboxing.pl");
  await expect(page.locator("[data-preview]").first()).toContainText("Simple Boxing Gym");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(heading(page, "Location")).toBeVisible();
  await expect(heading(page, "Location")).toBeFocused();
  await expect(page).toHaveURL(/step=location/);
  const [created, extra] = writes(api);
  expect(created).toMatchObject({
    method: "POST",
    path: "/api/v1/gyms",
    body: { name: "Simple Boxing Gym", gym_type: "boxing_gym" },
  });
  expect((created?.body as { client_request_id: string }).client_request_id).toMatch(
    /^[0-9a-f-]{36}$/,
  );
  expect(extra).toMatchObject({
    method: "PATCH",
    body: { phone: "+48 22 000 00 00", website: "https://simpleboxing.pl", expected_revision: 1 },
  });
  const gym = api.gyms()[0];
  expect(gym?.status).toBe("draft");
  await expect(page.locator("[data-setup-rail]")).toContainText("Simple Boxing Gym");

  // OG2: the one primary location, written whole with the revision.
  await pickCountry(page, "Poland");
  await page.getByLabel("City").fill("Warsaw");
  await page
    .getByRole("textbox", { name: "Address", exact: true })
    .fill("ul. Ząbkowska 31, 03-736");
  await page.getByLabel("Entrance note · optional").fill("Courtyard, 1st floor");
  await expect(page.getByRole("button", { name: /add another location/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(heading(page, "Branding")).toBeVisible();
  expect(writes(api).at(-1)).toMatchObject({
    method: "PUT",
    path: `/api/v1/gyms/${gym?.id}/setup/primary-location`,
    body: {
      country_code: "PL",
      city: "Warsaw",
      address_line: "ul. Ząbkowska 31, 03-736",
      entrance_note: "Courtyard, 1st floor",
      expected_revision: 2,
    },
  });

  // OG3: truthful Logo / Cover, no public URL, no verified or trial copy.
  await expect(
    page.getByText("Logo upload isn’t available yet. Your initials are used."),
  ).toBeVisible();
  await expect(page.getByText("Cover photo upload isn’t available yet.")).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByText(/sfit\.box|verified|trial/i)).toHaveCount(0);
  await page.getByRole("radio", { name: "Amber" }).check({ force: true });
  await page.getByLabel("Tagline · optional").fill("Boxing for everyone.");
  await page.getByRole("button", { name: "Create gym" }).click();

  await expect(heading(page, "Simple Boxing Gym is created.")).toBeVisible();
  await expect(page).toHaveURL(/step=complete/);
  const sent = writes(api);
  expect(sent.at(-2)).toMatchObject({
    method: "PATCH",
    body: { tagline: "Boxing for everyone.", accent_color: "#e3a24f", expected_revision: 3 },
  });
  expect(sent.at(-1)).toMatchObject({
    method: "POST",
    path: `/api/v1/gyms/${gym?.id}/complete-setup`,
  });
  expect(api.gyms()[0]?.status).toBe("completed");
  await expect(page.getByText(/trial|€|plan details/i)).toHaveCount(0);
  await expectNoStoredGymState(page);

  // Go to gym: the explicit Gym context choice, then the entry resolver.
  await page.getByRole("button", { name: "Go to gym" }).click();
  await page.waitForURL("**/en/app/gym");
  expect(api.lastGym()).toBe(gym?.id);
  expect(api.requests.find((request) => request.path === "/api/v1/me/entry/context")?.body).toEqual(
    { context: "gym", gym_id: gym?.id },
  );
});

test("resumes a draft from the backend at its first missing step, saved values in place", async ({
  page,
}) => {
  await start(page, {
    gyms: [
      { name: "Praga Boxing", gym_type: "boxing_club", phone: "+48 600 000 000", revision: 4 },
    ],
  });
  await page.goto(ROUTE);
  await expect(heading(page, "Location")).toBeVisible();
  await expect(page).toHaveURL(/step=location/);
  await expect(page.locator("[data-setup-rail]")).toContainText("Praga Boxing");
  await page
    .locator("[data-setup-rail]")
    .getByRole("button", { name: /Gym name & type/ })
    .click();
  await expect(heading(page, "Gym name & type")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Gym name" })).toHaveValue("Praga Boxing");
  await expect(page.getByRole("radio", { name: "Boxing club" })).toBeChecked();
  await expect(page.getByLabel("Phone · optional")).toHaveValue("+48 600 000 000");
  await expect(page.locator("[data-save-status]")).toHaveText("Saved");
});

test("deep links never skip the backend: ?step=complete and FUTURE steps resolve to the resume step", async ({
  page,
}) => {
  await start(page, { gyms: [{ name: "Praga Boxing" }] });
  for (const step of ["complete", "plan", "launch", "nonsense"]) {
    await page.goto(`${ROUTE}?step=${step}`);
    await expect(heading(page, "Location")).toBeVisible();
    await expect(page).toHaveURL(/step=location/);
  }
});

test("a lost create response: nothing claimed, Retry repeats the key, one gym exists", async ({
  page,
}) => {
  const api = await start(page);
  await page.goto(ROUTE);
  await fillOg1(page);
  api.loseResponses(1);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("We couldn’t confirm your gym was created.")).toBeVisible();
  await expect(heading(page, "Gym name & type")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Gym name" })).toHaveValue("Simple Boxing Gym");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(heading(page, "Location")).toBeVisible();
  const creates = writes(api).filter((request) => request.path === "/api/v1/gyms");
  expect(creates).toHaveLength(2);
  expect((creates[0]?.body as { client_request_id: string }).client_request_id).toBe(
    (creates[1]?.body as { client_request_id: string }).client_request_id,
  );
  expect(api.gyms()).toHaveLength(1);
});

test("a key whose gym was discarded meanwhile is reported, and Continue starts a new gym", async ({
  page,
}) => {
  const api = await start(page);
  await page.goto(ROUTE);
  await fillOg1(page);
  api.loseResponses(1);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("We couldn’t confirm your gym was created.")).toBeVisible();
  const first = api.gyms()[0]?.id ?? "";
  api.externalDiscard(first);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("That gym draft was discarded.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Gym name" })).toHaveValue("Simple Boxing Gym");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Location")).toBeVisible();
  const keys = writes(api)
    .filter((request) => request.path === "/api/v1/gyms")
    .map((request) => (request.body as { client_request_id: string }).client_request_id);
  expect(keys[1]).toBe(keys[0]);
  expect(keys[2]).not.toBe(keys[0]);
  expect(api.gyms().map((gym) => gym.id)).not.toContain(first);
});

test("a stale revision: the latest loads, the input stays, only Save my changes writes it", async ({
  page,
}) => {
  const api = await start(page, {
    gyms: [{ name: "Praga Boxing", location: LOCATION, revision: 5 }],
  });
  await page.goto(`${ROUTE}?step=location`);
  await expect(heading(page, "Location")).toBeVisible();
  const id = api.gyms()[0]?.id ?? "";
  // Another device renames the gym meanwhile (revision 5 → 6).
  api.externalUpdate(id, { name: "Praga Boxing Club" });
  await page.getByLabel("Entrance note · optional").fill("Ring the bell");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("This gym changed on another device or tab.")).toBeVisible();
  await expect(heading(page, "Location")).toBeVisible();
  await expect(page.getByLabel("Entrance note · optional")).toHaveValue("Ring the bell");
  await expect(page.locator("[data-setup-rail]")).toContainText("Praga Boxing Club");
  expect(api.gyms()[0]?.location?.entrance_note).toBeNull();

  await page.getByRole("button", { name: "Save my changes" }).click();
  await expect(heading(page, "Branding")).toBeVisible();
  expect(writes(api).at(-1)).toMatchObject({
    method: "PUT",
    body: { entrance_note: "Ring the bell", expected_revision: 6 },
  });
  expect(api.gyms()[0]?.location?.entrance_note).toBe("Ring the bell");
});

test("an unconfirmed save keeps everything typed; Retry is safe", async ({ page }) => {
  const api = await start(page, { gyms: [{ name: "Praga Boxing", location: LOCATION }] });
  await page.goto(`${ROUTE}?step=branding`);
  await page.getByLabel("Tagline · optional").fill("Box on");
  api.failWrites(1);
  await page.getByRole("button", { name: "Create gym" }).click();
  await expect(page.getByText("We couldn’t confirm your changes were saved.")).toBeVisible();
  await expect(page.getByLabel("Tagline · optional")).toHaveValue("Box on");
  expect(api.gyms()[0]?.status).toBe("draft");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(heading(page, "Praga Boxing is created.")).toBeVisible();
});

test("Skip creates the gym without the branding edits", async ({ page }) => {
  const api = await start(page, { gyms: [{ name: "Praga Boxing", location: LOCATION }] });
  await page.goto(`${ROUTE}?step=branding`);
  await page.getByLabel("Tagline · optional").fill("Not saved");
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(heading(page, "Praga Boxing is created.")).toBeVisible();
  expect(writes(api).map((request) => request.method)).toEqual(["POST"]);
  expect(api.gyms()[0]?.tagline).toBeNull();
});

test("completion without a location stays on OG3 with a way to OG2", async ({ page }) => {
  await start(page, { gyms: [{ name: "Praga Boxing" }] });
  await page.goto(`${ROUTE}?step=branding`);
  await page.getByRole("button", { name: "Create gym" }).click();
  await expect(page.getByText("Your gym is missing details.")).toBeVisible();
  await page.getByRole("button", { name: "Go to Location" }).click();
  await expect(heading(page, "Location")).toBeVisible();
});

test("the creation limit is explained, input kept", async ({ page }) => {
  await start(page, { limit: 0 });
  await page.goto(ROUTE);
  await fillOg1(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("You’ve started several gyms today.")).toBeVisible();
  // The API does not expose `retry-after` to cross-origin pages, so the
  // notice says "later" rather than guessing a time.
  await expect(page.getByText("Try again later. What you typed is kept.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Gym name" })).toHaveValue("Simple Boxing Gym");
});

test("a draft discarded on another device: the page says so and starts a new gym", async ({
  page,
}) => {
  const api = await start(page, { gyms: [{ name: "Praga Boxing" }] });
  await page.goto(`${ROUTE}?step=location`);
  await expect(heading(page, "Location")).toBeVisible();
  api.externalDiscard(api.gyms()[0]?.id ?? "");
  await pickCountry(page, "Poland");
  await page.getByLabel("City").fill("Warsaw");
  await page.getByRole("textbox", { name: "Address", exact: true }).fill("ul. Ząbkowska 31");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("This gym draft is no longer available.").first()).toBeVisible();
});

test("validation: the requirements and shapes are checked before anything is sent", async ({
  page,
}) => {
  const api = await start(page);
  await page.goto(ROUTE);
  await page.getByLabel("Phone · optional").fill("call me");
  await page.getByLabel("Website · optional").fill("ftp://gym");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Check the highlighted fields.")).toBeVisible();
  await expect(page.getByText("Enter your gym’s name.")).toBeVisible();
  await expect(page.getByText("Choose a gym type.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Gym name" })).toBeFocused();
  expect(writes(api)).toEqual([]);
});

test("multi-gym: an owner of a completed gym creates a second, and Go to gym opens the new one", async ({
  page,
}) => {
  const api = await start(page, {
    gyms: [{ name: "First Gym", status: "completed", location: LOCATION }],
  });
  await page.goto(ROUTE);
  await expect(heading(page, "Gym name & type")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Gym name" })).toHaveValue("");
  // Said plainly: continuing creates another, separate gym.
  await expect(page.getByText("You already have a gym in SimpleFit.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to my gym" })).toBeVisible();
  await fillOg1(page, "Second Gym");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Location")).toBeVisible();
  await pickCountry(page, "Poland");
  await page.getByLabel("City").fill("Kraków");
  await page.getByRole("textbox", { name: "Address", exact: true }).fill("ul. Długa 1");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create gym" }).click();
  await expect(heading(page, "Second Gym is created.")).toBeVisible();
  await page.getByRole("button", { name: "Go to gym" }).click();
  await page.waitForURL("**/en/app/gym");
  const second = api.gyms().find((gym) => gym.name === "Second Gym");
  expect(api.lastGym()).toBe(second?.id);
  expect(api.gyms().find((gym) => gym.name === "First Gym")?.name).toBe("First Gym");
});

test("Save & exit saves the step, then leaves", async ({ page }) => {
  const api = await start(page, { gyms: [{ name: "Praga Boxing" }] });
  await page.goto(`${ROUTE}?step=type`);
  await page.getByRole("textbox", { name: "Gym name" }).fill("Praga Boxing Club");
  await page.getByRole("button", { name: "Save & exit" }).click();
  await page.waitForURL(/\/en$/);
  expect(api.gyms()[0]?.name).toBe("Praga Boxing Club");
});

test("signed out: the route asks for sign-in and keeps the Gym journey", async ({ page }) => {
  await onboardingApi(page, { signedOut: true });
  await gymApi(page);
  await page.goto(`${ROUTE}?intent=gym`);
  await page.waitForURL((url) => url.pathname === "/en/login");
  expect(new URL(page.url()).searchParams.get("intent")).toBe("gym");
});

test("account registration comes first: WA5 opens, no gym is read or created", async ({ page }) => {
  await onboardingApi(page, { accountComplete: false });
  const api = await gymApi(page, { entry: false });
  await page.goto(`${ROUTE}?intent=gym`);
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/account");
  expect(new URL(page.url()).searchParams.get("intent")).toBe("gym");
  expect(api.requests.filter((request) => request.path.startsWith("/api/v1/gyms"))).toEqual([]);
});

test("an expired session during a save goes to sign-in, keeping the Gym journey", async ({
  page,
}) => {
  const session = await onboardingApi(page);
  const api = await gymApi(page, { gyms: [{ name: "Praga Boxing" }] });
  await page.goto(`${ROUTE}?step=type&intent=gym`);
  await expect(heading(page, "Gym name & type")).toBeVisible();
  session.expire();
  api.expire();
  await page.getByRole("textbox", { name: "Gym name" }).fill("Praga Boxing Club");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => url.pathname === "/en/login");
  expect(new URL(page.url()).searchParams.get("intent")).toBe("gym");
  expect(api.gyms()[0]?.name).toBe("Praga Boxing");
});

test("keyboard only: OG1 to OG6b without a pointer, focus on each new step", async ({ page }) => {
  const api = await start(page);
  await page.goto(ROUTE);
  await page.getByRole("textbox", { name: "Gym name" }).focus();
  await page.keyboard.type("Keyboard Gym");
  // Safari moves Tab between text fields only (a platform setting): focus the group.
  await page.getByRole("radio", { name: "Boxing gym" }).focus();
  // The type pills are one radio group: arrows move, Space chooses.
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio", { name: "Boxing gym" })).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Boxing club" })).toBeChecked();
  await page.keyboard.press("Enter");
  await expect(heading(page, "Location")).toBeFocused();
  expect(api.gyms()[0]).toMatchObject({ name: "Keyboard Gym", gym_type: "boxing_club" });

  await page.getByRole("combobox", { name: "Country" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Poland");
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "City" }).focus();
  await page.keyboard.type("Warsaw");
  await page.keyboard.press("Tab");
  await page.keyboard.type("ul. Ząbkowska 31");
  await page.keyboard.press("Enter");
  await expect(heading(page, "Branding")).toBeFocused();

  await page.getByRole("radio", { name: "Sky" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio", { name: "Sky" })).toBeChecked();
  await page.getByRole("button", { name: "Create gym" }).focus();
  await page.keyboard.press("Enter");
  await expect(heading(page, "Keyboard Gym is created.")).toBeFocused();
  expect(api.gyms()[0]).toMatchObject({ accent_color: "#7fa7c9", status: "completed" });
});

test("Back, Save & exit and the rail never discard a draft", async ({ page }) => {
  const api = await start(page, { gyms: [{ name: "Praga Boxing", location: LOCATION }] });
  await page.goto(`${ROUTE}?step=branding`);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(heading(page, "Location")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(heading(page, "Gym name & type")).toBeVisible();
  await page
    .locator("[data-setup-rail]")
    .getByRole("button", { name: /Branding/ })
    .click();
  await expect(heading(page, "Branding")).toBeVisible();
  await page.getByRole("button", { name: "Save & exit" }).click();
  await page.waitForURL(/\/en$/);
  expect(api.requests.filter((request) => request.method === "DELETE")).toEqual([]);
  expect(api.gyms()).toHaveLength(1);
  // No discard control exists in the approved flow.
  await page.goto(`${ROUTE}?step=branding`);
  await expect(page.getByRole("button", { name: /discard|delete/i })).toHaveCount(0);
});

test("the setup of a gym the viewer does not own is never shown or edited", async ({ page }) => {
  // A staff role at a draft is not its owner: the route starts a gym of the viewer's own.
  const api = await start(page, { gyms: [{ name: "Someone Else's Gym", role: "manager" }] });
  await page.goto(ROUTE);
  await expect(heading(page, "Gym name & type")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Gym name" })).toHaveValue("");
  await expect(page.getByText("Someone Else's Gym")).toHaveCount(0);
  expect(api.requests.filter((request) => /\/api\/v1\/gyms\/.+/.test(request.path))).toEqual([]);
});

test("a draft completed on another device: a reload explains it and leads to the gym", async ({
  page,
}) => {
  const api = await start(page, { gyms: [{ name: "Praga Boxing", location: LOCATION }] });
  await page.goto(`${ROUTE}?step=branding`);
  await expect(heading(page, "Branding")).toBeVisible();
  const id = api.gyms()[0]?.id ?? "";
  api.externalUpdate(id, { status: "completed" });
  await page.reload();
  await expect(heading(page, "Gym name & type")).toBeVisible();
  await expect(page.getByText("You already have a gym in SimpleFit.")).toBeVisible();
  await page.getByRole("link", { name: "Go to my gym" }).click();
  await page.waitForURL("**/en/app/gym");
  expect(api.gyms()).toHaveLength(1);
});

test("a draft completed on another device while this tab is open leaves through the entry", async ({
  page,
}) => {
  const api = await start(page, { gyms: [{ name: "Praga Boxing", location: LOCATION }] });
  await page.goto(`${ROUTE}?step=branding`);
  await expect(heading(page, "Branding")).toBeVisible();
  api.externalUpdate(api.gyms()[0]?.id ?? "", { status: "completed" });
  // The tab regains focus: the setup is re-read and the completed gym opens.
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true })),
  );
  await page.waitForURL("**/en/app/gym");
});
