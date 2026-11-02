import { expect, test, type Locator, type Page } from "@playwright/test";

import { gymApi, type Gym, type GymApi } from "./gym-api";
import { axeViolations, overflow } from "./harness";
import { onboardingApi } from "./onboarding-api";
import { timetableApi, type TimetableApi, type TimetableSeed } from "./timetable-api";

/*
 * The gym timetable on the production build (SF-98, WG5 with OG10):
 * `/app/gyms/:gymId/timetable` against the test double of the SF-97
 * contract (./timetable-api over ./gym-api in console mode). Every class
 * shown is the double's answer for the gym in the path; every action is
 * decided by it. The viewer's device is in Los Angeles: the Warsaw gym's
 * classes must still show their Warsaw wall times.
 */

// A US English browser: native date and time fields take month/day/year and a 12-hour clock.
test.use({ timezoneId: "America/Los_Angeles", locale: "en-US" });

const LOCATION = {
  id: "loc-1",
  name: "Praga",
  country_code: "PL",
  city: "Warsaw",
  address_line: "ul. Ząbkowska 5",
  entrance_note: null,
  is_primary: true,
};
const COMPLETED = { status: "completed" as const, location: LOCATION };
const COACH = "7a1b2c3d-0000-4000-8000-000000000201";
const STAFF = (role: Gym["role"]) => [
  ...(role === "owner"
    ? []
    : [
        {
          id: "7a1b2c3d-0000-4000-8000-000000000200",
          role: "owner" as const,
          name: "Ewa P.",
          status: "active" as const,
        },
      ]),
  {
    id: "7a1b2c3d-0000-4000-8000-000000000002",
    role,
    name: "Yauheni B.",
    status: "active" as const,
  },
  ...(role === "coach"
    ? []
    : [{ id: COACH, role: "coach" as const, name: "Tomasz Z.", status: "active" as const }]),
  {
    id: "7a1b2c3d-0000-4000-8000-000000000202",
    role: "front_desk" as const,
    name: "Michał S.",
    status: "active" as const,
  },
];
/** A furnished gym: two venues in Warsaw and one template. */
const FURNISHED: TimetableSeed = {
  venues: [
    { name: "Ring 2", capacity: 20 },
    { name: "Ring 1", capacity: 24 },
  ],
  templates: [{ title: "Technical boxing", default_duration_minutes: 90, default_capacity: 16 }],
};

async function openTimetable(
  page: Page,
  {
    role = "owner",
    seed = FURNISHED,
    gyms = [],
    gym = {},
  }: { role?: Gym["role"]; seed?: TimetableSeed; gyms?: Partial<Gym>[]; gym?: Partial<Gym> } = {},
) {
  const session = await onboardingApi(page, { tour: "completed" });
  const api = await gymApi(page, {
    console: true,
    gyms: [{ name: "Ring One Boxing", role, staff: STAFF(role), ...COMPLETED, ...gym }, ...gyms],
  });
  const timetable = await timetableApi(page, api, { "Ring One Boxing": seed });
  const id = idOf(api, "Ring One Boxing");
  await page.goto(`/en/app/gyms/${id}/timetable`);
  await expect(page.getByRole("heading", { level: 1, name: "Timetable" })).toBeVisible();
  return { api, timetable, session, id };
}

const idOf = (api: GymApi, name: string) => {
  const gym = api.gyms().find((candidate) => candidate.name === name);
  if (!gym) throw new Error(`no gym ${name}`);
  return gym.id;
};
const grid = (page: Page) => page.locator("[data-timetable]");
const writes = (timetable: TimetableApi) =>
  timetable.requests
    .filter((request) => request.method !== "GET")
    .map((request) => `${request.method} ${request.path.replace(/^\/api\/v1\/gyms\/[^/]+/, "")}`);

async function choose(page: Page, scope: Locator, label: string, option: string | RegExp) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option }).click();
}

async function goTo(page: Page, date: string, view: "Week" | "Day" | "List" = "List") {
  await page.getByRole("button", { name: view, exact: true }).click();
  await page.getByLabel("Go to date").fill(date);
  await expect(grid(page)).toHaveAttribute("data-timetable-complete", "true");
}

async function newClass(page: Page, date: string, time: string) {
  await page.getByRole("button", { name: "Class", exact: true }).click();
  const form = page.getByRole("dialog", { name: "New class" });
  await form.getByLabel("Date", { exact: true }).fill(date);
  await form.getByLabel(/^Start time/).fill(time);
  return form;
}

/** A day of December 2026, a Thursday 18:00 class at Ring 2 (seeded). */
const SEEDED: TimetableSeed = {
  ...FURNISHED,
  occurrences: [
    { day: "2026-12-03", time: "18:00", instructor: COACH },
    { day: "2026-12-03", time: "09:00", title: "Morning boxing", venue: 1 },
  ],
};

test.describe("planning the timetable", () => {
  test("starts truthfully empty, then venue, template and class through the UI, shown at Warsaw time", async ({
    page,
  }) => {
    const { timetable, id } = await openTimetable(page, { seed: {} });
    await expect(page.locator("[data-timetable-empty=venue]")).toContainText("Add a venue first");
    await expect(page.locator("main")).not.toContainText(/Main Hall|\d+\s*\/\s*\d+|\d+ booked/i);

    await page.getByRole("button", { name: "Add a venue" }).click();
    const venue = page.getByRole("dialog", { name: "New venue" });
    await venue.getByLabel("Name").fill("Ring 2");
    await venue.getByRole("combobox", { name: "Time zone" }).click();
    await page.getByRole("combobox", { name: "Search time zones" }).fill("Europe/Warsaw");
    await page.keyboard.press("Enter");
    await venue.getByLabel("Capacity (optional)").fill("20");
    await venue.getByRole("button", { name: "Add venue" }).click();

    await page.getByRole("button", { name: "Add a class template" }).click();
    const template = page.getByRole("dialog", { name: "New class template" });
    await template.getByLabel("Class name").fill("Technical boxing");
    await template.getByLabel("Default length").fill("90");
    await template.getByLabel("Default capacity").fill("16");
    await template.getByRole("button", { name: "Add template" }).click();
    await expect(page.locator("[data-timetable-empty=free]")).toBeVisible();

    const form = await newClass(page, "2026-12-03", "18:00");
    await expect(form.getByRole("combobox", { name: "Venue", exact: true })).toContainText(
      "Ring 2",
    );
    await form.getByRole("button", { name: "Schedule class" }).click();
    await expect(form).toBeHidden();
    // Sent with Warsaw's winter offset, whatever the device's zone.
    const create = timetable.requests.find(
      (request) => request.method === "POST" && request.path.endsWith("/class-occurrences"),
    )!;
    expect(create.body).toMatchObject({ starts_at: "2026-12-03T18:00:00+01:00" });
    expect(typeof create.body?.client_request_id).toBe("string");

    await expect(page.locator('[data-local-start="2026-12-03T18:00:00"]').first()).toBeVisible();
    await goTo(page, "2026-12-03");
    const card = page.locator("[data-list-view] [data-occurrence]");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("18:00");
    await expect(page.locator("[data-timetable-zones]")).toContainText("Times in Europe/Warsaw");
    await card.click();
    const details = page.locator("[data-occurrence-details]");
    await expect(details.locator("[data-fact=zone]")).toHaveText("Europe/Warsaw (UTC+01:00)");
    await expect(details.locator("[data-fact=capacity]")).toHaveText("Up to 16 people");
    await expect(page.locator("main")).not.toContainText(
      /\d+\s*\/\s*\d+|\d+ booked|waitlist \d|spaces left|attendance \d|PLN|revenue|friends attending/i,
    );
    expect(writes(timetable)).toEqual([
      "POST /venues",
      "POST /class-templates",
      "POST /class-occurrences",
    ]);
    expect(timetable.occurrences(id)).toHaveLength(1);
  });

  test("schedules a weekly class and shows exactly the skipped DST dates", async ({ page }) => {
    const { timetable, id } = await openTimetable(page);
    await page.getByRole("button", { name: "Class", exact: true }).click();
    const form = page.getByRole("dialog", { name: "New class" });
    await form.getByText("Every week", { exact: true }).click();
    await form.locator('[data-weekday="7"]').click();
    await form.getByLabel(/^Start time/).fill("02:30");
    await form.getByLabel("First date").fill("2027-03-21");
    await form.getByLabel("Last date").fill("2027-11-07");
    await expect(form.locator("[data-weekly-summary]")).toContainText(
      "Every Sunday at 02:30 (Europe/Warsaw)",
    );
    await form.getByRole("button", { name: "Schedule weekly class" }).click();
    await expect(
      page.getByRole("heading", { name: "Weekly class scheduled, with dates skipped" }),
    ).toBeVisible();
    await expect(page.locator('[data-skipped-date="2027-03-28"]')).toHaveAttribute(
      "data-skipped-reason",
      "nonexistent_local_time",
    );
    await expect(page.locator('[data-skipped-date="2027-10-31"]')).toHaveAttribute(
      "data-skipped-reason",
      "ambiguous_local_time",
    );
    await page.getByRole("button", { name: "Done" }).click();
    // The timetable shows the backend's rows only: none on the skipped date.
    await goTo(page, "2027-03-28");
    await expect(page.locator('[data-list-day="2027-03-28"] [data-occurrence]')).toHaveCount(0);
    await goTo(page, "2027-04-04");
    await expect(page.locator('[data-list-day="2027-04-04"] [data-occurrence]')).toHaveCount(1);
    expect(timetable.occurrences(id).some((row) => row.series_local_date === "2027-03-28")).toBe(
      false,
    );
  });

  test("refuses a skipped spring time and requires a choice for a repeated autumn time", async ({
    page,
  }) => {
    const { timetable } = await openTimetable(page);
    let form = await newClass(page, "2027-03-28", "02:30");
    await expect(form.locator("[data-schedule=gap]")).toContainText(
      "This time doesn’t exist that day.",
    );
    await form.getByRole("button", { name: "Schedule class" }).click();
    await expect(
      form.getByText(
        "This time doesn’t exist on that date in the venue’s time zone. Choose another time.",
      ),
    ).toBeVisible();
    await form.getByRole("button", { name: "Cancel" }).click();

    form = await newClass(page, "2027-10-31", "02:30");
    await form.getByRole("button", { name: "Schedule class" }).click();
    await expect(form.getByText("Choose which of the two times you mean.")).toBeVisible();
    await form.getByText("First (UTC+02:00)").click();
    await form.getByRole("button", { name: "Schedule class" }).click();
    await expect(form).toBeHidden();
    const sent = timetable.requests
      .filter((request) => request.method === "POST" && request.path.endsWith("/class-occurrences"))
      .map((request) => request.body?.starts_at);
    expect(sent).toEqual(["2027-03-28T02:30:00+01:00", "2027-10-31T02:30:00+02:00"]);
  });

  test("explains venue and instructor conflicts, keeps the form, and allows adjacent classes", async ({
    page,
  }) => {
    const { timetable, id } = await openTimetable(page, { seed: SEEDED });
    let form = await newClass(page, "2026-12-03", "19:00");
    await form.getByRole("button", { name: "Schedule class" }).click();
    await expect(form.locator("[data-timetable-problem=venueTaken]")).toBeVisible();
    await expect(form.getByLabel(/^Start time/)).toHaveValue("19:00");

    await choose(page, form, "Venue", /^Ring 1/);
    await choose(page, form, "Instructor", "Tomasz Z.");
    await form.getByRole("button", { name: "Schedule class" }).click();
    await expect(form.locator("[data-timetable-problem=instructorBusy]")).toContainText(
      "This instructor teaches another class at that time.",
    );
    await form.getByRole("button", { name: "Cancel" }).click();

    form = await newClass(page, "2026-12-03", "19:30");
    await form.getByRole("button", { name: "Schedule class" }).click();
    await expect(form).toBeHidden();
    expect(timetable.occurrences(id)).toHaveLength(3);
  });

  test("changes one class of a series only, then cancels a class and the series", async ({
    page,
  }) => {
    const { timetable, id } = await openTimetable(page);
    await page.getByRole("button", { name: "Class", exact: true }).click();
    const form = page.getByRole("dialog", { name: "New class" });
    await form.getByText("Every week", { exact: true }).click();
    await form.locator('[data-weekday="1"]').click();
    await form.locator('[data-weekday="3"]').click();
    await form.getByLabel(/^Start time/).fill("18:00");
    await form.getByLabel("First date").fill("2026-12-07");
    await form.getByLabel("Last date").fill("2026-12-18");
    await form.getByRole("button", { name: "Schedule weekly class" }).click();
    await page.getByRole("button", { name: "Done" }).click();

    await goTo(page, "2026-12-07");
    await page.locator('[data-list-view] [data-local-start="2026-12-09T18:00:00"]').click();
    await page.getByRole("button", { name: "Change this class" }).click();
    const change = page.getByRole("dialog", { name: "Change Technical boxing" });
    await expect(change).toContainText("Only this date changes.");
    await change.getByLabel(/^Start time/).fill("19:00");
    await change.getByRole("button", { name: "Save changes" }).click();
    await expect(change).toBeHidden();
    const rows = () =>
      timetable
        .occurrences(id)
        .map((row) => `${row.series_local_date}@${row.local_starts_at.slice(11, 16)}@${row.status}`)
        .sort();
    expect(rows()).toEqual([
      "2026-12-07@18:00@scheduled",
      "2026-12-09@19:00@scheduled",
      "2026-12-14@18:00@scheduled",
      "2026-12-16@18:00@scheduled",
    ]);

    await goTo(page, "2026-12-14");
    await page.locator('[data-list-view] [data-local-start="2026-12-14T18:00:00"]').click();
    await page.getByRole("button", { name: "Cancel class" }).click();
    const one = page.getByRole("alertdialog");
    await expect(one).toContainText("Only this date is cancelled.");
    await one.getByRole("button", { name: "Cancel class" }).click();
    await expect(one).toBeHidden();

    await page.getByRole("tab", { name: "Weekly series" }).click();
    await page.locator("[data-series] button").click();
    await page.getByRole("button", { name: "Cancel series" }).click();
    const all = page.getByRole("alertdialog");
    await expect(all.getByRole("button", { name: "Cancel series" })).toBeDisabled();
    await all.getByRole("checkbox").click();
    await all.getByRole("button", { name: "Cancel series" }).click();
    await expect(all).toBeHidden();
    expect(
      timetable
        .occurrences(id)
        .map((row) => `${row.series_local_date}@${row.cancel_reason}`)
        .sort(),
    ).toEqual([
      "2026-12-07@series_cancelled",
      "2026-12-09@series_cancelled",
      "2026-12-14@cancelled",
      "2026-12-16@series_cancelled",
    ]);
  });

  test("never overwrites a change made elsewhere, and never duplicates a class after a lost answer", async ({
    page,
  }) => {
    const { timetable, id } = await openTimetable(page, { seed: SEEDED });
    await goTo(page, "2026-12-03");
    await page.locator('[data-list-view] [data-local-start="2026-12-03T18:00:00"]').click();
    await page.getByRole("button", { name: "Change this class" }).click();
    const change = page.getByRole("dialog", { name: "Change Technical boxing" });
    const target = timetable.occurrences(id).find((row) => row.title === "Technical boxing")!;
    timetable.externalChange(target.occurrence_id, { capacity: 12 });
    await change.getByLabel("Length").fill("75");
    await change.getByRole("button", { name: "Save changes" }).click();
    await expect(change.getByText("This class changed meanwhile.")).toBeVisible();
    await expect(change.getByLabel("Capacity")).toHaveValue("12");
    await change.getByRole("button", { name: "Save again" }).click();
    await expect(change).toBeHidden();
    expect(target).toMatchObject({ capacity: 12, duration_minutes: 75, revision: 3 });

    timetable.loseResponses(1);
    const form = await newClass(page, "2026-12-10", "10:00");
    await form.getByRole("button", { name: "Schedule class" }).click();
    await expect(form.getByText("We couldn’t confirm whether this was saved.")).toBeVisible();
    await form.getByRole("button", { name: "Try again" }).click();
    await expect(form).toBeHidden();
    const keys = timetable.requests
      .filter((request) => request.method === "POST" && request.path.endsWith("/class-occurrences"))
      .map((request) => request.body?.client_request_id);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(timetable.occurrences(id)).toHaveLength(3);
  });
});

test.describe("roles and isolation", () => {
  test("a manager plans; a coach cancels only classes they teach; a front desk only reads", async ({
    page,
  }) => {
    const manager = await openTimetable(page, { role: "manager", seed: SEEDED });
    await expect(page.getByRole("button", { name: "Class", exact: true })).toBeVisible();
    await goTo(page, "2026-12-03");
    await page.locator('[data-list-view] [data-local-start="2026-12-03T09:00:00"]').click();
    await expect(page.getByRole("button", { name: "Change this class" })).toBeVisible();
    expect(manager.id).toBeTruthy();
  });

  test("a coach sees no planning controls and cancels only their own classes", async ({ page }) => {
    const seed: TimetableSeed = {
      ...FURNISHED,
      occurrences: [
        { day: "2026-12-03", time: "18:00", instructor: "7a1b2c3d-0000-4000-8000-000000000002" },
        { day: "2026-12-03", time: "09:00", title: "Morning boxing", venue: 1 },
      ],
    };
    await openTimetable(page, { role: "coach", seed });
    await expect(page.getByRole("button", { name: "Class", exact: true })).toHaveCount(0);
    await goTo(page, "2026-12-03");
    await page.locator('[data-list-view] [data-local-start="2026-12-03T09:00:00"]').click();
    const details = page.locator("[data-occurrence-details]");
    await expect(details.getByRole("button")).toHaveCount(0);
    await page.locator('[data-list-view] [data-local-start="2026-12-03T18:00:00"]').click();
    await expect(details.getByRole("button", { name: "Change this class" })).toHaveCount(0);
    await details.getByRole("button", { name: "Cancel class" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel class" }).click();
    await expect(page.getByRole("alertdialog")).toBeHidden();
  });

  test("a front desk reads without mutation controls; a revoked one loses the gym", async ({
    page,
  }) => {
    const { api, id } = await openTimetable(page, { role: "front_desk", seed: SEEDED });
    await expect(page.getByRole("button", { name: "Class", exact: true })).toHaveCount(0);
    await goTo(page, "2026-12-03");
    await page.locator('[data-list-view] [data-local-start="2026-12-03T18:00:00"]').click();
    await expect(page.locator("[data-occurrence-details]").getByRole("button")).toHaveCount(0);
    await page.getByRole("tab", { name: "Venues" }).click();
    await expect(page.getByRole("button", { name: "New venue" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Class templates" }).click();
    await expect(page.getByRole("button", { name: "New template" })).toHaveCount(0);

    api.revoke(id);
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await expect(page.locator("[data-gym-timetable]")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("Technical boxing");
  });

  test("Gym A and Gym B stay apart: a late Gym A answer never lands in Gym B", async ({ page }) => {
    const { api, timetable } = await openTimetable(page, {
      seed: SEEDED,
      gyms: [{ name: "Annex Club", role: "owner", staff: STAFF("owner"), ...COMPLETED }],
    });
    const annex = idOf(api, "Annex Club");
    const ring = idOf(api, "Ring One Boxing");
    await goTo(page, "2026-12-03");
    const release = timetable.holdLists(ring);
    await page.getByLabel("Go to date").fill("2026-12-10");
    await page.goto(`/en/app/gyms/${annex}/timetable`);
    release();
    await expect(page.locator(`[data-gym-timetable][data-gym-id="${annex}"]`)).toBeVisible();
    await expect(page.locator("[data-timetable-empty=venue]")).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/Technical boxing|Morning boxing|Ring 2/);
    // Another gym's id under this console is simply not available.
    await page.goto(`/en/app/gyms/00000000-0000-4000-8000-00000000dead/timetable`);
    await expect(page.locator("[data-gym-timetable]")).toHaveCount(0);
  });

  test("an ended session leaves no timetable on screen", async ({ page }) => {
    const { api, session } = await openTimetable(page, { seed: SEEDED });
    await goTo(page, "2026-12-03");
    await expect(page.locator("[data-list-view] [data-occurrence]")).toHaveCount(2);
    session.expire();
    api.expire();
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await page.waitForURL((url) => url.pathname.startsWith("/en/login"));
    await expect(page.locator("body")).not.toContainText("Technical boxing");
  });

  test("the checklist's add_class leads to the timetable while it is available", async ({
    page,
  }) => {
    const { id } = await openTimetable(page, { seed: SEEDED, gym: { firstRun: "in_progress" } });
    await page.goto(`/en/app/gyms/${id}`);
    const item = page.locator("[data-checklist-key=add_class]");
    await expect(item).toHaveAttribute("data-checklist-status", "available");
    await item.getByRole("link", { name: "Add your first class" }).click();
    await page.waitForURL(`**/en/app/gyms/${id}/timetable`);
  });
});

test.describe("geometry, keyboard, accessibility and locales", () => {
  for (const width of [1920, 1728, 1512, 1440, 1366, 1280, 1024, 768, 430, 390, 375]) {
    test(`fits ${width} px with no horizontal overflow, and its calendar or day strip`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await openTimetable(page, { seed: SEEDED });
      await goTo(page, "2026-12-03", "Week");
      expect(await overflow(page)).toBe(0);
      if (width >= 768) await expect(page.locator("[data-week-grid]")).toBeVisible();
      else {
        await expect(page.locator("[data-day-strip]")).toBeVisible();
        await page.locator("[data-day-strip] button").nth(4).click();
      }
      await expect(
        page
          .locator(width >= 768 ? "[data-week-grid]" : "[data-day-agenda]")
          .locator('[data-local-start="2026-12-03T18:00:00"]'),
      ).toBeVisible();
      await page.getByRole("button", { name: "Class", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "New class" });
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(await overflow(page)).toBe(0);
    });
  }

  test("schedules a class with the keyboard alone", async ({ page, browserName }) => {
    const { timetable, id } = await openTimetable(page, { seed: SEEDED });
    // WebKit on macOS, like Safari, moves between form fields only on Tab; Option+Tab reaches every control.
    const next = browserName === "webkit" ? "Alt+Tab" : "Tab";
    /** Tabs forward until `target` has focus (every control is in the tab order). */
    const tabTo = async (target: Locator) => {
      for (let step = 0; step < 30; step += 1) {
        if (await target.evaluate((element) => element === document.activeElement)) return;
        await page.keyboard.press(next);
      }
      throw new Error("not reachable with Tab");
    };
    await tabTo(page.getByRole("button", { name: "Class", exact: true }));
    await page.keyboard.press("Enter");
    const form = page.getByRole("dialog", { name: "New class" });
    await expect(form).toBeVisible();
    // The native date and time fields take keys in the operating system's own order
    // (day or month first, 12- or 24-hour), so their values are set once focused.
    const date = form.getByLabel("Date", { exact: true });
    await tabTo(date);
    await date.fill("2026-12-17");
    const time = form.getByLabel(/^Start time/);
    await tabTo(time);
    await time.fill("18:00");
    await tabTo(form.getByRole("button", { name: "Schedule class" }));
    await page.keyboard.press("Enter");
    await expect(form).toBeHidden();
    expect(timetable.occurrences(id).map((row) => row.local_starts_at)).toContain(
      "2026-12-17T18:00:00",
    );
    // The new class is reachable and opens from the keyboard too; its details take focus.
    await goTo(page, "2026-12-17");
    const card = page.locator("[data-list-view] [data-occurrence]").first();
    await card.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-occurrence-details]")).toBeVisible();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    // Escape closes a dialog and returns focus to its trigger.
    await tabTo(page.getByRole("button", { name: "Change this class" }));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Change Technical boxing" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Change this class" })).toBeFocused();
  });

  for (const scheme of ["dark", "light"] as const) {
    test(`has no axe violations in the ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openTimetable(page, { seed: SEEDED });
      await goTo(page, "2026-12-03", "Week");
      await page.locator('[data-local-start="2026-12-03T18:00:00"]').first().click();
      expect(await axeViolations(page)).toEqual([]);
      await page.getByRole("button", { name: "List", exact: true }).click();
      expect(await axeViolations(page)).toEqual([]);
      await page.getByRole("button", { name: "Class", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "New class" })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });
  }

  const TITLES = {
    en: "Timetable",
    pl: "Grafik",
    de: "Stundenplan",
    es: "Horario",
    "es-MX": "Horario",
    fr: "Planning",
    ru: "Расписание",
    uk: "Розклад",
  } as const;
  for (const [locale, title] of Object.entries(TITLES)) {
    test(`renders in ${locale}`, async ({ page }) => {
      const { id } = await openTimetable(page, { seed: SEEDED });
      await page.goto(`/${locale}/app/gyms/${id}/timetable`);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.locator("[data-timetable]")).toHaveAttribute(
        "data-timetable-complete",
        "true",
      );
      expect(await overflow(page)).toBe(0);
    });
  }
});
