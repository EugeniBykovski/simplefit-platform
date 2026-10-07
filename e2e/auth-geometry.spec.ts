import { expect, test, type Locator, type Page } from "@playwright/test";

/*
 * SF-24 geometry of the authentication screens, measured on the production
 * components in the static Storybook build at the Claude Design web frame
 * (1440 × 900) and at a 390 px phone width. Values from WebLogin,
 * WebSignInCode, WebSignUp, WebRegAccount, WebRegVerify, WebEmailVerified and
 * the AuthCodeInput component (CSS px, ±1 px). Every code state is reached
 * through the real component and the deterministic API adapter.
 */
async function story(page: Page, id: string) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:Dark`);
  expect(response?.ok(), `iframe for ${id}`).toBe(true);
  await page.waitForFunction(() =>
    ["sb-show-main", "sb-show-errordisplay"].some((name) => document.body.classList.contains(name)),
  );
  if (await page.evaluate(() => document.body.classList.contains("sb-show-errordisplay"))) {
    const message = await page.locator("#error-message").textContent();
    throw new Error(`Story ${id} failed to render: ${message ?? "unknown error"}`);
  }
  await page.locator("#storybook-root > *").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error("element is not visible");
  return rect;
}

const near = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 0);
const fontSize = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).fontSize);

test.describe("WA1 · sign in", () => {
  test("split frame, 440 px form column, auth type roles and control heights", async ({ page }) => {
    await story(page, "authentication-sign-in--default");

    const hero = page.getByText("Welcome back.");
    expect(await fontSize(hero)).toBe("48px");
    const panel = await box(hero.locator(".."));
    near(panel.x, 0);
    near(panel.width, 720);

    const heading = page.getByRole("heading", { level: 1, name: "Sign in" });
    expect(await fontSize(heading)).toBe("30px");
    const column = await box(heading.locator(".."));
    near(column.width, 440);
    near(column.x, 720 + (720 - 440) / 2);

    near((await box(page.getByLabel("Email"))).height, 44);
    near((await box(page.getByRole("button", { name: "Email me a sign-in code" }))).height, 54);
    await page.screenshot({ path: "test-results/wa1-sign-in.png" });
  });
});

test.describe("WA1b · sign-in code", () => {
  test("six 64 × 76 px cells, 10 px apart, in the 440 px column", async ({ page }) => {
    await story(page, "authentication-email-code--sign-in-sent");
    const heading = page.getByRole("heading", { level: 1, name: "Enter your sign-in code" });
    await heading.waitFor();
    expect(await fontSize(heading)).toBe("30px");

    const cells = page.locator('[data-slot="code-input"] + div > span');
    await expect(cells).toHaveCount(6);
    const first = await box(cells.nth(0));
    const second = await box(cells.nth(1));
    near(first.width, 64);
    near(first.height, 76);
    near(second.x - (first.x + first.width), 10);
    expect(await fontSize(cells.nth(0))).toBe("30px");
    await page.screenshot({ path: "test-results/wa1b-sent.png" });
  });

  for (const [state, text] of [
    ["typing", null],
    ["invalid", "That code isn’t right. Check the digits and try again."],
    ["expired", "This code has expired. Send a new one to sign in."],
    ["resent", "We sent a new code. It expires in 10 minutes."],
    ["submitting", null],
    ["success", "You’re signed in."],
    ["throttled", "Too many attempts. Try again shortly."],
    ["error", "Something went wrong. Try again."],
  ] as const) {
    test(`state: ${state}`, async ({ page }) => {
      const errors = await story(page, `authentication-email-code--sign-in-${state}`);
      if (text) await expect(page.getByText(text)).toBeVisible();
      if (state === "submitting") {
        await expect(page.getByRole("button", { name: "Signing in…" })).toBeDisabled();
      }
      if (state === "typing") {
        await expect(page.getByLabel("6-digit code")).toHaveValue("5284");
      }
      expect(errors).toEqual([]);
      await page.screenshot({ path: `test-results/wa1b-${state}.png` });
    });
  }
});

test.describe("WA3 / WA4 · registration steps", () => {
  test("72 px header, 64 px gutter, 420 px aside and the 34 px title", async ({ page }) => {
    await story(page, "authentication-sign-up--create-account");
    near((await box(page.locator("header").first())).height, 73); // + 1 px hairline
    const heading = page.getByRole("heading", { level: 1, name: "Create your SimpleFit account" });
    expect(await fontSize(heading)).toBe("34px");
    near((await box(heading)).x, 64);
    near((await box(page.locator("aside"))).width, 420);
    near((await box(page.getByLabel("Email"))).height, 44);
    near((await box(page.getByRole("button", { name: "Create account" }))).height, 54);
    await page.screenshot({ path: "test-results/wa3-account.png" });
  });

  for (const [state, text] of [
    ["invalid", "That code isn’t right. Check the digits and try again."],
    ["expired", "This code has expired. Send a new one to verify your email."],
    ["verified", "Email verified on this device."],
    ["verified-elsewhere", "This email was verified from another device."],
    ["throttled", "Too many attempts. Try again shortly."],
  ] as const) {
    test(`verify state: ${state}`, async ({ page }) => {
      const errors = await story(page, `authentication-email-code--verify-${state}`);
      await expect(page.getByText(text, { exact: false })).toBeVisible();
      expect(errors).toEqual([]);
      await page.screenshot({ path: `test-results/wa4-${state}.png` });
    });
  }
});

test.describe("O02w · welcome", () => {
  test("52 px display headline, 72 px tile and 420 px method column", async ({ page }) => {
    await story(page, "authentication-welcome--default");
    const heading = page.getByRole("heading", { level: 1 });
    expect(await fontSize(heading)).toBe("52px");
    const email = await box(page.getByRole("link", { name: "Continue with Email" }));
    near(email.width, 420);
    near(email.height, 54);
    near(email.x, 64);
    await page.screenshot({ path: "test-results/o02w-welcome.png" });
  });
});

test.describe("WA4b · email link", () => {
  for (const [state, title] of [
    ["verified", "Email verified"],
    ["already-verified", "Email already verified"],
    ["expired", "This link has expired"],
    ["missing-token", "This link has expired"],
  ] as const) {
    test(`${state}: 560 px column, the fragment removed, no session`, async ({ page }) => {
      await story(page, `authentication-verify-email--${state}`);
      const heading = page.getByRole("heading", { level: 1, name: title });
      await heading.waitFor();
      expect(await fontSize(heading)).toBe("34px");
      near((await box(heading.locator("../.."))).width, 560);
      expect(await page.evaluate(() => window.location.hash)).toBe("");
      await page.screenshot({ path: `test-results/wa4b-${state}.png` });
    });
  }
});

test.describe("phone width (390)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const id of [
    "authentication-sign-in--default",
    "authentication-email-code--sign-in-sent",
    "authentication-email-code--verify-typing",
    "authentication-sign-up--create-account",
    "authentication-welcome--default",
    "authentication-verify-email--verified",
  ]) {
    test(`${id} fits without horizontal scrolling`, async ({ page }) => {
      await story(page, id);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/phone-${id}.png`, fullPage: true });
    });
  }
});

test("Storybook never loads a live auth provider script", async ({ page }) => {
  const providers: string[] = [];
  page.on("request", (request) => {
    if (/accounts\.google\.com|appleid\.cdn-apple\.com/.test(request.url())) {
      providers.push(request.url());
    }
  });
  await story(page, "authentication-sign-in--default");
  await page.getByRole("heading", { level: 1, name: "Sign in" }).waitFor();
  await expect(page.getByText("Google sign-in is not available right now.")).toBeVisible();
  expect(providers).toEqual([]);
});
