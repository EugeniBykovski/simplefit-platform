import { expect, test, type Page } from "@playwright/test";

import { axeViolations, box, overflow, VIEWPORTS } from "./harness";
import { onboardingApi } from "./onboarding-api";

/*
 * Coach sessions on the production build (SF-64), against Claude Design
 * 1792490047-d551: WCT1 planner, WC3 new session, WCT2 one session with its
 * cancel confirmation, WCT3 edit, and CoachWebNav with Sessions linked. The
 * SF-56 roster and SF-62 / SF-63 session endpoints are mocked at the
 * network edge as a small stateful backend; everything else is the real
 * route, gate, shell and screen. The browser plans from Warsaw.
 */

test.use({ timezoneId: "Europe/Warsaw" });

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

const RELATIONSHIP = {
  relationship_id: "rel-1",
  status: "active",
  started_at: "2026-09-01T10:00:00Z",
  ended_at: null,
  ended_by: null,
  disclosure_version: "e2e-disclosure",
  disclosed_fields: ["display_name", "username"],
  fighter: {
    display_name: "Alex K.",
    username: "alex_k",
    country_code: null,
    city: null,
    experience_level: null,
    stance: null,
    amateur_bout_count: null,
  },
  fighter_display_name_at_end: null,
};

type Session = Record<string, unknown> & { id: string; status: string; starts_at: string };

const session = (overrides: Record<string, unknown> = {}): Session => ({
  id: "ses-1",
  relationship_id: "rel-1",
  fighter: { display_name: "Alex K.", username: "alex_k" },
  title: "Technical boxing",
  training_type: "technical",
  starts_at: "2026-10-21T16:00:00Z",
  time_zone: "Europe/Warsaw",
  duration_minutes: 60,
  notes: "Jab work and footwork.",
  status: "planned",
  completed_at: null,
  cancelled_at: null,
  cancelled_by: null,
  cancel_reason: null,
  inserted_at: "2026-10-20T10:00:00Z",
  updated_at: "2026-10-20T10:00:00Z",
  ...overrides,
});

type Options = { sharing?: boolean; fighters?: boolean };
type Recorded = { method: string; path: string; body: unknown };

/**
 * The SF-56 roster and the SF-62 / SF-63 coach session endpoints. Upcoming
 * holds the planned sessions, History the others; every request is recorded.
 */
async function sessionsApi(page: Page, { sharing = true, fighters = true }: Options = {}) {
  const requests: Recorded[] = [];
  const sessions: Session[] = [
    session(),
    session({
      id: "ses-2",
      title: "Pads with coach",
      training_type: "pads",
      starts_at: "2026-10-23T15:30:00Z",
      duration_minutes: 45,
    }),
    session({
      id: "ses-3",
      title: "Roadwork intervals",
      training_type: "roadwork",
      starts_at: "2026-10-18T08:00:00Z",
      status: "completed",
      completed_at: "2026-10-18T09:05:00Z",
    }),
  ];
  await page.route(
    (url) =>
      url.port !== "3100" &&
      /^\/api\/v1\/me\/coach\/(fighters|training-sessions)/.test(url.pathname),
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const body = request.postData() ? JSON.parse(request.postData()!) : undefined;
      requests.push({ method: request.method(), path: `${url.pathname}${url.search}`, body });
      const json = (status: number, payload: unknown) =>
        route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
      const notFound = () =>
        json(404, { error: { code: "not_found", message: "", details: {}, request_id: null } });
      if (!sharing) return notFound();

      const path = url.pathname.replace("/api/v1/me/coach/", "");
      if (path === "fighters")
        return json(200, { relationships: fighters ? [RELATIONSHIP] : [], next_cursor: null });
      if (path === "training-sessions" && request.method() === "GET") {
        const view = url.searchParams.get("view");
        const status = url.searchParams.get("status");
        const list = sessions
          .filter((s) => (view === "upcoming" ? s.status === "planned" : s.status !== "planned"))
          .filter((s) => status === null || s.status === status)
          .sort((a, b) =>
            view === "upcoming"
              ? a.starts_at.localeCompare(b.starts_at)
              : b.starts_at.localeCompare(a.starts_at),
          );
        return json(200, { training_sessions: list, next_cursor: null });
      }
      if (path === "training-sessions" && request.method() === "POST") {
        const { client_request_id: _key, notes, ...plan } = body as Record<string, unknown>;
        const created = session({
          ...plan,
          id: "ses-new",
          notes: notes ?? null,
          starts_at: new Date(String(plan.starts_at)).toISOString(),
          fighter: RELATIONSHIP.fighter && { display_name: "Alex K.", username: "alex_k" },
        });
        sessions.push(created);
        return json(201, { training_session: created });
      }
      const match = /^training-sessions\/([^/]+)(\/cancel)?$/.exec(path);
      const found = sessions.find((s) => s.id === match?.[1]);
      if (!match || !found) return notFound();
      if (match[2] && request.method() === "POST") {
        if (found.status !== "planned")
          return json(409, {
            error: {
              code: "conflict",
              message: "",
              details: { status: found.status },
              request_id: null,
            },
          });
        Object.assign(found, {
          status: "cancelled",
          cancelled_at: "2026-10-20T09:30:00Z",
          cancelled_by: "coach",
        });
        return json(200, { training_session: found });
      }
      if (request.method() === "PATCH") {
        Object.assign(found, body, { updated_at: new Date().toISOString() });
        if (typeof (body as { starts_at?: string }).starts_at === "string")
          found.starts_at = new Date((body as { starts_at: string }).starts_at).toISOString();
        return json(200, { training_session: found });
      }
      return json(200, { training_session: found });
    },
  );
  return requests;
}

async function open(page: Page, path: string, options: Options = {}) {
  await onboardingApi(page, { ...BOTH, lastContext: "coach", tour: "completed" });
  const requests = await sessionsApi(page, options);
  await page.goto(`/en${path}`);
  await page.evaluate(() => document.fonts.ready);
  return requests;
}

async function dialogViolations(page: Page) {
  const dialog = page.locator("[role=dialog], [role=alertdialog]");
  await dialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  return (await axeViolations(page)).filter((rule) => !rule.startsWith("region "));
}

const near = (actual: number, expected: number, tolerance = 2) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

const writes = (requests: Recorded[]) => requests.filter((request) => request.method !== "GET");

test.describe("WCT1 at the artboard size (1440 × 900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the Coach nav opens Sessions: the agenda and its 320 px aside sit top-aligned", async ({
    page,
  }) => {
    const requests = await open(page, "/app/coach");
    await page.getByRole("heading", { level: 1, name: "Welcome, Alex Novak" }).waitFor();
    await page.getByRole("complementary").getByRole("link", { name: "Sessions" }).click();
    await page.waitForURL("**/en/app/coach/sessions");
    await page.getByRole("link", { name: "Technical boxing" }).waitFor();
    await expect(
      page.getByRole("complementary").getByRole("link", { name: "Sessions" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveTitle(/Sessions/);

    const list = await box(page.getByRole("region", { name: "Upcoming" }));
    const aside = await box(page.locator("[data-sessions-aside]"));
    near(list.x, 272);
    near(list.y, aside.y);
    near(aside.width, 320);
    near(aside.x + aside.width, 1408);
    near(aside.x - (list.x + list.width), 20);
    // Rows show the start in the session's zone, grouped by its day.
    const row = page.locator("[data-session-row=ses-1]");
    await expect(row).toContainText("06:00 PM");
    await expect(row).toContainText("Europe/Warsaw");
    await expect(page.getByRole("heading", { level: 3, name: "Wed, Oct 21, 2026" })).toBeVisible();
    expect(await overflow(page)).toBe(0);
    expect(await axeViolations(page)).toEqual([]);
    expect(
      requests.some((r) => r.path === "/api/v1/me/coach/training-sessions?view=upcoming&limit=50"),
    ).toBe(true);
    expect(writes(requests)).toEqual([]);
  });

  test("History is the query view, narrowed by status, and past-due stays planned", async ({
    page,
  }) => {
    const requests = await open(page, "/app/coach/sessions");
    await page.getByRole("link", { name: "History" }).click();
    await page.waitForURL("**/en/app/coach/sessions?view=history");
    await expect(page.getByRole("link", { name: "Roadwork intervals" })).toBeVisible();
    await page.getByRole("link", { name: "Cancelled" }).click();
    await page.waitForURL("**/en/app/coach/sessions?view=history&status=cancelled");
    await expect(page.getByText("No cancelled sessions")).toBeVisible();
    expect(requests.map((r) => r.path)).toContain(
      "/api/v1/me/coach/training-sessions?view=history&status=cancelled&limit=50",
    );
    expect(await axeViolations(page)).toEqual([]);
  });

  test("planning not available: never an empty list, and New session disabled", async ({
    page,
  }) => {
    const requests = await open(page, "/app/coach/sessions", { sharing: false });
    await expect(page.getByText("Sessions aren’t available yet")).toBeVisible();
    await expect(page.getByText("No upcoming sessions")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New session" })).toBeDisabled();
    expect(writes(requests)).toEqual([]);
    expect(await axeViolations(page)).toEqual([]);
  });
});

test.describe("WC3 new session", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("refuses a skipped time, asks which repeated time, then creates and opens the session", async ({
    page,
  }) => {
    const requests = await open(page, "/app/coach/sessions");
    await page.getByRole("link", { name: "New session" }).click();
    await page.waitForURL("**/en/app/coach/sessions/new");
    // The route's metadata title follows the client navigation.
    await expect(page).toHaveTitle(/New session/);
    const form = page.getByRole("form", { name: "New session" });
    await expect(form.getByRole("combobox", { name: "Fighter" })).toHaveText(/Alex K\. · @alex_k/);
    await expect(form.getByRole("combobox", { name: "Time zone" })).toHaveText(/Europe\/Warsaw/);
    expect(await overflow(page)).toBe(0);
    expect(await axeViolations(page)).toEqual([]);

    await form.getByLabel("Title").fill("Technical boxing");
    await form.getByText("Pads", { exact: true }).click();
    await form.getByLabel("Date").fill("2027-03-28");
    await form.getByLabel("Start time").fill("02:30");
    await expect(form.getByRole("alert")).toContainText("This time doesn’t exist on that day.");
    await form.getByRole("button", { name: "Assign session" }).click();
    expect(writes(requests)).toEqual([]);

    await form.getByLabel("Date").fill("2026-10-25");
    const overlap = form.getByRole("group", { name: "This time happens twice on that day." });
    await expect(overlap).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await overlap.getByText("Second · UTC+01:00").click();
    await form.getByLabel("Duration").fill("45");
    await form.getByRole("button", { name: "Assign session" }).click();

    await page.waitForURL("**/en/app/coach/sessions/ses-new");
    await expect(page.getByRole("heading", { level: 1, name: "Technical boxing" })).toBeVisible();
    await expect(
      page.getByText("Sun, Oct 25, 2026, 02:30 AM · Europe/Warsaw (UTC+01:00)"),
    ).toBeVisible();
    const post = writes(requests);
    expect(post).toHaveLength(1);
    expect(post[0]?.body).toMatchObject({
      relationship_id: "rel-1",
      title: "Technical boxing",
      training_type: "pads",
      starts_at: "2026-10-25T02:30:00+01:00",
      time_zone: "Europe/Warsaw",
      duration_minutes: 45,
    });
    expect((post[0]?.body as { client_request_id: string }).client_request_id).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  test("with no active fighter it offers Fighters instead of a form", async ({ page }) => {
    await open(page, "/app/coach/sessions/new", { fighters: false });
    await expect(page.getByText("No fighters to plan for yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to Fighters" })).toHaveAttribute(
      "href",
      "/en/app/coach/fighters",
    );
    expect(await axeViolations(page)).toEqual([]);
  });
});

test.describe("WCT2 and WCT3", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("a planned session edits only what changed, and cancels after confirmation", async ({
    page,
  }) => {
    const requests = await open(page, "/app/coach/sessions/ses-1");
    await page.getByRole("heading", { level: 1, name: "Technical boxing" }).waitFor();
    await expect(page.getByText("Wed, Oct 21, 2026, 06:00 PM · same time zone")).toHaveCount(0);
    await expect(page.getByText("06:00 PM · same time zone")).toBeVisible();
    expect(await overflow(page)).toBe(0);
    expect(await axeViolations(page)).toEqual([]);

    await page.getByRole("link", { name: "Edit" }).click();
    await page.waitForURL("**/en/app/coach/sessions/ses-1/edit");
    const form = page.getByRole("form", { name: "Edit session" });
    await expect(form.getByLabel("Start time")).toHaveValue("18:00");
    await form.getByLabel("Duration").fill("75");
    await form.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL("**/en/app/coach/sessions/ses-1");
    await expect(page.getByText("75 minutes")).toBeVisible();
    expect(writes(requests)).toEqual([
      expect.objectContaining({
        method: "PATCH",
        path: "/api/v1/me/coach/training-sessions/ses-1",
        body: { duration_minutes: 75 },
      }),
    ]);

    await page.getByRole("button", { name: "Cancel session" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Cancel this session?" });
    await expect(dialog).toContainText("Alex K. sees it as cancelled.");
    expect(await dialogViolations(page)).toEqual([]);
    await dialog.getByRole("button", { name: "Keep session" }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes(requests)).toHaveLength(1);

    await page.getByRole("button", { name: "Cancel session" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel session" }).click();
    await expect(page.locator("[data-status=cancelled]")).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    expect(writes(requests).at(-1)?.path).toBe("/api/v1/me/coach/training-sessions/ses-1/cancel");
  });

  test("a completed session has no actions; an unknown one is not available", async ({ page }) => {
    await open(page, "/app/coach/sessions/ses-3");
    await expect(page.locator("[data-status=completed]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel session" })).toHaveCount(0);
    await page.goto("/en/app/coach/sessions/someone-elses");
    await expect(page.getByText("This session isn’t available")).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });
});

test.describe("across the laptop and desktop matrix", () => {
  for (const [width, height] of VIEWPORTS) {
    test(`${width} × ${height}: two top-aligned columns, nothing clipped`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page, "/app/coach/sessions");
      await page.getByRole("link", { name: "Technical boxing" }).waitFor();
      const list = await box(page.getByRole("region", { name: "Upcoming" }));
      const aside = await box(page.locator("[data-sessions-aside]"));
      near(list.y, aside.y);
      near(aside.width, 320);
      expect(list.width).toBeGreaterThan(aside.width);
      expect(await overflow(page)).toBe(0);
    });
  }
});

test.describe("narrow windows", () => {
  for (const [width, height] of [
    [1024, 768],
    [768, 1024],
    [390, 844],
  ] as const) {
    test(`${width} px: planner, form and session fit, axe clean`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page, "/app/coach/sessions");
      await page.getByRole("link", { name: "Technical boxing" }).waitFor();
      expect(await overflow(page)).toBe(0);
      expect(await axeViolations(page)).toEqual([]);

      await page.goto("/en/app/coach/sessions/new");
      await page.getByRole("form", { name: "New session" }).waitFor();
      expect(await overflow(page)).toBe(0);
      expect(await axeViolations(page)).toEqual([]);

      await page.goto("/en/app/coach/sessions/ses-1");
      await page.getByRole("heading", { level: 1, name: "Technical boxing" }).waitFor();
      expect(await overflow(page)).toBe(0);
      expect(await axeViolations(page)).toEqual([]);
      await page.screenshot({ path: `test-results/sf64-wct2-${width}.png`, fullPage: true });
    });
  }
});
