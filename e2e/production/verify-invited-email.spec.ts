import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

import { axeViolations, box, overflow, VIEWPORTS } from "./harness";
import { onboardingApi } from "./onboarding-api";

/*
 * SF-78 on the production build: verifying the invited email from WFI1
 * (`/invite/coach`), against Claude Design 1792666334-7310 (WFI1 `link-*`
 * states). The SF-57 and SF-77 endpoints are mocked at the network edge;
 * route, gate, page and flow are real. Token, address and code are fixtures.
 */

const TOKEN = `sfi_${"E2eFixture".repeat(4)}abc`;
const EMAIL = "fighter@example.com";
const CODE = "730419";
const FIGHTER_DONE = {
  fields: {
    display_name: "Alex N.",
    username: "alex_n",
    country_code: "PL",
    city: "Warsaw",
    experience_level: "amateur",
    stance: "orthodox",
  },
  completed: true,
  tour: "completed" as const,
};
const PREVIEW = {
  invitation: {
    coach: { display_name: "Coach Marek", brand_name: "Marek Boxing" },
    expires_at: "2026-10-30T10:00:00Z",
    message: "Saturday sparring is on — connect so I can plan with you.",
  },
  disclosure: {
    version: "e2e-disclosure-v1",
    fields: ["display_name", "username", "country_code", "city", "experience_level", "stance"],
    never_shared: ["goals", "weight", "account_name", "date_of_birth", "email"],
  },
  document: {
    document_id: "fighter-coach-disclosure",
    version: "e2e-disclosure-v1",
    status: "published",
    effective_at: "2026-01-01T00:00:00Z",
    published_at: "2026-01-01T00:00:00Z",
    requested_language: "en",
    language: "en",
    available_languages: ["en"],
    content_sha256: "a".repeat(64),
    title: "E2E fixture disclosure",
    summary: "E2E FIXTURE, not a legal text.",
    checkbox: "E2E FIXTURE: I agree that {coach} sees the information listed above.",
    full: null,
  },
};

type Confirm = "linked" | "conflict" | "unauthorized" | "code_invalid";
type Request = { url: string; method: string; body: string | null };

/** SF-57 and SF-77 at the edge; the recipient matches once the address is linked. */
async function api(page: Page, confirm: Confirm[] = ["linked"]) {
  const requests: Request[] = [];
  let linked = false;
  const answers = [...confirm];
  await page.route(
    (url) =>
      url.port !== "3100" &&
      /^\/api\/v1\/(coach-invitations|me\/coach-invitations|me\/email-identities|me\/coaches)/.test(
        url.pathname,
      ),
    (route) => {
      const request = route.request();
      requests.push({ url: request.url(), method: request.method(), body: request.postData() });
      const path = new URL(request.url()).pathname;
      const json = (status: number, body: unknown) =>
        route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      const err = (status: number, code: string) =>
        json(status, { error: { code, message: "", details: {}, request_id: null } });
      switch (path) {
        case "/api/v1/coach-invitations/preview":
          return json(200, PREVIEW);
        case "/api/v1/me/coach-invitations/accept":
          return linked
            ? json(200, { outcome: "created", relationship_id: "rel-1" })
            : err(403, "invitation_recipient_mismatch");
        case "/api/v1/me/email-identities/link-challenge":
          return json(202, { expires_in_seconds: 600, resend_after_seconds: 60 });
        case "/api/v1/me/email-identities/confirm-link": {
          const answer = answers.length > 1 ? answers.shift() : answers[0];
          if (answer === "linked") {
            linked = true;
            return json(200, {
              outcome: "linked",
              email_identity: { email: EMAIL, linked_at: "2026-10-22T10:00:00Z" },
            });
          }
          if (answer === "conflict") return err(409, "conflict");
          if (answer === "unauthorized") return err(401, "unauthorized");
          return err(422, "code_invalid");
        }
        case "/api/v1/me/email-identities":
          return json(200, { email_identities: linked ? [{ email: EMAIL, linked_at: "x" }] : [] });
        case "/api/v1/me/coaches":
          return json(200, { relationships: [], next_cursor: null });
        default:
          return err(404, "not_found");
      }
    },
  );
  return requests;
}

async function openMismatch(page: Page, confirm?: Confirm[]) {
  await onboardingApi(page, FIGHTER_DONE);
  const requests = await api(page, confirm);
  const console: string[] = [];
  page.on("console", (message) => console.push(message.text()));
  await page.goto(`/en/invite/coach#token=${TOKEN}`);
  await page.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await page.getByRole("button", { name: "Verify the invited email" }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { requests, console };
}

async function toCode(page: Page) {
  await page.getByRole("button", { name: "Verify the invited email" }).click();
  const email = page.getByRole("textbox", { name: "Email address" });
  await email.fill(EMAIL);
  await expect(email).toHaveValue(EMAIL);
  // Submitted from the field (implicit submission, as Enter does for a user).
  // Under CI load Firefox occasionally loses a pointer click that Playwright
  // reports as done: the form is never submitted and no request leaves (seen
  // in a trace). The button itself stays covered by the tests that click it.
  await email.press("Enter");
  const code = page.getByRole("textbox", { name: "6-digit code" });
  await code.waitFor();
  return code;
}

/** Q: neither the code nor the token anywhere they could leak. */
async function expectNoLeaks(page: Page, requests: Request[], console: string[]) {
  expect(page.url()).not.toContain(CODE);
  expect(page.url()).not.toContain("sfi_");
  const storage = await page.evaluate(() =>
    JSON.stringify({ local: { ...window.localStorage }, session: { ...window.sessionStorage } }),
  );
  expect(storage).not.toContain(CODE);
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
  expect(await page.evaluate(() => document.cookie)).not.toContain(CODE);
  expect(console.join("\n")).not.toContain(CODE);
  expect(
    requests.filter((request) => request.url.includes(CODE) || request.url.includes("sfi_")),
  ).toEqual([]);
  // The token never goes to the linking API; the code never to SF-57.
  for (const request of requests) {
    if (request.url.includes("email-identities")) expect(request.body ?? "").not.toContain(TOKEN);
    if (request.url.includes("coach-invitations")) expect(request.body ?? "").not.toContain(CODE);
  }
}

const require = createRequire(import.meta.url);

/** axe (WCAG 2.1 AA) on the linking flow only: `rule (nodes)`. */
async function flowViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  return page.evaluate(async () => {
    const { violations } = await (
      window as unknown as {
        axe: {
          run: (
            context: object,
            options: object,
          ) => Promise<{ violations: { id: string; nodes: unknown[] }[] }>;
        };
      }
    ).axe.run(
      { include: [["[data-slot=email-identity-link]"]] },
      { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } },
    );
    return violations.map((violation) => `${violation.id} (${violation.nodes.length})`);
  });
}

const near = (actual: number, expected: number, tolerance = 2) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

test.describe("SF-78 verify the invited email (WFI1)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("M/N/O/P: mismatch → verify in place → back to an unticked review → explicit accept", async ({
    page,
  }) => {
    const { requests, console } = await openMismatch(page);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/sf78-wfi1-mismatch-1440x900.png", fullPage: true });
    // Nothing starts before the fighter asks.
    expect(requests.some((request) => request.url.includes("email-identities"))).toBe(false);

    await page.getByRole("button", { name: "Verify the invited email" }).click();
    const email = page.getByRole("textbox", { name: "Email address" });
    await expect(email).toBeFocused();
    await expect(page.getByText("Never shared")).toHaveCount(0);
    // The 560 px WFI1 column…
    const column = await box(page.locator("[data-minimal-frame] main > div").first());
    near(column.width, 560);
    // …and the flow fills its content box (the column keeps SF-60's 20 px sides).
    const card = await box(page.locator("[data-slot=email-identity-link]"));
    near(card.width, column.width - 40);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/sf78-link-email-1440x900.png", fullPage: true });

    await email.fill(EMAIL);
    await page.getByRole("button", { name: "Send code" }).click();
    const code = page.getByRole("textbox", { name: "6-digit code" });
    await expect(code).toBeFocused();
    await expect(page.getByText(/It expires in 10 minutes\./)).toBeVisible();
    // The designed 446 px code row (six 66 px cells, 10 px apart).
    near((await box(code)).width, 446);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/sf78-link-code-1440x900.png", fullPage: true });

    await page.keyboard.type(CODE);
    const heading = page.getByRole("heading", { name: "Email verified" });
    await expect(heading).toBeFocused();
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/sf78-link-linked-1440x900.png", fullPage: true });
    // O: linking accepted nothing.
    expect(requests.filter((request) => request.url.endsWith("/accept"))).toHaveLength(1);

    await page.getByRole("button", { name: "Back to the invitation" }).click();
    await expect(page.getByRole("checkbox")).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Accept invitation" })).toBeDisabled();
    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "You’re connected with Coach Marek." }),
    ).toBeFocused();
    expect(requests.filter((request) => request.url.endsWith("/accept"))).toHaveLength(2);
    expect(
      requests
        .filter((request) => request.url.endsWith("/confirm-link"))
        .map((r) => JSON.parse(r.body ?? "{}")),
    ).toEqual([{ email: EMAIL, code: CODE }]);
    await expectNoLeaks(page, requests, console);
  });

  test("D/E/I: wrong code, another account's address and an ended session, each axe clean", async ({
    page,
  }) => {
    const { requests, console } = await openMismatch(page, ["code_invalid", "conflict"]);
    const code = await toCode(page);
    await code.fill("111111");
    await expect(
      page.getByText("That code isn’t right. Check the digits and try again.").first(),
    ).toBeVisible();
    await expect(code).toHaveAttribute("aria-invalid", "true");
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/sf78-link-invalid-1440x900.png" });

    await code.fill("");
    await code.fill(CODE);
    await expect(page.getByText(/Accounts are never merged\./).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out and switch account" })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/sf78-link-conflict-1440x900.png" });
    await expectNoLeaks(page, requests, console);
  });

  test("I: a session that ends during the flow drops the invitation (SF-60 contract)", async ({
    page,
  }) => {
    const { requests, console } = await openMismatch(page, ["unauthorized"]);
    const code = await toCode(page);
    await code.fill(CODE);
    // The refused confirmation refreshes once, is refused again and ends the
    // session: the token was bound to it, so it is gone and nothing links.
    await expect(page.getByRole("heading", { name: "No invitation to show" })).toBeVisible();
    expect(
      await page.evaluate(() => window.sessionStorage.getItem("simplefit.coach-invitation")),
    ).toBeNull();
    await expectNoLeaks(page, requests, console);
  });

  test("keyboard only: tab to the action, type the address and the code", async ({
    page,
    browserName,
  }) => {
    // Safari's default moves Tab through fields only; Option+Tab reaches buttons and links.
    const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
    await openMismatch(page);
    await page.getByRole("button", { name: "Verify the invited email" }).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type(EMAIL);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "6-digit code" })).toBeFocused();
    await page.keyboard.type(CODE);
    await expect(page.getByRole("heading", { name: "Email verified" })).toBeFocused();
    await page.keyboard.press(tab);
    await expect(page.getByRole("button", { name: "Back to the invitation" })).toBeFocused();
  });

  test("light theme: the flow is axe clean at every step", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openMismatch(page);
    await page.evaluate(() => document.documentElement.classList.replace("dark", "light"));
    await page.getByRole("button", { name: "Verify the invited email" }).click();
    expect(await flowViolations(page)).toEqual([]);
    await page.getByRole("textbox", { name: "Email address" }).fill(EMAIL);
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByRole("textbox", { name: "6-digit code" }).fill(CODE);
    await page.getByRole("heading", { name: "Email verified" }).waitFor();
    expect(await flowViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/sf78-link-code-light-1440x900.png" });
  });
});

test.describe("SF-78 responsive", () => {
  for (const [width, height] of [...VIEWPORTS, [1024, 768], [768, 1024], [390, 844]] as const) {
    test(`${width} × ${height}: the code step fits, axe clean`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openMismatch(page);
      await toCode(page);
      expect(await overflow(page)).toBe(0);
      expect(await axeViolations(page)).toEqual([]);
      const code = await box(page.getByRole("textbox", { name: "6-digit code" }));
      expect(code.x).toBeGreaterThanOrEqual(0);
      expect(code.x + code.width).toBeLessThanOrEqual(width);
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: `test-results/sf78-link-code-${width}x${height}.png`,
          fullPage: true,
        });
    });
  }
});
