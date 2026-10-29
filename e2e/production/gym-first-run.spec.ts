import { expect, test, type Locator, type Page } from "@playwright/test";

import { gymApi, type Gym, type GymApi } from "./gym-api";
import { axeViolations, box, overflow } from "./harness";
import { onboardingApi } from "./onboarding-api";

/*
 * GRW1 / GRW2, the gym owner's first run on the production build (SF-91):
 * the real console route (`/app/gyms/:gymId`) against the SF-90 contract
 * double (./gym-api). The page shows the backend's state for the gym in its
 * path and moves only on the backend's answer to start / complete / dismiss.
 * Screenshots go to SF91_SHOTS (default test-results/sf91).
 */

const SHOTS = process.env.SF91_SHOTS ?? "test-results/sf91";

// The production project's device preset is 1280 × 720: these tests are at the artboard size.
test.use({ viewport: { width: 1440, height: 900 } });
const LOCATION = {
  id: "loc-1",
  name: "Gdańsk",
  country_code: "PL",
  city: "Gdańsk",
  address_line: "ul. Morska 5",
  entrance_note: null,
  is_primary: true,
};
const COMPLETED = { status: "completed" as const, location: LOCATION };
// The API's five keys as GRW1 lists them: done and available first, then the
// coming-later ones, each in the API's order (SF-93 made invite_staff available).
const KEYS = ["create_gym", "invite_staff", "add_class", "invite_members", "first_check_in"];

async function start(page: Page, gyms: Partial<Gym>[]) {
  await onboardingApi(page, { tour: "completed" });
  return gymApi(page, { console: true, gyms });
}
const idOf = (api: GymApi, name: string) => {
  const gym = api.gyms().find((candidate) => candidate.name === name);
  if (!gym) throw new Error(`no gym ${name}`);
  return gym.id;
};
const firstRunCalls = (api: GymApi) =>
  api.requests.filter((request) => request.path.includes("/first-run"));
const writes = (api: GymApi) =>
  firstRunCalls(api)
    .filter((request) => request.method === "POST")
    .map((request) => request.path.split("/").pop());

const intro = (page: Page) => page.locator("[data-first-run-intro]");
const checklist = (page: Page) => page.locator("[data-gym-checklist]");
const tour = (page: Page) => page.locator("[data-gym-tour]");
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${SHOTS}/${name}.png`, animations: "disabled" });

async function settle(locator: Locator) {
  await locator.evaluate((element) =>
    Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

async function openOwner(page: Page, overrides: Partial<Gym> = {}) {
  const api = await start(page, [
    { name: "Ring One Boxing", ...COMPLETED, firstRun: "not_started", ...overrides },
  ]);
  await page.goto(`/en/app/gyms/${idOf(api, "Ring One Boxing")}`);
  return api;
}

test.describe("GRW1 · first visit", () => {
  test("the owner gets the introduction and the backend's five checklist items, nothing invented", async ({
    page,
  }) => {
    const api = await openOwner(page);
    await expect(intro(page)).toHaveAttribute("data-first-run-intro", "not_started");
    await expect(page.getByRole("heading", { name: "Welcome to your gym console" })).toBeVisible();
    const rows = checklist(page).locator("[data-checklist-key]");
    await expect(rows).toHaveCount(5);
    expect(
      await rows.evaluateAll((all) => all.map((row) => row.getAttribute("data-checklist-key"))),
    ).toEqual(KEYS);
    await expect(checklist(page).locator("[data-checklist-status=completed]")).toHaveCount(1);
    // SF-93/SF-94: inviting staff is available and leads to the staff page.
    await expect(checklist(page).getByText("Coming later")).toHaveCount(3);
    await expect(checklist(page).getByRole("link")).toHaveCount(1);
    await expect(checklist(page).getByRole("link", { name: "Invite your staff" })).toHaveAttribute(
      "href",
      /\/app\/gyms\/[^/]+\/staff$/,
    );
    await expect(checklist(page)).not.toContainText(/\d+\s*(\/|of)\s*\d+|%/);
    await expect(page.locator("main")).not.toContainText(
      /PLN|MRR|revenue|members joined|invites sent|published/i,
    );
    expect(writes(api)).toEqual([]);
    await shot(page, "grw1-not-started-1440-dark");
  });

  test("1440 geometry: GRW1's two columns, the introduction above the checklist, the gym beside", async ({
    page,
  }) => {
    await openOwner(page);
    await expect(checklist(page)).toBeVisible();
    const main = await box(page.locator("main"));
    const introBox = await box(intro(page));
    const listBox = await box(checklist(page));
    const summary = await box(page.locator("[data-tour-target=gym-summary]"));
    const access = await box(page.locator("[data-tour-target=gym-access]"));
    // The 240 px sidebar, then the console.
    expect(main.x).toBe(240);
    // Left column: introduction, then the checklist, 16 px apart, one width.
    expect(listBox.y - (introBox.y + introBox.height)).toBe(16);
    expect(listBox.x).toBe(introBox.x);
    expect(listBox.width).toBe(introBox.width);
    // Right column: the gym above its access, 1.7 : 1 with a 16 px gap.
    expect(summary.y).toBe(introBox.y);
    expect(access.y - (summary.y + summary.height)).toBe(16);
    expect(summary.x - (introBox.x + introBox.width)).toBe(16);
    expect(introBox.width / summary.width).toBeCloseTo(1.7, 1);
    expect(await overflow(page)).toBe(0);
  });

  test("an introduction started on another device is offered to resume", async ({ page }) => {
    const api = await openOwner(page, {
      firstRun: "in_progress",
      startedAt: "2026-10-26T08:00:00Z",
    });
    await expect(page.getByRole("heading", { name: "Pick up the introduction" })).toBeVisible();
    await expect(page.getByText(/You started it on .*Oct.*26/)).toBeVisible();
    await page.getByRole("button", { name: "Resume tour" }).click();
    await expect(page.getByRole("dialog", { name: "Your opening checklist" })).toBeVisible();
    expect(writes(api)).toEqual(["start"]);
    await shot(page, "grw2-resumed-step1-1440-dark");
  });

  test("managers never ask for the owner's first run", async ({ page }) => {
    const api = await start(page, [
      { name: "Annex Club", role: "manager", ...COMPLETED, firstRun: "not_started" },
    ]);
    await page.goto(`/en/app/gyms/${idOf(api, "Annex Club")}`);
    await expect(page.getByText(/The Manager dashboard isn’t available yet/)).toBeVisible();
    await expect(intro(page)).toHaveCount(0);
    expect(firstRunCalls(api)).toEqual([]);
  });
});

test.describe("GRW2 · the tour", () => {
  test("four real targets, each spotlighted with its card beside it, then finish and never again", async ({
    page,
  }) => {
    const api = await openOwner(page);
    await page.getByRole("button", { name: "Start the tour" }).click();
    const steps = [
      ["checklist", "Your opening checklist", "[data-gym-checklist]", "right"],
      ["gym", "Your gym and your access", "[data-tour-target=gym-summary]", "left"],
      ["menu", "Tools arrive in this menu", "aside [data-nav-item][aria-disabled=true]", "right"],
      ["switcher", "One account, every role", "aside [data-tour-target=workspace]", "right"],
    ] as const;
    for (const [index, [id, title, target, side]] of steps.entries()) {
      const card = page.getByRole("dialog", { name: title });
      await expect(card).toBeVisible();
      await expect(tour(page)).toHaveAttribute("data-gym-tour", id);
      await expect(card.getByText(`Tour · ${index + 1} of 4`, { exact: true })).toBeVisible();
      await settle(card);
      const spot = await box(page.locator(`[data-tour-spotlight=${id}]`));
      const anchor = await box(page.locator(target).first());
      const cardBox = await box(card);
      // The spotlight surrounds its target; the card sits beside it, on screen.
      expect(spot.x).toBeLessThanOrEqual(anchor.x);
      expect(spot.y).toBeLessThanOrEqual(anchor.y);
      if (side === "right") expect(cardBox.x).toBeGreaterThanOrEqual(spot.x + spot.width);
      else expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(spot.x);
      expect(cardBox.x).toBeGreaterThanOrEqual(0);
      expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(1440);
      expect(cardBox.y).toBeGreaterThanOrEqual(0);
      expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(900);
      // Focus stays in the card.
      expect(await card.evaluate((element) => element.contains(document.activeElement))).toBe(true);
      await shot(page, `grw2-step${index + 1}-${id}-1440-dark`);
      if (index < 3) await card.getByRole("button", { name: "Next" }).click();
    }
    // The steps themselves record nothing.
    expect(writes(api)).toEqual(["start"]);
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByRole("dialog", { name: "You know your way around" })).toBeVisible();
    expect(writes(api)).toEqual(["start", "complete"]);
    await shot(page, "grw2-done-1440-dark");
    await page.getByRole("button", { name: "Back to the dashboard" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("[data-first-run-outcome=completed]")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeFocused();
    await shot(page, "grw1-completed-1440-dark");
    // A new visit: completed never reopens.
    await page.reload();
    await expect(page.getByRole("region", { name: "Gym details" })).toBeVisible();
    await expect(intro(page)).toHaveCount(0);
    await expect(page.locator("[data-gym-dashboard]")).toHaveAttribute("data-first-run", "off");
  });

  test("keyboard: arrows move, Escape asks before ending, focus returns to the page", async ({
    page,
  }) => {
    const api = await openOwner(page);
    await page.getByRole("button", { name: "Start the tour" }).click();
    await expect(page.getByRole("dialog", { name: "Your opening checklist" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("dialog", { name: "Your gym and your access" })).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("dialog", { name: "Your opening checklist" })).toBeVisible();
    // Tab stays inside the card.
    for (let press = 0; press < 6; press += 1) {
      await page.keyboard.press("Tab");
      expect(await tour(page).evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
    }
    await page.keyboard.press("Escape");
    const confirm = page.getByRole("dialog", { name: "End the introduction?" });
    await expect(confirm).toBeVisible();
    await shot(page, "grw2-end-confirm-1440-dark");
    expect(writes(api)).toEqual(["start"]);
    await confirm.getByRole("button", { name: "End introduction" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("[data-first-run-outcome=dismissed]")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeFocused();
    expect(writes(api)).toEqual(["start", "dismiss"]);
    await page.reload();
    await expect(page.getByRole("region", { name: "Gym details" })).toBeVisible();
    await expect(intro(page)).toHaveCount(0);
  });

  test("a failed finish keeps step 4 with Try again; nothing is shown as saved", async ({
    page,
  }) => {
    const api = await openOwner(page);
    await page.getByRole("button", { name: "Start the tour" }).click();
    for (let step = 0; step < 3; step += 1)
      await page.getByRole("button", { name: "Next" }).click();
    api.failWrites(1);
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByRole("dialog", { name: "We couldn’t save that" })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Nothing changed");
    await shot(page, "grw2-finish-failed-1440-dark");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("dialog", { name: "You know your way around" })).toBeVisible();
  });
});

test.describe("GRW1 · skip, failures and other devices", () => {
  test("skip asks first, records dismissed and completes nothing", async ({ page }) => {
    const api = await openOwner(page);
    await page.getByRole("button", { name: "Skip introduction" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Skip the introduction?" });
    await expect(dialog).toBeVisible();
    await settle(dialog);
    await shot(page, "grw1-skip-confirm-1440-dark");
    expect(writes(api)).toEqual([]);
    await dialog.getByRole("button", { name: "Skip introduction" }).click();
    await expect(page.locator("[data-first-run-outcome=dismissed]")).toBeVisible();
    await expect(checklist(page).locator("[data-checklist-status=coming_later]")).toHaveCount(3);
    expect(writes(api)).toEqual(["dismiss"]);
    await shot(page, "grw1-dismissed-1440-dark");
  });

  test("a failed start says nothing changed and opens no tour", async ({ page }) => {
    const api = await openOwner(page);
    api.failWrites(1);
    await page.getByRole("button", { name: "Start the tour" }).click();
    await expect(intro(page).getByRole("alert")).toHaveText(
      "We couldn’t save that. Nothing changed.",
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await shot(page, "grw1-start-failed-1440-dark");
  });

  test("an unreadable first run keeps the console working, and retries", async ({ page }) => {
    const api = await start(page, [
      { name: "Ring One Boxing", ...COMPLETED, firstRun: "not_started" },
    ]);
    const id = idOf(api, "Ring One Boxing");
    await page.route(
      `**/api/v1/gyms/${id}/first-run`,
      (route) => route.abort("internetdisconnected"),
      { times: 1 },
    );
    await page.goto(`/en/app/gyms/${id}`);
    await expect(page.locator("[data-first-run-unavailable]")).toBeVisible();
    await expect(page.locator("[data-tour-target=gym-summary]")).toBeVisible();
    await shot(page, "grw1-unavailable-1440-dark");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(intro(page)).toBeVisible();
  });

  test("finished on another device while open: the introduction goes away on focus, never reopens", async ({
    page,
  }) => {
    const api = await openOwner(page);
    await expect(intro(page)).toBeVisible();
    api.externalFirstRun(idOf(api, "Ring One Boxing"), "completed");
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(intro(page)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Gym details" })).toBeVisible();
  });

  test("starting after another device finished shows the kept outcome (409)", async ({ page }) => {
    const api = await openOwner(page);
    await expect(intro(page)).toBeVisible();
    api.externalFirstRun(idOf(api, "Ring One Boxing"), "completed");
    await page.getByRole("button", { name: "Start the tour" }).click();
    await expect(page.locator("[data-first-run-outcome=completed]")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("gym A and gym B keep their own first run", async ({ page }) => {
    const api = await start(page, [
      { name: "Ring One Boxing", ...COMPLETED, firstRun: "completed" },
      { name: "Annex Club", ...COMPLETED, firstRun: "not_started" },
    ]);
    await page.goto(`/en/app/gyms/${idOf(api, "Ring One Boxing")}`);
    await expect(page.getByRole("region", { name: "Gym details" })).toBeVisible();
    await expect(intro(page)).toHaveCount(0);
    await page.goto(`/en/app/gyms/${idOf(api, "Annex Club")}`);
    await expect(intro(page)).toHaveAttribute("data-first-run-intro", "not_started");
    await page.getByRole("button", { name: "Skip introduction" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Skip introduction" }).click();
    await expect(page.locator("[data-first-run-outcome=dismissed]")).toBeVisible();
    await page.goto(`/en/app/gyms/${idOf(api, "Ring One Boxing")}`);
    await expect(page.getByRole("region", { name: "Gym details" })).toBeVisible();
    const paths = writes(api);
    expect(paths).toEqual(["dismiss"]);
    expect(
      firstRunCalls(api)
        .filter((call) => call.method === "POST")
        .map((call) => call.path),
    ).toEqual([`/api/v1/gyms/${idOf(api, "Annex Club")}/first-run/dismiss`]);
  });
});

test.describe("responsive, themes and accessibility", () => {
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1280, 720],
    [1024, 768],
    [768, 1024],
    [390, 844],
  ] as const) {
    test(`${width} × ${height}: GRW1 fits, and every tour card stays on screen`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openOwner(page);
      await expect(intro(page)).toBeVisible();
      expect(await overflow(page)).toBe(0);
      const introBox = await box(intro(page));
      expect(introBox.x + introBox.width).toBeLessThanOrEqual(width);
      await shot(page, `grw1-not-started-${width}-dark`);
      await page.getByRole("button", { name: "Start the tour" }).click();
      for (let step = 0; step < 4; step += 1) {
        const card = tour(page);
        await expect(card).toBeVisible();
        await settle(card);
        const cardBox = await box(card);
        expect(cardBox.x).toBeGreaterThanOrEqual(0);
        expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(width);
        expect(cardBox.y).toBeGreaterThanOrEqual(0);
        expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(height);
        if (step === 0 || width < 768) await shot(page, `grw2-step${step + 1}-${width}-dark`);
        if (step < 3) await card.getByRole("button", { name: "Next" }).click();
      }
    });
  }

  for (const scheme of ["dark", "light"] as const) {
    test(`axe: GRW1, the skip dialog and the tour in the ${scheme} theme`, async ({ page }) => {
      // The app's own theme setting (next-themes, dark by default), not only the OS preference.
      await page.emulateMedia({ colorScheme: scheme });
      await page.addInitScript((theme) => localStorage.setItem("simplefit-theme", theme), scheme);
      await openOwner(page);
      await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${scheme}\\b`));
      await expect(checklist(page)).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      await shot(page, `grw1-not-started-1440-${scheme}`);
      await page.getByRole("button", { name: "Skip introduction" }).click();
      const dialog = page.getByRole("alertdialog");
      await settle(dialog);
      // The dialog is portalled to <body> (Radix), outside the landmarks.
      expect((await axeViolations(page)).filter((rule) => !rule.startsWith("region "))).toEqual([]);
      await dialog.getByRole("button", { name: "Keep it" }).click();
      await expect(page.getByRole("button", { name: "Skip introduction" })).toBeFocused();
      await page.getByRole("button", { name: "Start the tour" }).click();
      const card = tour(page);
      await settle(card);
      expect((await axeViolations(page)).filter((rule) => !rule.startsWith("region "))).toEqual([]);
      await shot(page, `grw2-step1-1440-${scheme}`);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "End the introduction?" })).toBeVisible();
      await settle(tour(page));
      expect((await axeViolations(page)).filter((rule) => !rule.startsWith("region "))).toEqual([]);
    });
  }
});
