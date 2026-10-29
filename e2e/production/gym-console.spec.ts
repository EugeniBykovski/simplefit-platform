import { expect, test, type Page } from "@playwright/test";

import { gymApi, type Gym, type GymApi } from "./gym-api";
import { axeViolations, box, expectBox, overflow } from "./harness";
import { onboardingApi } from "./onboarding-api";

/*
 * The web gym console, chooser and switcher on the production build
 * (SF-88): the real routes (`/app/gyms`, `/app/gyms/:gymId`), their gates and
 * components against test doubles of the SF-83 / SF-84 / SF-85 APIs
 * (./gym-api in console mode over ./onboarding-api). What a page may show is
 * the double's answer for the gym in its path; nothing is decided from the
 * URL or browser state.
 */

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

const dashboard = (page: Page) => page.getByRole("heading", { level: 1, name: "Dashboard" });
const gymName = (page: Page) => page.locator("[data-gym-name]");

/**
 * The owner's dashboard renders GRW1's loading layout (the gym summary in the
 * side column) until the first-run read settles, then the gym summary moves
 * (and remounts) into the main column. Measure only after that.
 */
const settledDashboard = (page: Page) =>
  expect(page.locator("[data-gym-dashboard]")).not.toHaveAttribute("data-first-run", "loading");
const gymReads = (api: GymApi) =>
  api.requests.filter(
    (request) => request.method === "GET" && /^\/api\/v1\/gyms\//.test(request.path),
  );

async function start(page: Page, gyms: Partial<Gym>[], options: { fighter?: boolean } = {}) {
  await onboardingApi(page, { tour: "completed" });
  return gymApi(page, { console: true, gyms, ...options });
}

const idOf = (api: GymApi, name: string) => {
  const gym = api.gyms().find((candidate) => candidate.name === name);
  if (!gym) throw new Error(`no gym ${name}`);
  return gym.id;
};

const openSwitcher = async (page: Page, name: RegExp) => {
  await page.getByRole("complementary").getByRole("button", { name }).click();
  return page.getByRole("menu");
};

test.describe("entry and the chooser", () => {
  test("one completed gym: /app opens its console with the real gym, no choice asked", async ({
    page,
  }) => {
    const api = await start(page, [
      { name: "Ring One Boxing", phone: "+48 58 000 00 00", ...COMPLETED },
    ]);
    const id = idOf(api, "Ring One Boxing");
    await page.goto("/en/app");
    await page.waitForURL(`**/en/app/gyms/${id}`);
    await expect(dashboard(page)).toBeVisible();
    await expect(gymName(page)).toHaveText("Ring One Boxing");
    await expect(page.getByText("Boxing gym · Gdańsk, Poland")).toBeVisible();
    await expect(page.getByText("+48 58 000 00 00")).toBeVisible();
    // SF-82 R5: nothing invented, not even zeros.
    await expect(page.locator("main")).not.toContainText(/PLN|MRR|check-ins today|active members/i);
  });

  test("several gyms: the entry lands on the chooser; a choice is recorded and opens that gym", async ({
    page,
  }) => {
    const api = await start(page, [
      { name: "Ring One Boxing", ...COMPLETED },
      { name: "Annex Club", role: "manager", ...COMPLETED },
    ]);
    await page.goto("/en/app?intent=gym");
    await page.waitForURL("**/en/app/gyms");
    const gyms = page.getByRole("region", { name: "Gyms" });
    await expect(gyms.getByRole("button")).toHaveCount(2);
    await gyms.getByRole("button", { name: /Annex Club/ }).click();
    const annex = idOf(api, "Annex Club");
    await page.waitForURL(`**/en/app/gyms/${annex}`);
    await expect(gymName(page)).toHaveText("Annex Club");
    expect(api.lastGym()).toBe(annex);
  });

  test("a completed gym and a draft: the draft only continues setup, never as a console", async ({
    page,
  }) => {
    const api = await start(page, [
      { name: "Ring One Boxing", ...COMPLETED },
      { name: "Draft Hall", status: "draft" },
    ]);
    await page.goto("/en/app/gyms");
    await expect(page.getByRole("region", { name: "Gyms" }).getByRole("button")).toHaveCount(1);
    const setup = page.getByRole("region", { name: "Setup in progress" });
    await expect(setup.getByRole("button", { name: /Draft Hall/ })).toBeVisible();
    // Opening the draft's URL directly shows the draft state, not a dashboard.
    await page.goto(`/en/app/gyms/${idOf(api, "Draft Hall")}`);
    await expect(page.getByText("This gym isn’t set up yet")).toBeVisible();
    await expect(dashboard(page)).toHaveCount(0);
    await page.getByRole("link", { name: "Continue setup" }).click();
    await page.waitForURL(/\/en\/app\/onboarding\/gym\?.*intent=gym/);
  });

  test("no gym: the chooser offers registration and creates nothing", async ({ page }) => {
    const api = await start(page, [], { fighter: true });
    await page.goto("/en/app/gyms");
    await expect(page.getByRole("heading", { name: "You don’t work at a gym yet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Register your gym" })).toBeVisible();
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });
});

test.describe("switching, tabs and history", () => {
  test("the sidebar switcher moves from gym A to gym B; only B's data is shown", async ({
    page,
  }) => {
    const api = await start(page, [
      { name: "Ring One Boxing", ...COMPLETED },
      { name: "Annex Club", role: "manager", ...COMPLETED },
    ]);
    const ring = idOf(api, "Ring One Boxing");
    const annex = idOf(api, "Annex Club");
    await page.goto(`/en/app/gyms/${ring}`);
    await expect(gymName(page)).toHaveText("Ring One Boxing");
    const menu = await openSwitcher(page, /Ring One Boxing, Owner/);
    await expect(menu.getByRole("menuitemradio", { name: /Ring One Boxing/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await menu.getByRole("menuitemradio", { name: /Annex Club/ }).click();
    await page.waitForURL(`**/en/app/gyms/${annex}`);
    await expect(gymName(page)).toHaveText("Annex Club");
    await expect(page.getByText("Ring One Boxing")).toHaveCount(0);
    await expect(page.getByText(/The Manager dashboard isn’t available yet/)).toBeVisible();
    await expect(page.locator("#main")).toBeFocused();

    // Back and forward restore each gym from its own URL.
    await page.goBack();
    await page.waitForURL(`**/en/app/gyms/${ring}`);
    await expect(gymName(page)).toHaveText("Ring One Boxing");
    await page.goForward();
    await page.waitForURL(`**/en/app/gyms/${annex}`);
    await expect(gymName(page)).toHaveText("Annex Club");
    // A reload keeps the gym its URL names.
    await page.reload();
    await expect(gymName(page)).toHaveText("Annex Club");
  });

  test("two tabs keep their own gyms, whatever the other chooses", async ({ context }) => {
    // One backend for both tabs.
    await onboardingApi(context, { tour: "completed" });
    const api = await gymApi(context, {
      console: true,
      gyms: [
        { name: "Ring One Boxing", ...COMPLETED },
        { name: "Annex Club", role: "manager", ...COMPLETED },
      ],
    });
    const ring = idOf(api, "Ring One Boxing");
    const annex = idOf(api, "Annex Club");
    const first = await context.newPage();
    await first.goto(`/en/app/gyms/${ring}`);
    await expect(gymName(first)).toHaveText("Ring One Boxing");
    const second = await context.newPage();
    await second.goto(`/en/app/gyms/${annex}`);
    await expect(gymName(second)).toHaveText("Annex Club");
    // The second tab chooses its gym explicitly (the landing preference moves).
    const menu = await openSwitcher(second, /Annex Club, Manager/);
    await menu.getByRole("menuitemradio", { name: /Ring One Boxing/ }).click();
    await second.waitForURL(`**/en/app/gyms/${ring}`);
    expect(api.lastGym()).toBe(ring);
    await menu.page().goBack();
    await second.waitForURL(`**/en/app/gyms/${annex}`);
    // The first tab regains focus and re-reads the gym its own URL names.
    const before = gymReads(api).length;
    await first.bringToFront();
    await first.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => gymReads(api).length).toBeGreaterThan(before);
    await expect(gymName(first)).toHaveText("Ring One Boxing");
    await expect(gymName(second)).toHaveText("Annex Club");
    expect(first.url()).toContain(ring);
  });

  test("a late answer for the previous gym never shows in the next one", async ({ page }) => {
    const api = await start(page, [
      { name: "Ring One Boxing", ...COMPLETED },
      { name: "Annex Club", role: "manager", ...COMPLETED },
    ]);
    const ring = idOf(api, "Ring One Boxing");
    const annex = idOf(api, "Annex Club");
    await page.goto(`/en/app/gyms/${ring}`);
    await expect(gymName(page)).toHaveText("Ring One Boxing");
    // Gym A's next read is held; the switch to B happens while it is open.
    const release = api.hold(ring);
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    const menu = await openSwitcher(page, /Ring One Boxing, Owner/);
    await menu.getByRole("menuitemradio", { name: /Annex Club/ }).click();
    await page.waitForURL(`**/en/app/gyms/${annex}`);
    await expect(gymName(page)).toHaveText("Annex Club");
    release();
    await page.waitForTimeout(300);
    await expect(gymName(page)).toHaveText("Annex Club");
    await expect(page.getByText("Ring One Boxing")).toHaveCount(0);
  });
});

test.describe("access", () => {
  test("the owner sees the gym details; other roles a limited dashboard and no setup read", async ({
    page,
  }) => {
    const api = await start(page, [
      { name: "Ring One Boxing", tagline: "Box every day", ...COMPLETED },
      { name: "Annex Club", role: "front_desk", ...COMPLETED },
    ]);
    await page.goto(`/en/app/gyms/${idOf(api, "Ring One Boxing")}`);
    await expect(page.getByRole("region", { name: "Gym details" })).toContainText("Box every day");
    const annex = idOf(api, "Annex Club");
    await page.goto(`/en/app/gyms/${annex}`);
    await expect(page.getByText(/The Front desk dashboard isn’t available yet/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Gym details" })).toHaveCount(0);
    expect(gymReads(api).some((request) => request.path === `/api/v1/gyms/${annex}/setup`)).toBe(
      false,
    );
  });

  test("another gym's id: not available, nothing of it shown, existence not revealed", async ({
    page,
  }) => {
    const api = await start(page, [{ name: "Ring One Boxing", ...COMPLETED }]);
    const foreign = "4f0e8a2b-6c1d-4e73-9a5b-2d8c0f6e1a39";
    await page.goto(`/en/app/gyms/${foreign}`);
    await expect(page.getByText("This gym isn’t available")).toBeVisible();
    await expect(dashboard(page)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Your gyms" })).toHaveAttribute(
      "href",
      "/en/app/gyms",
    );
    expect(gymReads(api).map((request) => request.path)).toEqual([`/api/v1/gyms/${foreign}`]);
  });

  test("a membership revoked while the console is open: the gym disappears on the next read", async ({
    page,
  }) => {
    const api = await start(page, [
      { name: "Ring One Boxing", ...COMPLETED },
      { name: "Annex Club", role: "coach", ...COMPLETED },
    ]);
    const annex = idOf(api, "Annex Club");
    await page.goto(`/en/app/gyms/${annex}`);
    await expect(gymName(page)).toHaveText("Annex Club");
    api.revoke(annex);
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByText("This gym isn’t available")).toBeVisible();
    await expect(page.getByText("Annex Club")).toHaveCount(0);
    // The chooser no longer lists it.
    await page.goto("/en/app/gyms");
    await page.waitForURL(`**/en/app/gyms/${idOf(api, "Ring One Boxing")}`);
  });

  test("sign out leaves the console; the console then asks for sign-in again", async ({ page }) => {
    const api = await start(page, [{ name: "Ring One Boxing", ...COMPLETED }]);
    const id = idOf(api, "Ring One Boxing");
    await page.goto(`/en/app/gyms/${id}`);
    await expect(dashboard(page)).toBeVisible();
    await page.getByRole("complementary").getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL((url) => url.pathname === "/en/login");
    await page.goto(`/en/app/gyms/${id}`);
    await page.waitForURL((url) => url.pathname === "/en/login");
  });
});

test.describe("failures", () => {
  test("a backend outage shows a recoverable failure, never an empty gym", async ({ page }) => {
    const api = await start(page, [{ name: "Ring One Boxing", ...COMPLETED }]);
    // The production client retries a dropped connection twice before failing.
    api.failReads(3);
    await page.goto(`/en/app/gyms/${idOf(api, "Ring One Boxing")}`);
    const retry = page.getByRole("button", { name: /Try again/ });
    await expect(retry).toBeVisible();
    await expect(dashboard(page)).toHaveCount(0);
    await retry.click();
    await expect(gymName(page)).toHaveText("Ring One Boxing");
  });
});

test.describe("geometry and accessibility", () => {
  const near = (actual: number, expected: number, tolerance = 2) =>
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

  test("WG1 at the artboard (1440 × 900): sidebar, identity, header and two columns", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const api = await start(page, [{ name: "Ring One Boxing", ...COMPLETED }]);
    await page.goto(`/en/app/gyms/${idOf(api, "Ring One Boxing")}`);
    await settledDashboard(page);
    await expect(gymName(page)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expectBox(page.getByRole("complementary"), { x: 0, y: 0, w: 240, h: 900 });
    const trigger = await box(
      page.getByRole("complementary").getByRole("button", { name: /Ring One Boxing, Owner/ }),
    );
    near(trigger.x, 14);
    near(trigger.width, 212);
    const header = await box(page.locator("main header").first());
    near(header.x, 240);
    near(header.height, 76);
    near((await box(page.getByRole("heading", { level: 1 }))).x, 272);
    const summary = await box(page.getByRole("region", { name: "Your gym" }));
    const access = await box(page.getByRole("region", { name: "Your access" }));
    near(summary.x, 272);
    near(summary.y, 98);
    near(access.y, 98);
    near(access.x - (summary.x + summary.width), 16);
    near(summary.width, ((1136 - 16) * 1.7) / 2.7, 3);
    near(access.x + access.width, 1408);
    expect(await overflow(page)).toBe(0);
  });

  for (const [width, height] of [
    [1920, 1080],
    [1728, 1117],
    [1512, 982],
    [1440, 900],
    [1366, 768],
    [1280, 720],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [375, 812],
  ] as const) {
    test(`${width} × ${height}: no horizontal overflow, long names wrap, nothing clipped`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      const api = await start(page, [
        {
          name: "Bokserski Klub Sportowy Wybrzeże Gdańsk Gdynia Sopot Akademia",
          ...COMPLETED,
        },
      ]);
      await page.goto(`/en/app/gyms/${api.gyms()[0]?.id}`);
      await settledDashboard(page);
      await expect(gymName(page)).toBeVisible();
      expect(await overflow(page)).toBe(0);
      const name = await box(gymName(page));
      expect(name.x + name.width).toBeLessThanOrEqual(width);
      if (width >= 768) await expect(page.getByRole("complementary")).toBeVisible();
      else await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    });
  }

  for (const scheme of ["dark", "light"] as const) {
    test(`axe: the console, the switcher and the chooser in the ${scheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const api = await start(page, [
        { name: "Ring One Boxing", ...COMPLETED },
        { name: "Annex Club", role: "manager", ...COMPLETED },
        { name: "Draft Hall", status: "draft" },
      ]);
      await page.goto(`/en/app/gyms/${idOf(api, "Ring One Boxing")}`);
      await expect(page.getByRole("region", { name: "Gym details" })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      const menu = await openSwitcher(page, /Ring One Boxing, Owner/);
      await menu.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      // The menu is portalled to <body> (Radix), outside the landmarks.
      expect((await axeViolations(page)).filter((rule) => !rule.startsWith("region "))).toEqual([]);
      await page.keyboard.press("Escape");
      await page.goto("/en/app/gyms");
      await expect(page.getByRole("region", { name: "Gyms" })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      await page.goto("/en/app/gyms/4f0e8a2b-6c1d-4e73-9a5b-2d8c0f6e1a39");
      await expect(page.getByText("This gym isn’t available")).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });
  }

  test("keyboard: the switcher opens, moves and closes with focus restored", async ({ page }) => {
    const api = await start(page, [
      { name: "Ring One Boxing", ...COMPLETED },
      { name: "Annex Club", role: "manager", ...COMPLETED },
    ]);
    await page.goto(`/en/app/gyms/${idOf(api, "Ring One Boxing")}`);
    const trigger = page
      .getByRole("complementary")
      .getByRole("button", { name: /Ring One Boxing, Owner/ });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
