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

/*
 * SF-24 layout regression: every auth composition lives inside the canonical
 * 1440 px frame (SF-34 Container) and stays centred beyond it; the design's
 * canvas width is never treated as the viewport. Values from WebLogin (WA1),
 * WebSignUp (O02w) and WebRegAccount (WA3), measured on the full-page stories.
 */
const frameOf = (page: Page, kind: string) => page.locator(`[data-auth-frame="${kind}"]`);

async function overflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("auth frame geometry (SF-24 regression)", () => {
  for (const width of [1920, 1440, 1280, 1024]) {
    test(`WA1 split frame is centred and contained at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await story(page, "authentication-login--full-page");
      const frame = await box(frameOf(page, "split"));
      const expected = Math.min(width, 1440);
      near(frame.width, expected);
      near(frame.x, (width - expected) / 2);

      // The form column is centred in the right half of the frame.
      const column = await box(page.locator("[data-auth-column]"));
      near(column.x + column.width / 2, frame.x + (frame.width * 3) / 4);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }

  test("WA1 at 1440: 720 px halves, bottom-anchored hero and After sign-in card, 440 px form column", async ({
    page,
  }) => {
    await story(page, "authentication-login--full-page");
    const panel = await box(page.locator("[data-auth-panel]"));
    near(panel.x, 0);
    near(panel.width, 720);
    near(panel.height, 900);

    // WebLogin: card max 460 px, its bottom on the 56 px panel padding, the
    // headline 20 px above it (the subtitle between them is not rendered).
    const card = await box(page.locator("[data-auth-panel] [data-auth-info-list]"));
    near(card.width, 460);
    near(card.x, 64);
    near(card.y + card.height, 900 - 56);
    await expect(page.locator("[data-auth-panel] [data-auth-info-list] li")).toHaveCount(4);
    const hero = await box(page.locator("[data-auth-hero]"));
    near(hero.x, 64);
    near(card.y - (hero.y + hero.height), 20);

    const column = await box(page.locator("[data-auth-column]"));
    near(column.width, 440);
    near(column.x, 720 + (720 - 440) / 2);
    near(column.y + column.height / 2, 450);
    await page.screenshot({ path: "test-results/wa1-full-page-1440.png" });
  });

  test("WA1b keeps the WA1 split frame and panel with the 440 px code column", async ({ page }) => {
    await story(page, "authentication-email-code--sign-in-sent");
    await page.getByRole("heading", { level: 1, name: "Enter your sign-in code" }).waitFor();
    near((await box(page.locator("[data-auth-panel]"))).width, 720);
    await expect(page.locator("[data-auth-panel] [data-auth-info-list]")).toBeVisible();
    const column = await box(page.locator("[data-auth-column]"));
    near(column.x, 860);
    near(column.width, 440);
  });

  test("WA3 at 1440: 72 px header, 1fr | 420 px grid with 56 px gap, two-column fields", async ({
    page,
  }) => {
    await story(page, "authentication-sign-up--create-account");
    near((await box(page.locator("header").first())).height, 73);
    const frame = await box(frameOf(page, "step"));
    near(frame.x, 0);
    near(frame.width, 1440);
    const left = await box(page.locator("[data-auth-step-column]"));
    const aside = await box(page.locator("aside"));
    near(left.x, 64);
    near(left.y, 73 + 48);
    near(aside.width, 420);
    near(aside.x, 1440 - 64 - 420);
    near(aside.x - (64 + (1440 - 128 - 56 - 420)), 56);
    // Full name | Email, 14 px apart, each 44 px tall.
    const name = await box(page.getByLabel("Full name"));
    const email = await box(page.getByLabel("Email"));
    near(name.height, 44);
    near(email.x - (name.x + name.width), 14);
    near(name.width, email.width);
    // ONE IDENTITY, WHAT HAPPENS NEXT and the info strip.
    await expect(page.locator("aside > *")).toHaveCount(3);
    await page.screenshot({ path: "test-results/wa3-1440.png" });
  });

  test("WA4 at 1440: the 420 px aside holds the masked E01 preview and After verifying", async ({
    page,
  }) => {
    await story(page, "authentication-email-code--verify-typing");
    await page.getByRole("heading", { level: 1, name: "Verify your email" }).waitFor();
    const aside = await box(page.locator("aside"));
    near(aside.width, 420);
    near(aside.x, 956);
    await expect(page.locator("aside > *")).toHaveCount(2);
    await expect(page.getByText("Your code is ••• •••")).toBeVisible();
    await expect(page.locator("aside [data-auth-info-list] li")).toHaveCount(3);
    await page.screenshot({ path: "test-results/wa4-1440.png" });
  });

  test("WA4b at 1440: site chrome and the 560 px result column", async ({ page }) => {
    await story(page, "authentication-verify-email--verified");
    const heading = page.getByRole("heading", { level: 1, name: "Email verified" });
    await heading.waitFor();
    near((await box(page.locator("header").first())).height, 77);
    near((await box(heading.locator("../.."))).width, 560);
    await expect(page.locator("[data-site-footer]")).toBeVisible();
  });

  test("WA1 at 768 collapses to the centred form column without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await story(page, "authentication-login--full-page");
    await expect(page.locator("[data-auth-hero]")).toBeHidden();
    const column = await box(page.locator("[data-auth-column]"));
    near(column.x + column.width / 2, 384);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test("WA1 at 1920 keeps the hero and the form inside the centred frame", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await story(page, "authentication-login--full-page");
    near((await box(page.locator("[data-auth-hero]"))).x, 240 + 64);
    near((await box(page.locator("[data-auth-column]"))).x, 240 + 860);
    await page.screenshot({ path: "test-results/wa1-full-page-1920.png" });
  });

  for (const width of [1920, 1440, 1280, 1024, 768]) {
    test(`O02w content frame is centred and contained at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 940 });
      await story(page, "authentication-sign-up--full-page");
      const frame = await box(frameOf(page, "signup"));
      near(frame.width, Math.min(width, 1440));
      near(frame.x, (width - frame.width) / 2);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }

  test("O02w at 1440: 64 px gutters, 1 : 1.25 columns, 72 px gap and the 2 × 2 role grid", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 940 });
    await story(page, "authentication-sign-up--full-page");
    const frame = frameOf(page, "signup");
    const left = await box(frame.locator("> div").first());
    const roles = await box(frame.locator("section ul"));

    near(left.x, 64);
    near(roles.x + roles.width, 1440 - 64);
    // Design: (1312 − 72) split 1 : 1.25 → 551 | 689. Production composes the
    // 72 px gap from the canonical 64 + 8 steps, so the split moves ≤ 4 px.
    expect(Math.abs(left.width - 551)).toBeLessThanOrEqual(4);
    expect(Math.abs(roles.width - 689)).toBeLessThanOrEqual(4);
    near(roles.x - (left.x + left.width), 72);

    const cards = frame.locator("section ul > li");
    await expect(cards).toHaveCount(4);
    const [a, b, c] = [await box(cards.nth(0)), await box(cards.nth(1)), await box(cards.nth(2))];
    near(b.x - (a.x + a.width), 16);
    near(c.y - (a.y + a.height), 16);
    near(a.width, b.width);
    // Content starts below the 76 px header + 56 px top padding.
    near(left.y, 77 + 56);
    // The site footer: 64 px gutters, groups 80 px apart.
    const footer = page.locator("[data-site-footer]");
    const groups = footer.locator("div.flex-wrap > *");
    await expect(groups).toHaveCount(5);
    const [blurb, product] = [await box(groups.nth(0)), await box(groups.nth(1))];
    near(blurb.x, 64);
    near(product.x - (blurb.x + blurb.width), 80);
    await page.screenshot({ path: "test-results/o02w-full-page-1440.png" });
  });

  test("WA3 step frame stays centred beyond 1440 with the 420 px aside on the frame gutter", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await story(page, "authentication-sign-up--create-account-wide");
    const frame = await box(frameOf(page, "step"));
    near(frame.x, 240);
    near(frame.width, 1440);
    const aside = await box(page.locator("aside"));
    near(aside.width, 420);
    near(aside.x + aside.width, 240 + 1440 - 64);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});
