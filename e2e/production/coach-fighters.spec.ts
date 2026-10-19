import { expect, test, type Page } from "@playwright/test";

import { axeViolations, box, overflow, VIEWPORTS } from "./harness";
import { onboardingApi } from "./onboarding-api";

/*
 * Coach fighters on the production build (SF-58), against Claude Design
 * 1792056621-3707: WC7 WebCoachFighters (roster and invitations), WC4
 * WebFighter360 and CoachWebNav with Fighters linked. The SF-56 / SF-57
 * endpoints are mocked at the network edge; everything else is the real
 * route, gate, shell and screen. At the artboard size the roster and the
 * 360 px invitations column sit top-aligned; across the laptop matrix and on
 * narrow windows nothing overflows and axe is clean.
 */

const FIGHTER = {
  display_name: "Alex N.",
  username: "alex_n",
  country_code: "PL",
  city: "Warsaw",
  experience_level: "amateur",
  stance: "orthodox",
};
const COACH = {
  display_name: "Alex Novak",
  brand_name: "Novak Boxing",
  country_code: "PL",
  city: "Warsaw",
  bio: "Footwork-first boxing.",
  languages: ["en", "pl"],
  coaching_formats: ["personal_training"],
  competition_levels: ["amateur"],
};
const BOTH = { fields: FIGHTER, completed: true, coachFields: COACH, coachCompleted: true };

const relationship = (id: string, name: string, extra = {}) => ({
  relationship_id: id,
  status: "active",
  started_at: "2026-09-01T10:00:00Z",
  ended_at: null,
  ended_by: null,
  disclosure_version: "e2e-disclosure",
  disclosed_fields: [
    "display_name",
    "username",
    "country_code",
    "city",
    "experience_level",
    "stance",
    "amateur_bout_count",
  ],
  fighter: {
    display_name: name,
    username: name.toLowerCase().replace(/\W+/g, "_"),
    country_code: "UA",
    city: "Kharkiv",
    experience_level: "competitive_amateur",
    stance: "southpaw",
    amateur_bout_count: 41,
  },
  fighter_display_name_at_end: null,
  ...extra,
});

const ACTIVE = [
  relationship("rel-1", "Alex K."),
  relationship("rel-2", "Oleksandr Petrenko-Kowalczyk"),
];
const ENDED = {
  ...relationship("rel-9", "x"),
  status: "ended",
  ended_at: "2026-10-02T10:00:00Z",
  ended_by: "coach",
  disclosed_fields: [],
  fighter: null,
  fighter_display_name_at_end: "Sam R.",
};
const INVITATIONS = [
  {
    invitation_id: "inv-1",
    status: "pending",
    recipient_email: "j•••@example.com",
    message: null,
    created_at: "2026-10-10T10:00:00Z",
    expires_at: "2026-10-24T10:00:00Z",
    last_sent_at: "2026-10-10T10:00:00Z",
    resends_remaining: 2,
    responded_at: null,
  },
  {
    invitation_id: "inv-2",
    status: "declined",
    recipient_email: "a•••@example.com",
    message: null,
    created_at: "2026-10-01T10:00:00Z",
    expires_at: "2026-10-15T10:00:00Z",
    last_sent_at: "2026-10-01T10:00:00Z",
    resends_remaining: 0,
    responded_at: "2026-10-03T10:00:00Z",
  },
];

type Options = { sharing?: boolean; rules?: boolean; pendingRules?: boolean; empty?: boolean };

// The backend's approved text (SF-72): an E2E fixture, never legal copy.
const RULES_DOCUMENT = {
  document_id: "coach-data-rules",
  version: "e2e-rules",
  status: "published",
  effective_at: "2026-01-01T00:00:00Z",
  published_at: "2026-01-01T00:00:00Z",
  requested_language: "en",
  language: "en",
  available_languages: ["en"],
  content_sha256: "e".repeat(64),
  title: "E2E fixture rules",
  summary: "E2E FIXTURE, not a legal text. Coaching purposes only.",
  checkbox: "E2E FIXTURE: I will follow the rules ({version}).",
  full: "# E2E fixture rules\n\nE2E FIXTURE, not a legal text.\n\n- Coaching purposes only",
};

/** The SF-56 / SF-57 coach endpoints; every request is recorded. */
async function coachingApi(
  page: Page,
  { sharing = true, rules = false, pendingRules = false, empty = false }: Options = {},
) {
  const requests: string[] = [];
  let ended = false;
  let acknowledged = false;
  await page.route(
    (url) =>
      url.port !== "3100" &&
      /^\/api\/v1\/me\/coach\/(fighters|invitations|data-rules)/.test(url.pathname),
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      requests.push(`${request.method()} ${url.pathname}${url.search}`);
      const json = (status: number, body?: unknown) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: body === undefined ? "" : JSON.stringify(body),
        });
      const notFound = () =>
        json(404, { error: { code: "not_found", message: "", details: {}, request_id: null } });
      const path = url.pathname.replace("/api/v1/me/coach/", "");

      if (path === "data-rules/acknowledge") acknowledged = true;
      if (path === "data-rules" || path === "data-rules/acknowledge") {
        const published = rules || pendingRules;
        return json(200, {
          data_rules: published
            ? {
                document_version: "e2e-rules",
                acknowledged_at: rules || acknowledged ? "2026-10-01T10:00:00Z" : null,
                document: RULES_DOCUMENT,
              }
            : { document_version: null, acknowledged_at: null, document: null },
        });
      }
      if (!sharing) return notFound();
      if (path === "fighters") {
        const status = url.searchParams.get("status");
        const list = empty ? [] : status === "ended" ? [ENDED] : ended ? ACTIVE.slice(1) : ACTIVE;
        return json(200, { relationships: list, next_cursor: null });
      }
      if (path === "fighters/rel-1")
        return ended ? notFound() : json(200, { relationship: ACTIVE[0] });
      if (path === "fighters/rel-1/end" && request.method() === "POST") {
        ended = true;
        return route.fulfill({ status: 204 });
      }
      if (path === "invitations")
        return json(200, { invitations: empty ? [] : INVITATIONS, next_cursor: null });
      return notFound();
    },
  );
  return requests;
}

async function openRoster(page: Page, options: Options = {}, query = "") {
  await onboardingApi(page, { ...BOTH, lastContext: "coach", tour: "completed" });
  const requests = await coachingApi(page, options);
  await page.goto(`/en/app/coach/fighters${query}`);
  await page.getByRole("heading", { level: 1, name: "Fighters" }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  return requests;
}

/**
 * Axe on an open dialog, measured once its opening animation has settled.
 * Radix portals it to <body>, outside the landmarks; every other rule applies.
 */
async function dialogViolations(page: Page) {
  const dialog = page.locator("[role=dialog], [role=alertdialog]");
  await dialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  return (await axeViolations(page)).filter((rule) => !rule.startsWith("region "));
}

const near = (actual: number, expected: number, tolerance = 2) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

const roster = (page: Page) => page.getByRole("region", { name: "Your fighters" });
const invitations = (page: Page) => page.getByRole("region", { name: "Invitations" });

test.describe("WC7 at the artboard size (1440 × 900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the Coach nav links Fighters, and the roster and 360 px invitations sit top-aligned", async ({
    page,
  }) => {
    await onboardingApi(page, { ...BOTH, lastContext: "coach", tour: "completed" });
    await coachingApi(page);
    await page.goto("/en/app/coach");
    await page.getByRole("heading", { level: 1, name: "Welcome, Alex Novak" }).waitFor();
    await page.getByRole("complementary").getByRole("link", { name: "Fighters" }).click();
    await page.waitForURL("**/en/app/coach/fighters");
    await page.getByRole("table", { name: "Active fighters" }).waitFor();
    await expect(
      page.getByRole("complementary").getByRole("link", { name: "Fighters" }),
    ).toHaveAttribute("aria-current", "page");

    const list = await box(roster(page));
    const aside = await box(invitations(page));
    near(list.x, 272);
    near(list.y, aside.y);
    near(aside.width, 360);
    near(aside.x + aside.width, 1408);
    near(aside.x - (list.x + list.width), 20);
    expect(await overflow(page)).toBe(0);
    expect(await axeViolations(page)).toEqual([]);
  });

  test("Ended is the query view, and the rows carry only dates and the name at the end", async ({
    page,
  }) => {
    await openRoster(page);
    await page.getByRole("button", { name: "Ended" }).click();
    await page.waitForURL("**/en/app/coach/fighters?view=ended");
    const table = page.getByRole("table", { name: "Ended relationships" });
    await expect(table.getByText("Sam R.")).toBeVisible();
    await expect(table.getByRole("link")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ended" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await axeViolations(page)).toEqual([]);
  });

  test("sharing off: not available, never an empty roster, and inviting disabled", async ({
    page,
  }) => {
    const requests = await openRoster(page, { sharing: false });
    await expect(page.getByText("Fighters aren’t available yet")).toBeVisible();
    await expect(page.getByText("No fighters yet")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Invite fighter" })).toBeDisabled();
    expect(requests.filter((request) => !request.startsWith("GET "))).toEqual([]);
    expect(await axeViolations(page)).toEqual([]);
  });

  test("the composer is blocked truthfully while the data rules are not published", async ({
    page,
  }) => {
    const requests = await openRoster(page);
    await page.getByRole("button", { name: "Invite fighter" }).click();
    const dialog = page.getByRole("dialog", { name: "Inviting isn’t available yet" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
    expect(await dialogViolations(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Invite fighter" })).toBeFocused();
    expect(requests.filter((request) => request.startsWith("POST "))).toEqual([]);
  });

  test("the composer opens in the window with labelled fields once the rules allow it", async ({
    page,
  }) => {
    await openRoster(page, { rules: true });
    await page.getByRole("button", { name: "Invite fighter" }).click();
    const dialog = page.getByRole("dialog", { name: "Invite a fighter" });
    await expect(dialog.getByLabel("Email")).toBeFocused();
    const area = await box(dialog);
    expect(area.x).toBeGreaterThanOrEqual(0);
    expect(area.y + area.height).toBeLessThanOrEqual(900);
    expect(await dialogViolations(page)).toEqual([]);
  });
});

test.describe("WC7 coach data rules (SF-72)", () => {
  for (const { width, height } of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`${width} px: read and acknowledge the approved rules with the keyboard, then invite`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      const requests = await openRoster(page, { pendingRules: true });
      await page.getByRole("button", { name: "Invite fighter" }).click();
      const dialog = page.getByRole("dialog", { name: "Coach data rules" });
      await expect(
        dialog.getByText("E2E FIXTURE, not a legal text. Coaching purposes only."),
      ).toBeVisible();
      await dialog.getByRole("button", { name: "Read the full rules" }).press("Enter");
      await expect(dialog.getByRole("heading", { name: "E2E fixture rules" })).toBeVisible();
      const consent = dialog.getByRole("checkbox", {
        name: /I will follow the rules \(e2e-rules\)/,
      });
      await expect(consent).not.toBeChecked();
      await expect(dialog.getByRole("button", { name: "Acknowledge" })).toBeDisabled();
      await consent.focus();
      await page.keyboard.press("Space");
      await expect(consent).toBeChecked();
      expect(await dialogViolations(page)).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/sf72-wc7-rules-${width}.png` });
      await dialog.getByRole("button", { name: "Acknowledge" }).press("Enter");
      await expect(page.getByRole("dialog", { name: "Invite a fighter" })).toBeVisible();
      expect(requests).toContain("GET /api/v1/me/coach/data-rules?language=en");
      expect(requests).toContain("POST /api/v1/me/coach/data-rules/acknowledge");
    });
  }
});

test.describe("WC4 one fighter", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the row opens WC4; ending needs confirmation and returns to the roster", async ({
    page,
  }) => {
    const requests = await openRoster(page);
    await page.getByRole("link", { name: "Alex K." }).click();
    await page.waitForURL("**/en/app/coach/fighters/rel-1");
    await page.getByRole("heading", { level: 1, name: "Alex K." }).waitFor();
    // The route's metadata title follows the client navigation.
    await expect(page).toHaveTitle(/Fighter/);
    expect(await overflow(page)).toBe(0);
    expect(await axeViolations(page)).toEqual([]);

    await page.getByRole("button", { name: "End relationship" }).click();
    const dialog = page.getByRole("alertdialog", { name: "End your relationship with Alex K.?" });
    await expect(dialog).toBeVisible();
    expect(await dialogViolations(page)).toEqual([]);
    await dialog.getByRole("button", { name: "Keep" }).click();
    await expect(dialog).toHaveCount(0);
    expect(requests.filter((request) => request.startsWith("POST "))).toEqual([]);

    await page.getByRole("button", { name: "End relationship" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "End relationship" }).click();
    await page.waitForURL("**/en/app/coach/fighters");
    await expect(page.getByRole("row", { name: /Alex K\./ })).toHaveCount(0);
    expect(requests).toContain("POST /api/v1/me/coach/fighters/rel-1/end");
  });

  test("an unknown or ended relationship is one not-available state", async ({ page }) => {
    await onboardingApi(page, { ...BOTH, lastContext: "coach", tour: "completed" });
    await coachingApi(page);
    await page.goto("/en/app/coach/fighters/someone-elses");
    await expect(
      page.getByRole("heading", { level: 1, name: "This fighter isn’t available" }),
    ).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });
});

test.describe("across the laptop and desktop matrix", () => {
  for (const [width, height] of VIEWPORTS) {
    test(`${width} × ${height}: two top-aligned columns, nothing clipped`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openRoster(page);
      await page.getByRole("table", { name: "Active fighters" }).waitFor();
      const list = await box(roster(page));
      const aside = await box(invitations(page));
      near(list.y, aside.y);
      near(aside.width, 360);
      expect(list.width).toBeGreaterThan(aside.width);
      expect(await overflow(page)).toBe(0);
      // No cell spills out of the roster card.
      const spill = await roster(page).evaluate((card) => {
        const edge = card.getBoundingClientRect().right;
        return [...card.querySelectorAll("[role=cell]")].filter(
          (cell) => cell.getBoundingClientRect().right > edge + 0.5,
        ).length;
      });
      expect(spill).toBe(0);
    });
  }
});

test.describe("narrow windows", () => {
  for (const [width, height] of [
    [1024, 768],
    [768, 1024],
    [390, 844],
  ] as const) {
    test(`${width} px: no horizontal overflow, axe clean, invitations below the roster under 1024`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openRoster(page);
      await page.getByRole("table", { name: "Active fighters" }).waitFor();
      expect(await overflow(page)).toBe(0);
      const list = await box(roster(page));
      const aside = await box(invitations(page));
      if (width < 1024) expect(aside.y).toBeGreaterThan(list.y + list.height);
      expect(await axeViolations(page)).toEqual([]);

      await page.goto("/en/app/coach/fighters/rel-1");
      await page.getByRole("heading", { level: 1, name: "Alex K." }).waitFor();
      expect(await overflow(page)).toBe(0);
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});

test("no secret or token travels in a URL", async ({ page }) => {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  await openRoster(page, { rules: true });
  await page.getByRole("table", { name: "Active fighters" }).waitFor();
  expect(urls.filter((url) => /[?&#](token|code|secret)=/i.test(url))).toEqual([]);
});

/*
 * Design QA screenshots against Claude Design V98 (1792056621-3707), on the
 * production build with the deterministic fixtures above (no real data):
 * test-results/sf58-*.png, viewport in each file name.
 */
test.describe("Design QA screenshots (V98)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  const shot = (page: Page, name: string) =>
    page.screenshot({ path: `test-results/sf58-${name}.png` });
  const settled = (page: Page) =>
    page
      .locator("[role=dialog], [role=alertdialog]")
      .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));

  test("WC7 and WC4 states", async ({ page }) => {
    await openRoster(page, { empty: true });
    await page.getByText("No fighters yet").waitFor();
    await shot(page, "wc7-empty-1440x900");

    await openRoster(page, { rules: true });
    await page.getByRole("table", { name: "Active fighters" }).waitFor();
    await shot(page, "wc7-active-1440x900");
    await invitations(page).screenshot({
      path: "test-results/sf58-wc7-pending-invitations-1440x900.png",
    });

    await page.getByRole("button", { name: "Invite fighter" }).click();
    await page.getByRole("dialog", { name: "Invite a fighter" }).getByLabel("Email").waitFor();
    await settled(page);
    await shot(page, "composer-1440x900");

    await openRoster(page, { sharing: false });
    await page.getByText("Fighters aren’t available yet").waitFor();
    await shot(page, "wc7-gate-off-1440x900");

    await openRoster(page);
    await page.goto("/en/app/coach/fighters/rel-1");
    await page.getByRole("heading", { level: 1, name: "Alex K." }).waitFor();
    await shot(page, "wc4-detail-1440x900");

    await page.getByRole("button", { name: "End relationship" }).click();
    await page.getByRole("alertdialog").waitFor();
    await settled(page);
    await shot(page, "wc4-end-confirm-1440x900");
  });

  test("390 px layout", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRoster(page);
    await page.getByRole("table", { name: "Active fighters" }).waitFor();
    await page.screenshot({ path: "test-results/sf58-wc7-390x844-full.png", fullPage: true });
    await page.goto("/en/app/coach/fighters/rel-1");
    await page.getByRole("heading", { level: 1, name: "Alex K." }).waitFor();
    await page.screenshot({ path: "test-results/sf58-wc4-390x844-full.png", fullPage: true });
  });
});
