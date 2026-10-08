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
    // The artboard's 50 px CTA on the nearest button step (`lg`, 48; §8.1).
    const cta = await box(page.getByRole("button", { name: "Email me a sign-in code" }));
    expect(Math.abs(cta.height - 50)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: "test-results/wa1-sign-in.png" });
  });
});

test.describe("WA1b · sign-in code", () => {
  test("six 66 × 78 px cells, 10 px apart, in the 446 px column", async ({ page }) => {
    await story(page, "authentication-email-code--sign-in-sent");
    const heading = page.getByRole("heading", { level: 1, name: "Enter your sign-in code" });
    await heading.waitFor();
    expect(await fontSize(heading)).toBe("30px");

    const cells = page.locator('[data-slot="code-input"] + div > span');
    await expect(cells).toHaveCount(6);
    const first = await box(cells.nth(0));
    const second = await box(cells.nth(1));
    near(first.width, 66);
    near(first.height, 78);
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
      if (text) await expect(page.locator('[data-slot="notice"]', { hasText: text })).toBeVisible();
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
    near((await box(page.locator("header").first())).height, 72); // hairline inside, as in WA3
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
      await expect(page.locator('[data-slot="notice"]', { hasText: text })).toBeVisible();
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

/*
 * Artboard conformance (SF-24). Expected boxes are the geometry of the
 * structured Claude Design artboards (version 1791360430-48c0), rendered from
 * source with the real fonts at their canonical size and measured with
 * getBoundingClientRect. Tolerance is 2 px unless a comment names the reason
 * (type roles whose line height differs by 1 px from the artboard's
 * `line-height: normal`, accumulated down a column).
 */
type Box = [x: number, y: number, w: number, h: number];

async function expectBox(
  locator: Locator,
  expected: Partial<Record<0 | 1 | 2 | 3, number>> | Box,
  tolerance = 2,
) {
  const r = await box(locator);
  const actual = [r.x, r.y, r.width, r.height];
  const entries = Array.isArray(expected)
    ? expected.map((v, i) => [i, v] as const)
    : Object.entries(expected).map(([i, v]) => [Number(i), v] as const);
  for (const [index, value] of entries) {
    expect(
      Math.abs(actual[index]! - value!),
      `${["x", "y", "w", "h"][index]} ${actual.join(",")} vs ${value}`,
    ).toBeLessThanOrEqual(tolerance);
  }
}

/** WA3 role segments that are not selected: not checked, not active, transparent. */
async function expectInactiveSegments(segmented: Locator, names: string[]) {
  for (const name of names) {
    const radio = segmented.getByRole("radio", { name });
    await expect(radio).toHaveAttribute("aria-checked", "false");
    expect(await radio.getAttribute("data-active")).toBeNull();
    expect(await radio.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      "rgba(0, 0, 0, 0)",
    );
  }
}

async function fontsLoaded(page: Page) {
  const families = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family),
  );
  for (const family of ["Unbounded", "Manrope", "JetBrains Mono"]) {
    expect(
      families.some((loaded) => loaded.includes(family)),
      family,
    ).toBe(true);
  }
}

test.describe("WA1 / WA1b conformance (WebLogin, WebSignInCode · 1440 × 900)", () => {
  test("WA1: split, brand, bottom-anchored headline over the After sign-in card, form column", async ({
    page,
  }) => {
    await story(page, "authentication-login--full-page");
    await fontsLoaded(page);
    // The branded half owns the full 900 px frame; the form half starts at the split.
    await expectBox(page.locator("[data-auth-panel]"), [0, 0, 720, 900]);
    await expectBox(page.locator("main"), { 0: 720, 1: 0, 2: 720 });
    await expectBox(page.locator("[data-auth-panel] a").first(), { 0: 64, 1: 56, 3: 36 });
    // The artboard's subtitle is not rendered (decision D5) but its row stays
    // reserved: the headline keeps the designed 439.
    await expectBox(page.locator("[data-auth-hero]"), [64, 439, 592, 50]);
    await expectBox(page.locator("[data-auth-panel] [data-auth-info-list]"), [64, 553, 498, 291]);
    await expectBox(page.locator("[data-auth-column]"), [860, 230, 440, 440]);
    await expectBox(page.locator("[data-auth-column] h1"), { 0: 860, 1: 230 });
    await expectBox(page.getByLabel("Email"), [860, 498, 440, 44]);
    await expectBox(
      page.getByRole("button", { name: "Email me a sign-in code" }),
      [860, 556, 440, 50],
    );
    // The provider rows (2 × 52 px with a 14 px gap) end where the divider starts.
    await expectBox(page.getByText("or with email", { exact: true }), { 1: 444 });
    // Not linked: /sponsor/login is a placeholder (D7), so WA1 omits it.
    await expect(page.getByRole("link", { name: "Sponsor sign in" })).toHaveCount(0);
  });

  test("WA1b typing: eyebrow, title, code row, CTA and guidance on the artboard rows", async ({
    page,
  }) => {
    await story(page, "authentication-email-code--sign-in-typing");
    await page.getByRole("heading", { level: 1, name: "Enter your sign-in code" }).waitFor();
    await fontsLoaded(page);
    // Both edges of the centred column on the artboard's (233 → 668).
    const column = page.locator("[data-auth-column]");
    await expectBox(column, { 0: 857, 1: 233, 2: 446 });
    const { y, height } = await box(column);
    expect(Math.abs(y + height - 668)).toBeLessThanOrEqual(2);
    await expectBox(page.getByRole("heading", { level: 1 }), { 0: 857, 1: 260 });
    await expectBox(page.locator('[data-slot="code-input"] + div'), [857, 363, 446, 78]);
    await expectBox(page.getByRole("button", { name: "Sign in", exact: true }), {
      0: 857,
      1: 455,
      2: 446,
    });
    await expectBox(page.locator('[data-slot="notice"]').last(), [857, 588, 446, 48]);
  });

  test("WA1b: 446 px code column, 66 × 78 cells 10 px apart, 48 px guidance box", async ({
    page,
  }) => {
    await story(page, "authentication-email-code--sign-in-sent");
    await page.getByRole("heading", { level: 1, name: "Enter your sign-in code" }).waitFor();
    await fontsLoaded(page);
    await expectBox(page.locator("[data-auth-panel] [data-auth-info-list]"), [64, 553, 498, 291]);
    await expectBox(page.locator("[data-auth-column]"), { 0: 857, 2: 446 });
    const cells = page.locator('[data-slot="code-input"] + div > span');
    await expectBox(cells.nth(0), { 0: 857, 2: 66, 3: 78 }, 1);
    near((await box(cells.nth(1))).x, 857 + 76);
    await expectBox(page.locator('[data-slot="code-input"] + div'), { 0: 857, 2: 446, 3: 78 }, 1);
    await expectBox(page.locator('[data-slot="notice"]').last(), { 0: 857, 2: 446, 3: 48 }, 1);
  });

  for (const [width, height] of [
    [1440, 1200],
    [1920, 1080],
  ] as const) {
    test(`at ${width} × ${height} the branded panel runs the full height and the 900 px composition stays put`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await story(page, "authentication-login--full-page");
      await fontsLoaded(page);
      const x = (width - 1440) / 2;
      // The panel owns its gradient down to the bottom of the window ...
      await expectBox(page.locator("[data-auth-panel]"), [x, 0, 720, height]);
      // ... while the content keeps its 1440 × 900 coordinates.
      await expectBox(page.locator("[data-auth-hero]"), { 0: x + 64, 1: 439 });
      await expectBox(page.locator("[data-auth-panel] [data-auth-info-list]"), {
        0: x + 64,
        1: 553,
        3: 291,
      });
      await expectBox(page.locator("[data-auth-column]"), { 0: x + 860, 1: 230, 3: 440 });
      expect(
        await page
          .locator("[data-auth-panel]")
          .evaluate((el) => getComputedStyle(el).backgroundImage.startsWith("linear-gradient")),
      ).toBe(true);
    });
  }

  for (const width of [1920, 1280, 1024]) {
    test(`WA1 frame is centred and contained at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await story(page, "authentication-login--full-page");
      const frame = await box(frameOf(page, "split"));
      near(frame.width, Math.min(width, 1440));
      near(frame.x, (width - frame.width) / 2);
      const column = await box(page.locator("[data-auth-column]"));
      near(column.x + column.width / 2, frame.x + (frame.width * 3) / 4);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }

  test("WA1 at 768 collapses to the centred form column without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await story(page, "authentication-login--full-page");
    await expect(page.locator("[data-auth-hero]")).toBeHidden();
    const column = await box(page.locator("[data-auth-column]"));
    near(column.x + column.width / 2, 384);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("O02w conformance (WebSignUp · 1440 × 940)", () => {
  test("header, 1 : 1.25 grid with a 72 px gap, 2 × 2 role cards, info strip and footer", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 940 });
    await story(page, "authentication-sign-up--full-page");
    await fontsLoaded(page);
    await expectBox(page.locator("header").first(), [0, 0, 1440, 76]);
    const frame = frameOf(page, "signup");
    const left = frame.locator("> div").first();
    await expectBox(left, [64, 132, 551, 522]);
    await expectBox(left.locator("> span").first(), [64, 132, 72, 72]);
    await expectBox(frame.locator("h1"), { 0: 64, 1: 226, 2: 551 });
    // The three 54 px methods, 10 px apart (Google renders in a 54 px slot).
    await expectBox(left.locator("> div").first(), [64, 430, 420, 182]);
    await expectBox(page.getByRole("link", { name: "Continue with email" }), [64, 558, 420, 54]);
    const grid = frame.locator("section ul");
    await expectBox(grid, [687, 164, 689, 410]);
    for (const [index, x, y] of [
      [0, 687, 164],
      [1, 1040, 164],
      [2, 687, 377],
      [3, 1040, 377],
    ] as const) {
      await expectBox(grid.locator("> li").nth(index), [x, y, 336, 197]);
    }
    await expectBox(frame.locator('[data-slot="notice"]'), [687, 590, 689, 48]);
    await expectBox(page.locator("[data-site-footer]"), [0, 750, 1440, 190]);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test("footer columns sit on the artboard's x and row positions", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 940 });
    await story(page, "authentication-sign-up--full-page");
    await fontsLoaded(page);
    const footer = page.locator("[data-site-footer]");
    for (const [name, x, rows] of [
      ["Product", 404, 4],
      ["Business", 538, 4],
      ["Partners", 692, 3],
      ["Company", 897, 4],
    ] as const) {
      const column = footer.getByRole("navigation", { name });
      await expectBox(column, { 0: x, 1: 787 });
      // 26 px rows from 808 (13 px links, 8 px apart on the artboard).
      for (let row = 0; row < rows; row++) {
        await expectBox(column.locator("> *").nth(row + 1), { 0: x, 1: 808 + row * 26 });
      }
    }
    await expectBox(footer.getByText("The boxing operating system", { exact: false }), {
      0: 64,
      1: 827,
      2: 260,
    });
  });

  test("a taller window does not spread the 940 px composition: the footer stays at 750", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await story(page, "authentication-sign-up--full-page");
    await fontsLoaded(page);
    await expectBox(frameOf(page, "signup").locator("h1"), { 0: 64, 1: 226 });
    await expectBox(page.locator("[data-site-footer]"), [0, 750, 1440, 190]);
  });

  for (const width of [1920, 1280, 1024, 768]) {
    test(`O02w content frame is centred and contained at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 940 });
      await story(page, "authentication-sign-up--full-page");
      const frame = await box(frameOf(page, "signup"));
      near(frame.width, Math.min(width, 1440));
      near(frame.x, (width - frame.width) / 2);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }
});

test.describe("WA3 conformance (WebRegAccount · 1440 × 900)", () => {
  test("header, neutral role segments, name | email, checks, CTA and the aside cards", async ({
    page,
  }) => {
    await story(page, "authentication-sign-up--create-account");
    await fontsLoaded(page);
    await expectBox(page.locator("header").first(), [0, 0, 1440, 72]);
    await expectBox(page.locator("header a").first(), { 0: 56, 1: 21, 3: 30 });
    await expectBox(page.locator("[data-auth-header-action]"), [1224, 26, 160, 20]);
    // Right-aligned on the header's 56 px gutter (1440 − 56).
    const action = await box(page.locator("[data-auth-header-action]"));
    near(action.x + action.width, 1384);
    await expectBox(page.locator("[data-auth-step-column]"), { 0: 64, 1: 120, 2: 836 });
    const segmented = page.getByRole("radiogroup", { name: "Signing up as" });
    await expectBox(segmented, [64, 230, 836, 46]);
    // No intent (SF-45): no segment is active, so no role is implied.
    await expectInactiveSegments(segmented, ["Fighter", "Coach", "Gym / Club"]);
    await expectBox(segmented.getByRole("radio", { name: "Fighter" }), [69, 235, 273, 36]);
    await expectBox(page.getByLabel("Full name"), [64, 342, 411, 44]);
    await expectBox(page.getByLabel("Email"), [489, 342, 411, 44]);
    const checks = page.locator("[data-auth-step-column] form label:has([data-slot=checkbox])");
    await expect(checks).toHaveCount(3);
    for (const [index, y] of [
      [0, 438],
      [1, 470],
      [2, 502],
    ] as const) {
      await expectBox(checks.nth(index), { 0: 64, 1: y });
      await expect(checks.nth(index).locator("[data-slot=checkbox]")).not.toBeChecked();
    }
    const create = page.getByRole("button", { name: "Create account" });
    await expectBox(create, { 0: 64, 1: 540 });
    // Width follows the label's glyphs (15 px Manrope): within 3 px of 150.
    await expectBox(create, { 2: 150 }, 3);
    await expect(
      page.getByText("Role, name and consents are set after you verify your email."),
    ).toHaveCount(0);

    const aside = page.locator("aside");
    await expectBox(aside, { 0: 956, 1: 120, 2: 420 });
    await expectBox(aside.locator("> *").nth(0), [956, 120, 420, 147]);
    const chips = aside.locator("> *").nth(0).locator("li > span");
    expect(await chips.nth(0).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      "rgb(38, 43, 21)",
    );
    expect(await chips.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      "rgb(31, 35, 32)",
    );
    await expectBox(aside.locator("> *").nth(1), [956, 281, 420, 233]);
    await expectBox(aside.locator("> *").nth(2), [956, 528, 420, 62]);
    await expect(page.getByText(/\bW01\b/)).toHaveCount(0);
    await page.screenshot({ path: "test-results/wa3-1440.png" });
  });

  test("Fighter intent: the Fighter segment is active in the artboard's bone segment", async ({
    page,
  }) => {
    await story(page, "authentication-sign-up--create-account-fighter-intent");
    await fontsLoaded(page);
    const segmented = page.getByRole("radiogroup", { name: "Signing up as" });
    await expectBox(segmented, [64, 230, 836, 46]);
    await expect(segmented).toHaveAttribute("aria-disabled", "true");
    const fighter = segmented.getByRole("radio", { name: "Fighter" });
    await expect(fighter).toHaveAttribute("aria-checked", "true");
    await expect(fighter).toHaveAttribute("data-active", "true");
    await expectBox(fighter, [69, 235, 273, 36]);
    expect(await fighter.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      "rgb(237, 239, 231)",
    );
    await expectInactiveSegments(segmented, ["Coach", "Gym / Club"]);
    // The rest of the step keeps its place whatever the intent.
    await expectBox(page.getByLabel("Email"), [489, 342, 411, 44]);
    await expectBox(page.getByRole("button", { name: "Create account" }), { 0: 64, 1: 540 });
    await page.screenshot({ path: "test-results/wa3-1440-fighter-intent.png" });
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

test.describe("WA4 conformance (WebRegVerify · 1440 × 900)", () => {
  test("code row, CTA, links, info box and the 420 px aside", async ({ page }) => {
    await story(page, "authentication-email-code--verify-typing");
    await page.getByRole("heading", { level: 1, name: "Verify your email" }).waitFor();
    await fontsLoaded(page);
    await expectBox(page.locator("header").first(), [0, 0, 1440, 72]);
    await expectBox(page.locator('[data-slot="code-input"] + div'), {
      0: 64,
      1: 254,
      2: 446,
      3: 78,
    });
    await expectBox(page.getByRole("button", { name: "Verify and continue" }), { 0: 64, 1: 372 });
    await expectBox(page.getByText("Wrong address?", { exact: false }), { 0: 64, 1: 444, 3: 20 });
    await expectBox(page.locator('main [data-slot="notice"]').last(), [64, 484, 560, 80]);
    const aside = page.locator("aside");
    await expectBox(aside, { 0: 956, 1: 120, 2: 420 });
    await expectBox(aside.locator("> *").nth(0), [956, 120, 420, 201]);
    await expectBox(aside.locator("> *").nth(1), [956, 335, 420, 229]);
    await expect(page.getByText("Your code is ••• •••")).toBeVisible();
    await page.screenshot({ path: "test-results/wa4-1440.png" });
  });
});

test.describe("WA4b (WebEmailVerified · 1440 × 900)", () => {
  test("560 px result column in the registry's site chrome", async ({ page }) => {
    await story(page, "authentication-verify-email--verified");
    const heading = page.getByRole("heading", { level: 1, name: "Email verified" });
    await heading.waitFor();
    await expectBox(page.locator("header").first(), { 0: 0, 1: 0, 2: 1440, 3: 76 });
    near((await box(heading.locator("../.."))).width, 560);
    near((await box(heading.locator("../.."))).x, 440);
    await expect(page.locator("[data-site-footer]")).toBeVisible();
  });
});
