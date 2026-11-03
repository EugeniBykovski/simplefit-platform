import { expect, test, type Page } from "@playwright/test";

/*
 * The member booking stories (SF-100: My gyms, a gym's classes with booking
 * and cancelling, My bookings) and the class roster in the timetable on the
 * static Storybook build: each renders the production composition in its
 * state, through its play function, with no request leaving the page (the
 * API is a per-story double), in the dark and light themes, at desktop and
 * phone widths without horizontal overflow.
 */

const STORYBOOK = "http://127.0.0.1:6007";

async function story(
  page: Page,
  id: string,
  theme: "Dark" | "Light",
  prefix = "gym-member-booking",
) {
  const outside: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      if (!url.hostname.endsWith("fonts.gstatic.com")) outside.push(request.url());
    }
  });
  await page.goto(
    `${STORYBOOK}/iframe.html?id=${prefix}--${id}&viewMode=story&globals=theme:${theme}`,
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
    ["available-class", "Confirm booking"],
    ["last-seat", "1 of 12 left"],
    ["class-full", "There is no waitlist"],
    ["already-booked", "Cancel booking"],
    ["booking-pending", "Booking…"],
    ["booking-success", "Booking confirmed. Your place is saved."],
    ["booking-error", "This class is full (16 places)"],
    ["lost-response", "We couldn’t confirm the outcome."],
    ["cancellation-confirmation", "Cancel your booking?"],
    ["cancelled-booking", "You cancelled an earlier booking of this class."],
    ["my-bookings", "Upcoming · 1"],
    ["no-bookings", "No bookings yet"],
    ["my-gyms", "Waiting for the gym to approve your request"],
    ["no-membership", "You’re not a member of a gym"],
    ["pending-membership", "Your request is waiting"],
    ["ended-membership", "Your membership isn’t active"],
    ["gym-unavailable", "You’re not a member of this gym"],
    ["backend-failure", "We couldn’t load this. Check your connection and try again."],
    ["rate-limited", "Too many requests in a short time."],
    ["long-translations", "Buchung bestätigen"],
  ] as const) {
    test(`${theme} · ${id}: ${text}`, async ({ page }) => {
      const outside = await story(page, id, theme);
      await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
      expect(outside).toEqual([]);
    });
  }

  for (const [id, text] of [
    ["roster-populated", "Piotr Z."],
    ["roster-empty", "No one has booked this class yet."],
    ["coach-roster", "Marta K."],
    ["check-in-completed", "Piotr Z. is checked in."],
    ["check-in-rejected", "Check-in is recorded on the day of the class."],
  ] as const) {
    test(`${theme} · timetable ${id}: ${text}`, async ({ page }) => {
      const outside = await story(page, id, theme, "gym-console-timetable");
      await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
      expect(outside).toEqual([]);
    });
  }
}

test("the session-expired story leaves the member page for sign-in", async ({ page }) => {
  await story(page, "session-expired", "Dark");
  await expect(page.locator("[data-member-class]")).toHaveCount(0);
});

test("no member story shows a price, credit, waitlist position, refund or invented attendance", async ({
  page,
}) => {
  for (const id of ["available-class", "my-bookings", "my-gyms"]) {
    await story(page, id, "Dark");
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await expect(page.locator("main")).not.toContainText(
      /PLN|zł|€|\$\d|\d+ credits?|credits? left|waitlist #|position \d|refund|attended|no-show|friends attending/i,
    );
  }
});

for (const [width, height] of [
  [1920, 1080],
  [1366, 768],
  [1024, 768],
  [768, 1024],
  [430, 932],
  [390, 844],
  [375, 667],
] as const) {
  test(`no horizontal overflow at ${width} px (classes and bookings)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const id of ["available-class", "my-bookings"]) {
      await story(page, id, "Dark");
      await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });
}
