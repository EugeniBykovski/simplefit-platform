import { expect, test, type Page } from "@playwright/test";

/*
 * The timetable stories (SF-98, WG5 with OG10) on the static Storybook build:
 * each renders the production route composition in its state, through its
 * play function, with no request leaving the page (the API is a per-story
 * double), in the dark and light themes.
 */

const STORYBOOK = "http://127.0.0.1:6007";

async function story(page: Page, id: string, theme: "Dark" | "Light") {
  const outside: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      if (!url.hostname.endsWith("fonts.gstatic.com")) outside.push(request.url());
    }
  });
  await page.goto(
    `${STORYBOOK}/iframe.html?id=gym-console-timetable--${id}&viewMode=story&globals=theme:${theme}`,
  );
  await page.waitForFunction(() =>
    ["sb-show-main", "sb-show-errordisplay"].some((name) => document.body.classList.contains(name)),
  );
  expect(await page.evaluate(() => document.body.classList.contains("sb-show-errordisplay"))).toBe(
    false,
  );
  return outside;
}

test.use({ viewport: { width: 1440, height: 900 } });

for (const theme of ["Dark", "Light"] as const) {
  for (const [id, text] of [
    ["populated", "Morning boxing"],
    ["list-view", "Kids boxing"],
    ["day-view", "Times in Europe/Warsaw"],
    ["details", "Up to 16 people"],
    ["no-instructor", "The instructor no longer teaches at this gym"],
    ["cancelled", "Cancelled"],
    ["rescheduled", "Changed on its own"],
    ["empty-week", "Nothing planned for these dates"],
    ["no-venue", "Add a venue first"],
    ["no-template", "Add a class template"],
    ["network-failure", "We couldn’t load the timetable"],
    ["rate-limited", "Too many requests in a short time"],
    ["one-time-form", "Schedule a class once, or every week for a set period."],
    ["recurring-form", "Every Monday and Wednesday at 18:00"],
    ["invalid-recurrence", "Choose at least one day."],
    ["dst-gap", "This time doesn’t exist that day."],
    ["dst-ambiguous", "This time happens twice that day."],
    ["venue-conflict", "Another class is in this venue at that time"],
    ["instructor-conflict", "This instructor teaches another class at that time"],
    ["unknown-outcome", "We couldn’t confirm whether this was saved."],
    ["skipped-dates", "Weekly class scheduled, with dates skipped"],
    ["stale-revision", "This class changed meanwhile."],
    ["cancel-occurrence", "Only this date is cancelled."],
    ["series-details", "Every Monday, Wednesday, and Friday at 18:00 (Europe/Warsaw)"],
    ["series-cancellation", "I understand that every class still to come"],
    ["templates", "Changing or archiving a template never changes classes already scheduled."],
    ["venues", "Ring 1"],
    ["coach-read-only", "Cancel class"],
    ["front-desk-read-only", "Your role can view the timetable. The owner and managers plan it."],
    ["unknown-gym", "This gym isn’t available"],
    ["long-translations", "Stundenplan"],
    ["light", "Morning boxing"],
    ["dark", "Morning boxing"],
    ["narrow", "Times in Europe/Warsaw"],
  ] as const) {
    test(`${theme} · ${id}: ${text}`, async ({ page }) => {
      const outside = await story(page, id, theme);
      await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
      expect(outside).toEqual([]);
    });
  }
}

test("loading: the timetable says it is loading and shows no class", async ({ page }) => {
  await story(page, "loading", "Dark");
  await expect(page.getByRole("status", { name: "Loading the timetable" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("[data-occurrence]")).toHaveCount(0);
});

test("no story shows a booking, occupancy, waitlist or payment figure", async ({ page }) => {
  await story(page, "populated", "Dark");
  await expect(page.getByText("Morning boxing").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-gym-timetable]")).not.toContainText(
    /\d+\s*\/\s*\d+|\d+ booked|waitlist \d|spaces left|PLN|revenue|friends attending/i,
  );
});
