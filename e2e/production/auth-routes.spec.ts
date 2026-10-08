import { expect, test, type Page } from "@playwright/test";

import {
  apiError,
  apiOk,
  axeViolations,
  box,
  expectAbove,
  expectBox,
  expectInView,
  open,
  overflow,
  seedPending,
  verticalOverflow,
  VIEWPORTS,
} from "./harness";

/*
 * The web authentication routes not covered by web-responsive.spec.ts, on the
 * production build (SF-36, Claude Design V78 `1791448557-b0b9`, section 5b):
 * WA3 /signup/account, WA4 /signup/verify, WA1b /login/code and WA4b
 * /verify-email. Every desktop and laptop window renders the artboard's
 * composition, fluid in width, with nothing clipped or scrolled; at 1440 × 900
 * the major anchors land on the artboard's coordinates. The states come from
 * the page reacting to the API's error codes (mocked at the network edge),
 * never from a story.
 *
 * The code routes open the way a visitor reaches them: the email step leaves
 * the pending challenge in this tab's sessionStorage (`seedPending`).
 */

const typeCode = (page: Page, code: string) =>
  page.locator('[data-slot="code-input"]').pressSequentially(code);

/** The status message of a code step (its visible box; a hidden live region carries the text). */
const notice = (page: Page, text: string | RegExp) =>
  page.locator('[data-slot="notice"]').filter({ hasText: text });

for (const [width, height] of VIEWPORTS) {
  test.describe(`${width} × ${height}`, () => {
    test.use({ viewport: { width, height } });

    test("WA3 /signup/account: 72 px header, step column and 420 px aside, disabled name and consents", async ({
      page,
    }) => {
      await open(page, "/en/signup/account", page.getByRole("heading", { level: 1 }));
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(await verticalOverflow(page)).toBeLessThanOrEqual(0);
      await expectBox(page.locator("header").first(), { x: 0, y: 0, w: width, h: 72 });
      await expectBox(page.locator("header a").first(), { x: 56, h: 30 });
      // The step fills what the fixed aside leaves: 64 px gutters, 56 px gap.
      await expectBox(page.locator("[data-auth-step-column]"), {
        x: 64,
        y: 120,
        w: width - 128 - 56 - 420,
      });
      await expectBox(page.locator("aside"), { x: width - 64 - 420, y: 120, w: 420 });
      await expectBox(page.getByRole("heading", { level: 1 }), { x: 64, y: 150 });
      await expectBox(page.getByRole("radiogroup", { name: "Signing up as" }), {
        x: 64,
        y: 230,
        h: 46,
      });
      await expectBox(page.getByRole("textbox", { name: "Email" }), { y: 342, h: 44 });
      // D-WA3-PREAUTH-CONSENT: the artboard's three checkboxes on their rows, disabled
      // and unchecked; the full name is disabled; only the email is interactive.
      const checkboxes = page.getByRole("checkbox");
      await expect(checkboxes).toHaveCount(3);
      for (const [index, y] of [438, 470, 502].entries()) {
        const checkbox = checkboxes.nth(index);
        await expectBox(checkbox, { x: 64, y, w: 22, h: 22 });
        await expect(checkbox).toBeDisabled();
        await expect(checkbox).not.toBeChecked();
      }
      await expect(page.getByRole("textbox", { name: "Full name" })).toBeDisabled();
      await expect(page.getByRole("textbox", { name: "Email" })).toBeEditable();
      const create = page.getByRole("button", { name: "Create account" });
      await expectBox(create, { x: 64, y: 540, h: 52 });
      await expect(create).toBeEnabled();
      await expectInView(page.getByText("Already have an account?").last(), width, height);
      await page.screenshot({ path: `test-results/production/wa3-${width}x${height}.png` });
    });

    test("WA4 /signup/verify: the code row, CTA and info box beside the 420 px aside", async ({
      page,
    }) => {
      await open(page, "/en/signup/verify", page.getByRole("heading", { level: 1 }), (page) =>
        seedPending(page, "registration"),
      );
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(await verticalOverflow(page)).toBeLessThanOrEqual(0);
      await expectBox(page.locator("header").first(), { x: 0, y: 0, w: width, h: 72 });
      await expectBox(page.getByRole("heading", { level: 1, name: "Verify your email" }), {
        x: 64,
      });
      await expect(page.getByText("fighter@example.com")).toBeVisible();
      await expectBox(page.locator('[data-slot="code-input"] + div'), {
        x: 64,
        y: 254,
        w: 446,
        h: 78,
      });
      await expectBox(page.getByRole("button", { name: "Verify and continue" }), {
        x: 64,
        y: 372,
        h: 52,
      });
      await expectBox(page.locator('main [data-slot="notice"]').last(), { x: 64, w: 560 });
      const aside = page.locator("aside");
      await expectBox(aside, { x: width - 64 - 420, y: 120, w: 420 });
      await expect(aside.getByText("Your code is ••• •••")).toBeVisible();
      await expect(aside.getByText("Nothing picked yet")).toBeVisible();
      await expectInView(aside, width, height);
      await page.screenshot({ path: `test-results/production/wa4-${width}x${height}.png` });
    });

    test("WA1b /login/code: the 50 / 50 split, the 446 px code column centred in its half", async ({
      page,
    }) => {
      await open(page, "/en/login/code", page.getByRole("heading", { level: 1 }), (page) =>
        seedPending(page, "signIn"),
      );
      const half = width / 2;
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(await verticalOverflow(page)).toBeLessThanOrEqual(0);
      await expectBox(page.locator("[data-auth-frame=split]"), { x: 0, y: 0, w: width, h: height });
      await expectBox(page.locator("[data-auth-panel]"), { x: 0, y: 0, w: half, h: height });
      await expectBox(page.locator("main"), { x: half, y: 0, w: half, h: height });
      // The brand panel is WA1's: brand on the top padding, card on the bottom one.
      await expectBox(page.locator("[data-auth-panel] [data-auth-info-list]"), {
        x: 64,
        y: height - 56 - 292,
      });
      // WA1b's column: 446 px (the code row), centred both ways in its half.
      const column = page.locator("[data-auth-column]");
      const columnBox = await box(column);
      expect(Math.abs(columnBox.x - (half + (half - 446) / 2))).toBeLessThanOrEqual(1);
      expect(Math.abs(columnBox.width - 446)).toBeLessThanOrEqual(1);
      expect(Math.abs(columnBox.y - (height - columnBox.height) / 2)).toBeLessThanOrEqual(1);
      const order = [
        column.getByRole("heading", { level: 1, name: "Enter your sign-in code" }),
        column.locator('[data-slot="code-input"] + div'),
        notice(page, "Code sent."),
        column.getByRole("button", { name: "Sign in" }),
        column.getByText("Didn’t get it?"),
        column.getByText("Never share this code.", { exact: false }),
        column.getByRole("link", { name: "Create an account" }),
      ];
      for (const item of order) await expectInView(item, width, height);
      for (const [upper, lower] of order.slice(1).map((item, index) => [order[index], item])) {
        if (upper && lower) await expectAbove(upper, lower);
      }
      await expectBox(column.locator('[data-slot="code-input"] + div'), { w: 446, h: 78 });
      await expectBox(column.getByRole("button", { name: "Sign in", exact: true }), {
        w: 446,
        h: 52,
      });
      await page.screenshot({ path: `test-results/production/wa1b-${width}x${height}.png` });
    });

    test("WA4b /verify-email: the minimal frame, the result centred in main, no session", async ({
      page,
    }) => {
      await open(
        page,
        "/en/verify-email#token=geometry-fixture",
        page.getByRole("heading", { level: 1, name: "Email verified" }),
        (page) => apiOk(page, "auth/email/verification-links/verify", { status: "verified" }),
      );
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(await verticalOverflow(page)).toBeLessThanOrEqual(0);
      // The token never stays in the address bar.
      expect(page.url()).not.toContain("token");
      await expectBox(page.locator("header").first(), { x: 0, y: 0, w: width, h: 72 });
      await expect(page.getByRole("navigation", { name: "Site" })).toHaveCount(0);
      await expect(page.locator("[data-site-footer]")).toHaveCount(0);
      const main = await box(page.locator("main"));
      const result = page.getByRole("heading", { level: 1 }).locator("xpath=../..");
      const resultBox = await box(result);
      expect(Math.abs(resultBox.width - 560)).toBeLessThanOrEqual(1);
      expect(Math.abs(resultBox.x - (width - 560) / 2)).toBeLessThanOrEqual(1);
      const above = resultBox.y - main.y;
      const below = main.y + main.height - (resultBox.y + resultBox.height);
      expect(Math.abs(above - below), `${above} above, ${below} below`).toBeLessThanOrEqual(1);
      await expect(
        page.getByText("This link only verifies your email address.", { exact: false }),
      ).toBeVisible();
      await expectBox(page.getByRole("link", { name: "Go to SimpleFit" }), { h: 52 });
      await page.screenshot({ path: `test-results/production/wa4b-${width}x${height}.png` });
    });
  });
}

test.describe("states on the production routes (1440 × 900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const [state, status, code, message, cta] of [
    ["invalid", 422, "code_invalid", "That code isn’t right.", "Sign in"],
    ["expired", 422, "code_expired", "This code has expired.", "Send a new code"],
    ["throttled", 429, "rate_limited", "Too many attempts.", "Sign in"],
    ["error", 500, "internal_error", "Something went wrong.", "Try again"],
  ] as const) {
    test(`WA1b ${state}: the API's ${code} keeps the column and shows the artboard's state`, async ({
      page,
    }) => {
      await open(page, "/en/login/code", page.getByRole("heading", { level: 1 }), async (page) => {
        await seedPending(page, "signIn");
        await apiError(page, "auth/email/sign-in/verify", status, code);
      });
      const column = page.locator("[data-auth-column]");
      const before = await box(column.getByRole("heading", { level: 1 }));
      await typeCode(page, "528400");
      await expect(notice(page, message)).toBeVisible();
      const button = column.getByRole("button", { name: cta, exact: true });
      await expect(button).toBeVisible();
      if (state === "throttled") {
        await expect(button).toBeDisabled();
        await expect(column.getByText("Resend unavailable for now")).toBeVisible();
      } else {
        await expect(button).toBeEnabled();
      }
      // A state never moves the column off its centre or under the fold.
      const columnBox = await box(column);
      expect(Math.abs(columnBox.x - 857)).toBeLessThanOrEqual(1);
      expect(Math.abs(columnBox.y - (900 - columnBox.height) / 2)).toBeLessThanOrEqual(1);
      await expectInView(column, 1440, 900);
      const after = await box(column.getByRole("heading", { level: 1 }));
      expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
      expect(await verticalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/production/wa1b-${state}-1440.png` });
    });
  }

  for (const [state, status, code, message, cta] of [
    ["invalid", 422, "code_invalid", "That code isn’t right.", "Verify and continue"],
    ["expired", 422, "code_expired", "This code has expired.", "Send a new code"],
    [
      "verified-elsewhere",
      409,
      "verified_elsewhere",
      "This email was verified from another device.",
      "Send a new code",
    ],
    ["throttled", 429, "rate_limited", "Too many attempts.", "Verify and continue"],
  ] as const) {
    test(`WA4 ${state}: the API's ${code} shows the artboard's state in the 560 px block`, async ({
      page,
    }) => {
      await open(
        page,
        "/en/signup/verify",
        page.getByRole("heading", { level: 1 }),
        async (page) => {
          await seedPending(page, "registration");
          await apiError(page, "auth/email/registrations/verify", status, code);
        },
      );
      await typeCode(page, "482900");
      const shown = notice(page, message);
      await expect(shown).toBeVisible();
      await expectBox(shown, { x: 64, w: 560 });
      const button = page.getByRole("button", { name: cta, exact: true });
      await expect(button).toBeVisible();
      if (state === "throttled") await expect(button).toBeDisabled();
      else await expect(button).toBeEnabled();
      if (state === "verified-elsewhere") {
        await expect(page.getByRole("link", { name: "Sign in with a code" })).toBeVisible();
      }
      // The aside never moves with the step's state.
      await expectBox(page.locator("aside"), { x: 956, y: 120, w: 420 });
      expect(await verticalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/production/wa4-${state}-1440.png` });
    });
  }

  for (const [state, respond, title] of [
    [
      "already",
      (page: Page) =>
        apiOk(page, "auth/email/verification-links/verify", { status: "already_verified" }),
      "Email already verified",
    ],
    [
      "expired",
      (page: Page) => apiError(page, "auth/email/verification-links/verify", 422, "code_expired"),
      "This link has expired",
    ],
    [
      "error",
      (page: Page) => apiError(page, "auth/email/verification-links/verify", 500, "internal_error"),
      "We couldn’t check this link",
    ],
  ] as const) {
    test(`WA4b ${state}: the link's outcome, centred, never a session`, async ({ page }) => {
      await open(
        page,
        "/en/verify-email#token=geometry-fixture",
        page.getByRole("heading", { level: 1, name: title }),
        respond,
      );
      const result = await box(page.getByRole("heading", { level: 1 }).locator("xpath=../.."));
      expect(Math.abs(result.x - 440)).toBeLessThanOrEqual(1);
      await expect(
        page.getByText("This link only verifies your email address.", { exact: false }),
      ).toBeVisible();
      await expect(
        page.getByRole(state === "error" ? "button" : "link", {
          name: state === "error" ? "Try again" : "Go to SimpleFit",
        }),
      ).toBeVisible();
      await page.screenshot({ path: `test-results/production/wa4b-${state}-1440.png` });
    });
  }
});

test.describe("accessibility on the production routes", () => {
  const ROUTES = [
    ["WA1", "/en/login", undefined],
    ["WA1b", "/en/login/code", (page: Page) => seedPending(page, "signIn")],
    ["O02w", "/en/signup", undefined],
    ["WA3", "/en/signup/account", undefined],
    ["WA4", "/en/signup/verify", (page: Page) => seedPending(page, "registration")],
    [
      "WA4b",
      "/en/verify-email#token=geometry-fixture",
      (page: Page) => apiOk(page, "auth/email/verification-links/verify", { status: "verified" }),
    ],
  ] as const;

  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    for (const [name, route, setup] of ROUTES) {
      test(`${name} ${route.split("#")[0]} at ${width}: axe finds no WCAG 2.1 AA violations`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height });
        await open(page, route, page.getByRole("heading", { level: 1 }), setup);
        expect(await axeViolations(page)).toEqual([]);
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      });
    }
  }

  test("WA1b: the code input has focus on arrival, its label, and an announced error", async ({
    page,
  }) => {
    await open(page, "/en/login/code", page.getByRole("heading", { level: 1 }), async (page) => {
      await seedPending(page, "signIn");
      await apiError(page, "auth/email/sign-in/verify", 422, "code_invalid");
    });
    const input = page.getByRole("textbox", { name: "6-digit code" });
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute("autocomplete", "one-time-code");
    await page.keyboard.type("528400");
    // The polite live region announces the state; the visible box is its twin.
    await expect(
      page.getByRole("status").filter({ hasText: "That code isn’t right." }),
    ).toHaveCount(1);
    expect(await axeViolations(page)).toEqual([]);
  });

  test("WA4 verified-elsewhere: still accessible, the hand-off reachable by keyboard", async ({
    page,
  }) => {
    await open(page, "/en/signup/verify", page.getByRole("heading", { level: 1 }), async (page) => {
      await seedPending(page, "registration");
      await apiError(page, "auth/email/registrations/verify", 409, "verified_elsewhere");
    });
    await page.keyboard.type("482900");
    const handOff = page.getByRole("button", { name: "Send a new code", exact: true });
    await expect(handOff).toBeEnabled();
    expect(await axeViolations(page)).toEqual([]);
    // Keyboard order reaches the hand-off from the code input.
    for (
      let step = 0;
      step < 6 && !(await handOff.evaluate((el) => el === document.activeElement));
      step += 1
    ) {
      await page.keyboard.press("Tab");
    }
    await expect(handOff).toBeFocused();
  });
});
