import { expect, test, type Page } from "@playwright/test";

import { axeViolations, box, overflow, VIEWPORTS } from "./harness";
import { onboardingApi } from "./onboarding-api";

/*
 * Fighter web coaches and invitation acceptance on the production build
 * (SF-60), against Claude Design 1792151007-1d70: WFI1 WebFighterInvite
 * (`/invite/coach#token=…`) and WFC1 WebFighterCoaches (`/app/coaches`,
 * FighterWebNav "Coaches"). The SF-56 / SF-57 endpoints are mocked at the
 * network edge; everything else is the real route, gate, shell and screen.
 * The token is a well-formed fixture, never a real one.
 */

const TOKEN = `sfi_${"E2eFixture".repeat(4)}abc`;
const FIGHTER = {
  display_name: "Alex N.",
  username: "alex_n",
  country_code: "PL",
  city: "Warsaw",
  experience_level: "amateur",
  stance: "orthodox",
};
const FIGHTER_DONE = { fields: FIGHTER, completed: true, tour: "completed" as const };
const PREVIEW = {
  invitation: {
    coach: { display_name: "Coach Marek", brand_name: "Marek Boxing" },
    expires_at: "2026-10-30T10:00:00Z",
    message: "Saturday sparring is on — connect so I can plan with you.",
  },
  disclosure: {
    version: "e2e-disclosure-v1",
    fields: ["display_name", "username", "country_code", "city", "experience_level", "stance"],
    never_shared: [
      "goals",
      "next_fight",
      "weight",
      "height",
      "account_name",
      "date_of_birth",
      "email",
    ],
  },
  // The backend's approved text (SF-72): an E2E fixture, never legal copy.
  document: {
    document_id: "fighter-coach-disclosure",
    version: "e2e-disclosure-v1",
    status: "published",
    effective_at: "2026-01-01T00:00:00Z",
    published_at: "2026-01-01T00:00:00Z",
    requested_language: "en",
    language: "en",
    available_languages: ["en"],
    content_sha256: "f".repeat(64),
    title: "E2E fixture disclosure",
    summary: "E2E FIXTURE, not a legal text. {coach} sees the items listed above.",
    checkbox: "E2E FIXTURE: I agree that {coach} sees the information listed above.",
    full: "# E2E fixture disclosure\n\nE2E FIXTURE, not a legal text.",
  } as Record<string, unknown> | null,
};
const coach = (id: string, name: string, brand: string | null) => ({
  relationship_id: id,
  status: "active",
  started_at: "2026-09-01T10:00:00Z",
  ended_at: null,
  ended_by: null,
  disclosure_version: "e2e-disclosure-v1",
  disclosed_fields: ["display_name", "username", "stance"],
  coach: { display_name: name, brand_name: brand },
  coach_display_name_at_end: null,
});

type Options = {
  coaches?: unknown[];
  preview?: number;
  accept?: number;
  document?: Record<string, unknown> | null;
};

/** The SF-56 / SF-57 endpoints; every request is recorded (URL and body). */
async function coachingApi(
  page: Page,
  { coaches = [], preview = 200, accept = 200, document = PREVIEW.document }: Options = {},
) {
  const requests: { url: string; body: string | null }[] = [];
  await page.route(
    (url) =>
      url.port !== "3100" &&
      /^\/api\/v1\/(me\/coaches|coach-invitations|me\/coach-invitations)/.test(url.pathname),
    (route) => {
      const request = route.request();
      requests.push({ url: request.url(), body: request.postData() });
      const path = new URL(request.url()).pathname;
      const json = (status: number, body?: unknown) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: body === undefined ? "" : JSON.stringify(body),
        });
      const err = (status: number, code: string) =>
        json(status, { error: { code, message: "", details: {}, request_id: null } });
      if (path === "/api/v1/me/coaches")
        return json(200, { relationships: coaches, next_cursor: null });
      if (path === "/api/v1/coach-invitations/preview")
        return preview === 200
          ? json(200, { ...PREVIEW, document })
          : err(preview, preview === 404 ? "not_found" : "invitation_unavailable");
      if (path === "/api/v1/me/coach-invitations/accept")
        return accept === 200
          ? json(200, { outcome: "created", relationship_id: "rel-1" })
          : err(accept, "invitation_recipient_mismatch");
      if (path === "/api/v1/me/coach-invitations/decline") return route.fulfill({ status: 204 });
      return err(404, "not_found");
    },
  );
  return requests;
}

const near = (actual: number, expected: number, tolerance = 2) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
const dialogViolations = async (page: Page) => {
  await page
    .locator("[role=dialog], [role=alertdialog]")
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  return (await axeViolations(page)).filter((rule) => !rule.startsWith("region "));
};
const noTokenInRequests = (requests: { url: string }[]) =>
  expect(requests.filter((request) => request.url.includes("sfi_"))).toEqual([]);

async function openInvite(page: Page, signedIn: boolean, options: Options = {}) {
  await onboardingApi(page, signedIn ? FIGHTER_DONE : { signedOut: true });
  const requests = await coachingApi(page, options);
  await page.goto(`/en/invite/coach#token=${TOKEN}`);
  return requests;
}

test.describe("WFI1 coach invitation", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("signed out: anonymous preview, fragment removed, sign-in continues without the token", async ({
    page,
  }) => {
    const requests = await openInvite(page, false);
    await page
      .getByRole("heading", { level: 1, name: "Coach Marek invited you to connect on SimpleFit." })
      .waitFor();
    await page.evaluate(() => document.fonts.ready);
    expect(new URL(page.url()).hash).toBe("");
    const signIn = page.getByRole("link", { name: "Sign in to respond" });
    const href = (await signIn.getAttribute("href")) ?? "";
    expect(href).toContain("returnTo=%2Finvite%2Fcoach");
    expect(href).not.toContain("sfi_");
    expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
    noTokenInRequests(requests);
    expect(requests.find((request) => request.url.endsWith("/preview"))?.body).toContain(TOKEN);
    expect(await page.content()).not.toContain(TOKEN);

    // The 560 px column centred under the 72 px header (WCX1's frame).
    const column = await box(page.locator("[data-minimal-frame] main > div").first());
    near(column.width, 560);
    near(column.x, (1440 - 560) / 2);
    expect(await overflow(page)).toBe(0);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({
      path: "test-results/sf60-wfi1-preview-signed-out-1440x900.png",
      fullPage: true,
    });
  });

  test("signed in: explicit consent, one accept, focus on the confirmation", async ({ page }) => {
    const requests = await openInvite(page, true);
    const accept = page.getByRole("button", { name: "Accept invitation" });
    await accept.waitFor();
    await expect(accept).toBeDisabled();
    await expect(page.getByRole("checkbox")).not.toBeChecked();
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/sf60-wfi1-review-1440x900.png", fullPage: true });

    await page.getByRole("checkbox").click();
    await accept.click();
    const heading = page.getByRole("heading", {
      level: 1,
      name: "You’re connected with Coach Marek.",
    });
    await expect(heading).toBeFocused();
    const accepted = requests.filter((request) => request.url.endsWith("/accept"));
    expect(accepted).toHaveLength(1);
    expect(JSON.parse(accepted[0]?.body ?? "{}")).toEqual({
      token: TOKEN,
      disclosure_version: "e2e-disclosure-v1",
      document_language: "en",
    });
    expect(
      await page.evaluate(() => window.sessionStorage.getItem("simplefit.coach-invitation")),
    ).toBeNull();
    noTokenInRequests(requests);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/sf60-wfi1-accepted-1440x900.png" });
  });

  test("the approved disclosure text, consent by keyboard (SF-72)", async ({ page }) => {
    const requests = await openInvite(page, true);
    await expect(
      page.getByText("E2E FIXTURE, not a legal text. Coach Marek sees the items listed above."),
    ).toBeVisible();
    const consent = page.getByRole("checkbox", {
      name: /E2E FIXTURE: I agree that Coach Marek sees the information listed above\./,
    });
    await consent.focus();
    await page.keyboard.press("Space");
    await expect(consent).toBeChecked();
    await page.getByRole("button", { name: "Accept invitation" }).press("Enter");
    await expect(
      page.getByRole("heading", { level: 1, name: "You’re connected with Coach Marek." }),
    ).toBeFocused();
    expect(requests.find((request) => request.url.endsWith("/preview"))?.body).toContain(
      '"language":"en"',
    );
  });

  test("no approved text in the page language: nothing to accept, declining works", async ({
    page,
  }) => {
    const requests = await openInvite(page, true, {
      document: {
        ...PREVIEW.document,
        language: null,
        title: null,
        summary: null,
        checkbox: null,
        full: null,
        content_sha256: null,
        available_languages: ["pl"],
      },
    });
    await expect(
      page.getByText("This disclosure isn’t available in your language yet."),
    ).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Accept invitation" })).toBeDisabled();
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/sf72-wfi1-language-1440x900.png" });
    await page.getByRole("button", { name: "Decline" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Invitation declined" }),
    ).toBeVisible();
    expect(requests.some((request) => request.url.endsWith("/accept"))).toBe(false);
  });

  test("a different recipient: privacy-safe message, nothing accepted", async ({ page }) => {
    await openInvite(page, true, { accept: 403 });
    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(
      page.getByText("This invitation was sent to a different email address."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out and switch account" })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });

  test("sharing off or a token that is not current: one not-available state", async ({ page }) => {
    for (const preview of [404, 410]) {
      await openInvite(page, false, { preview });
      await expect(
        page.getByRole("heading", { level: 1, name: "This invitation isn’t available" }),
      ).toBeVisible();
    }
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/sf60-wfi1-unavailable-1440x900.png" });
  });

  test("a refresh keeps the invitation in this tab without the fragment", async ({ page }) => {
    await openInvite(page, false);
    await page.getByRole("link", { name: "Sign in to respond" }).waitFor();
    await page.reload();
    await expect(page.getByRole("link", { name: "Sign in to respond" })).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
  });
});

test.describe("WFC1 my coaches", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  async function openCoaches(page: Page, coaches: unknown[]) {
    await onboardingApi(page, FIGHTER_DONE);
    await coachingApi(page, { coaches });
    await page.goto("/en/app/home");
    await page.getByRole("complementary").getByRole("link", { name: "Coaches" }).click();
    await page.waitForURL("**/en/app/coaches");
    await page.getByRole("heading", { level: 1, name: "Coaches" }).waitFor();
    await page.evaluate(() => document.fonts.ready);
  }

  test("the sidebar links Coaches; the list and the 360 px aside sit top-aligned", async ({
    page,
  }) => {
    await openCoaches(page, [
      coach("rel-1", "Coach Marek", "Marek Boxing"),
      coach("rel-2", "Alex Novak", null),
    ]);
    await page.getByText("Alex Novak").waitFor();
    await expect(
      page.getByRole("complementary").getByRole("link", { name: "Coaches" }),
    ).toHaveAttribute("aria-current", "page");
    const list = await box(page.getByRole("region", { name: "Your coaches" }));
    const aside = await box(page.getByRole("region", { name: "Never shared with coaches" }));
    near(list.x, 272);
    near(list.y, aside.y);
    near(aside.width, 360);
    expect(await overflow(page)).toBe(0);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/sf60-wfc1-active-1440x900.png" });

    await page.getByRole("button", { name: "What they see" }).first().click();
    await page.getByRole("button", { name: "End relationship" }).click();
    await expect(
      page.getByRole("alertdialog", { name: "End your relationship with Coach Marek?" }),
    ).toBeVisible();
    expect(await dialogViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/sf60-wfc1-end-confirm-1440x900.png" });
  });

  test("empty list", async ({ page }) => {
    await openCoaches(page, []);
    await expect(page.getByText("No coaches yet")).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/sf60-wfc1-empty-1440x900.png" });
  });

  for (const [width, height] of VIEWPORTS) {
    test(`${width} × ${height}: two top-aligned columns, nothing clipped`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openCoaches(page, [coach("rel-1", "Coach Marek", "Marek Boxing")]);
      await page.getByText("Coach Marek").waitFor();
      const list = await box(page.getByRole("region", { name: "Your coaches" }));
      const aside = await box(page.getByRole("region", { name: "Never shared with coaches" }));
      near(list.y, aside.y);
      near(aside.width, 360);
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
    test(`${width} px: invitation and coaches fit, axe clean`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openInvite(page, true);
      await page.getByRole("button", { name: "Accept invitation" }).waitFor();
      expect(await overflow(page)).toBe(0);
      expect(await axeViolations(page)).toEqual([]);
      if (width === 390)
        await page.screenshot({
          path: "test-results/sf60-wfi1-review-390x844-full.png",
          fullPage: true,
        });

      await page.goto("/en/app/coaches");
      await page.getByRole("heading", { level: 1, name: "Coaches" }).waitFor();
      expect(await overflow(page)).toBe(0);
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});
