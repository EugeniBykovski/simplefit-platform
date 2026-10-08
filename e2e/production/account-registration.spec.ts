import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

import { axeViolations, box, expectBox, open, overflow } from "./harness";
import { onboardingApi, type OnboardingApi, type OnboardingApiOptions } from "./onboarding-api";

/*
 * WA5 Account basics & consent on the production build (SF-46): the real
 * route (`/app/onboarding/account`), its gates and components against a test
 * double of the SF-44 account registration and the SF-45 entry resolver
 * (./onboarding-api). Every assertion about persistence reads what the page
 * sent or what the double stored, never client state. Geometry against
 * Claude Design V78 WebAccountBasics (1440 × 980) closes the file.
 */

const ROUTE = "/en/app/onboarding/account";
const heading = (page: Page) => page.getByRole("heading", { level: 1, name: "Before you start" });
const fullName = (page: Page) => page.getByLabel("Full name");
const dob = (page: Page) => page.getByLabel("Date of birth");
const terms = (page: Page) => page.getByRole("checkbox", { name: /Terms of Service/ });
const privacy = (page: Page) => page.getByRole("checkbox", { name: /Privacy Policy/ });
const news = (page: Page) => page.getByRole("checkbox", { name: /product news/ });
const cta = (page: Page) => page.getByRole("button", { name: /^(Continue|Saving…)$/ });

/** Writes to the account registration (the session refresh and the other APIs aside). */
const accountWrites = (api: OnboardingApi) =>
  api.requests.filter(
    (request) => request.method !== "GET" && request.path.startsWith("/api/v1/me/account-profile"),
  );
const completions = (api: OnboardingApi) =>
  api.requests.filter((request) => request.path.endsWith("/complete-registration"));
const registration = (api: OnboardingApi) =>
  (api.account() as { registration: { status: string; completed_at: string | null } }).registration;
const consents = (api: OnboardingApi) =>
  (
    api.account() as {
      consents: Record<"terms" | "privacy", { accepted: boolean; accepted_version: string | null }>;
    }
  ).consents;

/** A calendar date `years` before today (the browser's and the test's clock agree on the day). */
function yearsAgo(years: number, days = 0) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function openWa5(page: Page, options: OnboardingApiOptions = {}, query = "") {
  const api = await onboardingApi(page, { accountComplete: false, ...options });
  await page.goto(`${ROUTE}${query}`);
  await expect(heading(page)).toBeVisible();
  await expect(fullName(page)).toBeVisible();
  return api;
}

async function fillAll(page: Page, { name = "Alex Kowalski", date = "2000-05-17" } = {}) {
  await fullName(page).fill(name);
  await dob(page).fill(date);
  await terms(page).click();
  await privacy(page).click();
}

/** Answers the matching request with `status` while `active()`; otherwise the double answers. */
async function override(
  page: Page,
  path: string,
  method: string,
  status: number,
  json: unknown,
  active: () => boolean = () => true,
) {
  await page.route(
    (url) => url.pathname === path && url.port !== "3100",
    (route: Route) =>
      route.request().method() === method && active()
        ? route.fulfill({ status, json })
        : route.fallback(),
  );
}

const ERROR = (code: string) => ({ error: { code, message: "", details: {}, request_id: null } });

test.use({ viewport: { width: 1440, height: 980 } });

test.describe("access and first load", () => {
  test("1 · signed out: WA5 sends the visitor to sign-in with the journey kept", async ({
    page,
  }) => {
    const api = await onboardingApi(page, { signedOut: true });
    await page.goto(`${ROUTE}?intent=fighter`);
    await page.waitForURL((url) => url.pathname === "/en/login");
    expect(new URL(page.url()).searchParams.get("intent")).toBe("fighter");
    expect(accountWrites(api)).toEqual([]);
  });

  test("2–4 · a new account: not_started, an empty form, every consent unchecked, nothing written", async ({
    page,
  }) => {
    const api = await openWa5(page);
    expect(api.requests.some((request) => request.path === "/api/v1/me/account-profile")).toBe(
      true,
    );
    expect(registration(api).status).toBe("not_started");
    await expect(fullName(page)).toHaveValue("");
    await expect(dob(page)).toHaveValue("");
    for (const box of [terms(page), privacy(page), news(page)]) {
      await expect(box).not.toBeChecked();
      await expect(box).toBeEnabled();
    }
    // The step card: Account basics is current; nothing else is reachable from here.
    await expect(page.locator("[aria-current=step]")).toHaveText("1Account basics");
    // Opening WA5 creates nothing.
    expect(accountWrites(api)).toEqual([]);
    expect(registration(api).status).toBe("not_started");
    // No legal links that lead nowhere (no published documents yet).
    await expect(page.getByRole("link", { name: "Read" })).toHaveCount(0);
  });

  test("loading: the heading, aside and a disabled Continue with a reason; the form outlined", async ({
    page,
  }) => {
    let release!: () => void;
    const loaded = new Promise<void>((resolve) => (release = resolve));
    await onboardingApi(page, { accountComplete: false });
    await page.route(
      (url) => url.pathname === "/api/v1/me/account-profile" && url.port !== "3100",
      async (route) => {
        await loaded;
        await route.fallback();
      },
    );
    await page.goto(ROUTE);
    await expect(heading(page)).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Loading your account…" }),
    ).toBeVisible();
    await expect(cta(page)).toBeDisabled();
    await expect(page.getByRole("heading", { level: 2, name: "Why we ask" })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/production/wa5-loading.png" });
    release();
    await expect(fullName(page)).toBeVisible();
    await expect(cta(page)).toBeEnabled();
  });

  test("load failure: the amber notice and a retry, never an empty form", async ({ page }) => {
    let failing = true;
    await onboardingApi(page, { accountComplete: false });
    await override(
      page,
      "/api/v1/me/account-profile",
      "GET",
      503,
      ERROR("service_unavailable"),
      () => failing,
    );
    await page.goto(ROUTE);
    await expect(page.getByText("We couldn’t load your account.")).toBeVisible();
    await expect(fullName(page)).toHaveCount(0);
    failing = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(fullName(page)).toBeVisible();
  });
});

test.describe("saving and completing", () => {
  test("5–7, 15, 17, 18 · full name, DOB and both consents, then completion and the Fighter journey", async ({
    page,
  }) => {
    const api = await openWa5(page, {}, "?intent=fighter");
    await fillAll(page);
    await cta(page).click();
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/fighter");
    expect(new URL(page.url()).searchParams.get("intent")).toBe("fighter");
    await expect(
      page.getByRole("heading", { level: 1, name: "Your fighter profile" }),
    ).toBeVisible();

    const [patch, complete, ...rest] = accountWrites(api);
    // One PATCH of exactly what was entered (product news untouched: not sent), then completion.
    expect(patch).toMatchObject({
      method: "PATCH",
      path: "/api/v1/me/account-profile",
      body: {
        full_name: "Alex Kowalski",
        date_of_birth: "2000-05-17",
        accept_terms: true,
        accept_privacy: true,
      },
    });
    expect(Object.keys(patch?.body as object).sort()).toEqual([
      "accept_privacy",
      "accept_terms",
      "date_of_birth",
      "full_name",
    ]);
    expect(complete).toMatchObject({
      method: "POST",
      path: "/api/v1/me/account-profile/complete-registration",
    });
    expect(rest).toEqual([]);
    // Recorded by the server at the versions in force; news stays unsubscribed.
    expect(consents(api).terms.accepted_version).toBe("terms-v1");
    expect(consents(api).privacy.accepted_version).toBe("privacy-v1");
    expect(
      (api.account() as { product_news: { subscribed: boolean } }).product_news.subscribed,
    ).toBe(false);
    expect(registration(api).status).toBe("complete");
    // SF-45 asked again after completion, with the Fighter intent.
    const completedAt = api.requests.findIndex((request) => request === complete);
    expect(
      api.requests
        .slice(completedAt)
        .some(
          (request) => request.path === "/api/v1/me/entry" && request.query === "?intent=fighter",
        ),
    ).toBe(true);
  });

  test("7 · product news is an opt-in the visitor ticks, sent as such", async ({ page }) => {
    const api = await openWa5(page);
    await fillAll(page);
    await news(page).click();
    await cta(page).click();
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/role");
    expect(accountWrites(api)[0]?.body).toMatchObject({ product_news: true });
    expect(
      (api.account() as { product_news: { subscribed: boolean } }).product_news.subscribed,
    ).toBe(true);
  });

  test("8 · Continue on an empty form: every requirement shown, focus on the first, nothing sent", async ({
    page,
  }) => {
    const api = await openWa5(page);
    await cta(page).click();
    await expect(page.getByText("Check the highlighted fields.")).toBeVisible();
    await expect(page.getByText("Enter your full name.")).toBeVisible();
    await expect(page.getByText("Enter your date of birth.")).toBeVisible();
    await expect(page.getByText("Accept the Terms of Service to continue.")).toBeVisible();
    await expect(page.getByText("Accept the Privacy Policy to continue.")).toBeVisible();
    await expect(fullName(page)).toBeFocused();
    await expect(fullName(page)).toHaveAttribute("aria-invalid", "true");
    expect(accountWrites(api)).toEqual([]);
    expect(registration(api).status).toBe("not_started");
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/production/wa5-invalid.png", fullPage: true });
  });

  test("9 · a partial registration is saved, and a reload resumes it from the server", async ({
    page,
  }) => {
    const api = await openWa5(page, { account: { full_name: "Alex Kowalski", terms: "terms-v1" } });
    // Hydrated from the server: the accepted Terms are checked and locked (no withdrawal).
    await expect(fullName(page)).toHaveValue("Alex Kowalski");
    await expect(terms(page)).toBeChecked();
    await expect(terms(page)).toBeDisabled();
    await expect(privacy(page)).not.toBeChecked();
    await dob(page).fill("2000-05-17");
    await cta(page).click();
    // Privacy is still missing: the date is saved, nothing completes.
    await expect(page.getByText("Accept the Privacy Policy to continue.")).toBeVisible();
    expect(accountWrites(api)).toEqual([
      expect.objectContaining({ method: "PATCH", body: { date_of_birth: "2000-05-17" } }),
    ]);
    expect(registration(api).status).toBe("in_progress");
    await page.reload();
    await expect(dob(page)).toHaveValue("2000-05-17");
    await expect(fullName(page)).toHaveValue("Alex Kowalski");
    await expect(terms(page)).toBeChecked();
  });

  test("10 · a missing consent blocks completion; the valid fields are saved, the box is focused", async ({
    page,
  }) => {
    const api = await openWa5(page);
    await fullName(page).fill("Alex Kowalski");
    await dob(page).fill("2000-05-17");
    await terms(page).click();
    await cta(page).click();
    await expect(page.getByText("Accept the Privacy Policy to continue.")).toBeVisible();
    await expect(privacy(page)).toBeFocused();
    expect(completions(api)).toEqual([]);
    expect(accountWrites(api)).toEqual([
      expect.objectContaining({
        body: { full_name: "Alex Kowalski", date_of_birth: "2000-05-17", accept_terms: true },
      }),
    ]);
    // Saved fields are the new baseline: completing now sends only the new tick.
    await privacy(page).click();
    await cta(page).click();
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/role");
    expect(accountWrites(api).map((request) => request.body ?? null)).toEqual([
      { full_name: "Alex Kowalski", date_of_birth: "2000-05-17", accept_terms: true },
      { accept_privacy: true },
      null,
    ]);
  });

  test("11 · an impossible or future date fails safely: not sent, the field explains", async ({
    page,
  }) => {
    const api = await openWa5(page);
    await fillAll(page, { date: "2999-01-01" });
    await cta(page).click();
    await expect(page.getByText("Enter a real date, not in the future.")).toBeVisible();
    await expect(dob(page)).toBeFocused();
    expect(accountWrites(api)[0]?.body).not.toHaveProperty("date_of_birth");
    expect(completions(api)).toEqual([]);
  });

  test("12 · under 16 by one day fails; 16 today passes", async ({ page }) => {
    const api = await openWa5(page);
    await fillAll(page, { date: yearsAgo(16, 1) });
    await cta(page).click();
    await expect(page.getByText("You must be 16 or older to use SimpleFit.")).toBeVisible();
    expect(accountWrites(api)[0]?.body).not.toHaveProperty("date_of_birth");
    expect(completions(api)).toEqual([]);
    await dob(page).fill(yearsAgo(16));
    await cta(page).click();
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/role");
    expect((api.account() as { date_of_birth: string }).date_of_birth).toBe(yearsAgo(16));
  });

  test("14 · the API's field codes land on their controls, focus on the first", async ({
    page,
  }) => {
    const api = await openWa5(page);
    await override(page, "/api/v1/me/account-profile", "PATCH", 422, {
      error: {
        code: "validation_error",
        message: "Validation failed",
        details: {
          fields: { full_name: ["is invalid"], date_of_birth: ["is invalid"] },
          field_codes: { full_name: ["too_long"], date_of_birth: ["too_young"] },
        },
        request_id: null,
      },
    });
    await fillAll(page);
    await cta(page).click();
    await expect(page.getByText("That’s too long.")).toBeVisible();
    await expect(page.getByText("You must be 16 or older to use SimpleFit.")).toBeVisible();
    await expect(fullName(page)).toBeFocused();
    // Nothing raw; nothing lost.
    await expect(page.getByText("validation_error")).toHaveCount(0);
    await expect(fullName(page)).toHaveValue("Alex Kowalski");
    expect(completions(api)).toEqual([]);
  });

  test("16 · completion fails: no navigation, no false success, Retry completes", async ({
    page,
  }) => {
    let failing = true;
    const api = await openWa5(page);
    await override(
      page,
      "/api/v1/me/account-profile/complete-registration",
      "POST",
      503,
      ERROR("service_unavailable"),
      () => failing,
    );
    await fillAll(page);
    await cta(page).click();
    await expect(page.getByText("We couldn’t save your details.")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(ROUTE);
    expect(registration(api).status).toBe("in_progress");
    await expect(fullName(page)).toHaveValue("Alex Kowalski");
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/production/wa5-failure.png", fullPage: true });
    failing = false;
    await page.getByRole("button", { name: "Retry" }).click();
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/role");
    // The retry repeated nothing already saved.
    expect(accountWrites(api).filter((request) => request.method === "PATCH")).toHaveLength(1);
  });

  test("rate limited or offline saves keep every value and send it again on Retry", async ({
    page,
  }) => {
    let limited = true;
    const api = await openWa5(page);
    await override(
      page,
      "/api/v1/me/account-profile",
      "PATCH",
      429,
      ERROR("rate_limited"),
      () => limited,
    );
    await fillAll(page);
    await cta(page).click();
    await expect(page.getByText("We couldn’t save your details.")).toBeVisible();
    await expect(dob(page)).toHaveValue("2000-05-17");
    await expect(terms(page)).toBeChecked();
    limited = false;
    api.failWrites(1);
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("We couldn’t save your details.")).toBeVisible();
    expect(registration(api).status).toBe("not_started");
    await page.getByRole("button", { name: "Retry" }).click();
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/role");
    expect(registration(api).status).toBe("complete");
  });

  test("saving: Continue reads Saving… and is busy; a second click sends nothing more", async ({
    page,
  }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const api = await openWa5(page);
    await page.route(
      (url) => url.pathname === "/api/v1/me/account-profile" && url.port !== "3100",
      async (route) => {
        if (route.request().method() === "PATCH") await held;
        await route.fallback();
      },
    );
    await fillAll(page);
    await cta(page).click();
    await expect(cta(page)).toHaveText("Saving…");
    await expect(cta(page)).toHaveAttribute("aria-busy", "true");
    await cta(page).click({ force: true });
    await page.keyboard.press("Enter");
    release();
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/role");
    expect(accountWrites(api).filter((request) => request.method === "PATCH")).toHaveLength(1);
    expect(completions(api)).toHaveLength(1);
  });
});

test.describe("13 · the date of birth is a calendar date in every time zone", () => {
  for (const timezoneId of ["Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
    test.describe(timezoneId, () => {
      test.use({ timezoneId });

      test(`${timezoneId}: sent and shown back as the same YYYY-MM-DD`, async ({ page }) => {
        const api = await openWa5(page);
        await dob(page).fill("2000-01-01");
        await cta(page).click();
        await expect(page.getByText("Enter your full name.")).toBeVisible();
        expect(accountWrites(api)[0]?.body).toEqual({ date_of_birth: "2000-01-01" });
        await page.reload();
        await expect(dob(page)).toHaveValue("2000-01-01");
        // Never in a URL.
        expect(page.url()).not.toContain("2000");
      });
    });
  }
});

test.describe("continuation (SF-45)", () => {
  for (const [query, path] of [
    ["?intent=coach", "/en/app/onboarding/coach"],
    ["", "/en/app/onboarding/role"],
    ["?returnTo=%2Fapp%2Fmessages", "/en/app/messages"],
    ["?returnTo=https%3A%2F%2Fevil.example%2Fapp", "/en/app/onboarding/role"],
    ["?returnTo=%2F%2Fevil.example", "/en/app/onboarding/role"],
  ] as const) {
    const label = {
      "?intent=coach": "19 · intent=coach keeps the Coach journey",
      "": "20 · no intent: role selection (WA6)",
      "?returnTo=%2Fapp%2Fmessages": "21 · a safe returnTo survives completion",
      "?returnTo=https%3A%2F%2Fevil.example%2Fapp": "22 · an external returnTo is dropped",
      "?returnTo=%2F%2Fevil.example": "22 · a protocol-relative returnTo is dropped",
    }[query];
    test(label, async ({ page }) => {
      const api = await openWa5(page, {}, query);
      await fillAll(page);
      await cta(page).click();
      await page.waitForURL((url) => url.pathname === path);
      if (query === "?intent=coach") {
        expect(new URL(page.url()).searchParams.get("intent")).toBe("coach");
      }
      expect(page.url()).not.toContain("evil.example");
      expect(registration(api).status).toBe("complete");
    });
  }

  test("23 · a completed registration is never reopened: WA5 continues, nothing written", async ({
    page,
  }) => {
    const api = await onboardingApi(page);
    const before = registration(api).completed_at;
    await page.goto(`${ROUTE}?intent=fighter`);
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/fighter");
    expect(accountWrites(api)).toEqual([]);
    expect(registration(api).completed_at).toBe(before);
  });

  test("24 · new document versions do not reopen a completed registration", async ({ page }) => {
    const api = await onboardingApi(page, {
      account: {
        full_name: "Alex Kowalski",
        date_of_birth: "2000-05-17",
        terms: "terms-v1",
        privacy: "privacy-v1",
        completed: true,
      },
      currentVersions: { terms: "terms-v2", privacy: "privacy-v2" },
    });
    await page.goto(ROUTE);
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/role");
    expect(registration(api).status).toBe("complete");
    expect(accountWrites(api)).toEqual([]);
  });

  test("25 · an older accepted version is not the current one: the visitor accepts the version in force", async ({
    page,
  }) => {
    const api = await openWa5(page, {
      account: {
        full_name: "Alex Kowalski",
        date_of_birth: "2000-05-17",
        terms: "terms-v1",
        privacy: "privacy-v1",
      },
      currentVersions: { terms: "terms-v2", privacy: "privacy-v1" },
    });
    await expect(terms(page)).not.toBeChecked();
    await expect(terms(page)).toBeEnabled();
    await expect(page.getByText("A new version is in force: accept it to continue.")).toBeVisible();
    await expect(privacy(page)).toBeChecked();
    await expect(privacy(page)).toBeDisabled();
    expect(await axeViolations(page)).toEqual([]);
    await terms(page).click();
    await cta(page).click();
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/role");
    expect(accountWrites(api)[0]?.body).toEqual({ accept_terms: true });
    expect(consents(api).terms.accepted_version).toBe("terms-v2");
  });

  test("25 · a version that comes into force while the form is open: completion is refused and the box reopens", async ({
    page,
  }) => {
    const api = await openWa5(page, {
      account: {
        full_name: "Alex Kowalski",
        date_of_birth: "2000-05-17",
        terms: "terms-v1",
        privacy: "privacy-v1",
      },
    });
    await expect(terms(page)).toBeDisabled();
    api.rollConsentVersions({ terms: "terms-v2", privacy: "privacy-v1" });
    await cta(page).click();
    await expect(page.getByText("Accept the Terms of Service to continue.")).toBeVisible();
    // Reloaded from the server: unchecked, enabled, explained.
    await expect(terms(page)).toBeEnabled();
    await expect(terms(page)).not.toBeChecked();
    expect(registration(api).status).toBe("in_progress");
    await terms(page).click();
    await cta(page).click();
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/role");
    expect(consents(api).terms.accepted_version).toBe("terms-v2");
  });

  test("26 · withdrawing product news is saved and completion stands", async ({ page }) => {
    const api = await openWa5(page, {
      account: {
        full_name: "Alex Kowalski",
        date_of_birth: "2000-05-17",
        terms: "terms-v1",
        privacy: "privacy-v1",
        product_news: true,
      },
    });
    await expect(news(page)).toBeChecked();
    await news(page).click();
    await cta(page).click();
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/role");
    expect(accountWrites(api)[0]?.body).toEqual({ product_news: false });
    expect(registration(api).status).toBe("complete");
    expect(
      (api.account() as { product_news: { subscribed: boolean } }).product_news.subscribed,
    ).toBe(false);
  });

  test("30 · completed, but the resolver fails: registration stays complete and Retry continues", async ({
    page,
  }) => {
    const api = await openWa5(page, {}, "?intent=fighter");
    await fillAll(page);
    api.failEntry(10);
    await cta(page).click();
    const alert = page.getByRole("alert");
    await expect(alert.getByRole("button")).toBeVisible();
    expect(registration(api).status).toBe("complete");
    // Never told that registration failed.
    await expect(page.getByText("We couldn’t save your details.")).toHaveCount(0);
    api.failEntry(0);
    await alert.getByRole("button").click();
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/fighter");
    expect(completions(api)).toHaveLength(1);
    expect(accountWrites(api).filter((request) => request.method === "PATCH")).toHaveLength(1);
  });
});

test.describe("concurrency and session", () => {
  test("27 · completed in another tab: this tab continues on focus without writing", async ({
    context,
  }) => {
    const api = await onboardingApi(context, { accountComplete: false });
    const [first, second] = [await context.newPage(), await context.newPage()];
    for (const tab of [first, second]) {
      await tab.goto(`${ROUTE}?intent=fighter`);
      await expect(heading(tab)).toBeVisible();
    }
    await second.getByLabel("Full name").fill("Someone else");
    await fillAll(first);
    await cta(first).click();
    await first.waitForURL((url) => url.pathname === "/en/app/onboarding/fighter");
    const writesBefore = accountWrites(api).length;
    await second.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await second.waitForURL((url) => url.pathname === "/en/app/onboarding/fighter");
    expect(new URL(second.url()).searchParams.get("intent")).toBe("fighter");
    expect(accountWrites(api)).toHaveLength(writesBefore);
    expect(completions(api)).toHaveLength(1);
    expect((api.account() as { full_name: string }).full_name).toBe("Alex Kowalski");
  });

  test("28 · a newer server state updates untouched fields and keeps this tab's edits", async ({
    page,
  }) => {
    const api = await openWa5(page, { account: { full_name: "Alex" } });
    await fullName(page).fill("Alex Kowalski");
    api.externalAccountUpdate({
      full_name: "Alexander",
      date_of_birth: "1999-02-03",
      product_news: true,
    });
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await expect(news(page)).toBeChecked();
    await expect(dob(page)).toHaveValue("1999-02-03");
    await expect(fullName(page)).toHaveValue("Alex Kowalski");
    await terms(page).click();
    await privacy(page).click();
    await cta(page).click();
    await page.waitForURL((url) => url.pathname === "/en/app/onboarding/role");
    // Only this tab's edits: never the other client's values sent back.
    expect(accountWrites(api)[0]?.body).toEqual({
      full_name: "Alex Kowalski",
      accept_terms: true,
      accept_privacy: true,
    });
    expect(api.account()).toMatchObject({
      full_name: "Alex Kowalski",
      date_of_birth: "1999-02-03",
      product_news: { subscribed: true },
    });
  });

  test("29 · the session ends mid-form: sign-in with the journey kept, nothing recorded", async ({
    page,
  }) => {
    const api = await openWa5(page, {}, "?intent=coach");
    await fillAll(page);
    api.expire();
    await cta(page).click();
    await page.waitForURL((url) => url.pathname === "/en/login");
    expect(new URL(page.url()).searchParams.get("intent")).toBe("coach");
    expect(registration(api).status).toBe("not_started");
    expect(consents(api).terms.accepted).toBe(false);
  });

  test("31 · no consent is ever recorded without its tick; an untick sends nothing", async ({
    page,
  }) => {
    const api = await openWa5(page);
    await terms(page).click();
    await terms(page).click();
    await fullName(page).fill("Alex Kowalski");
    await dob(page).fill("2000-05-17");
    await cta(page).click();
    await expect(page.getByText("Accept the Terms of Service to continue.")).toBeVisible();
    for (const request of accountWrites(api)) {
      expect(request.body).not.toHaveProperty("accept_terms");
      expect(request.body).not.toHaveProperty("accept_privacy");
      expect(request.body).not.toHaveProperty("product_news");
    }
    expect(consents(api).terms.accepted).toBe(false);
    expect(consents(api).privacy.accepted).toBe(false);
    expect(completions(api)).toEqual([]);
  });
});

test("keyboard: Tab through the form, Space ticks, Enter on Continue completes", async ({
  page,
}) => {
  const api = await openWa5(page);
  await fullName(page).focus();
  await page.keyboard.type("Alex Kowalski");
  await dob(page).fill("2000-05-17");
  await dob(page).focus();
  for (
    let i = 0;
    i < 4 && !(await terms(page).evaluate((el) => el === document.activeElement));
    i++
  )
    await page.keyboard.press("Tab");
  await expect(terms(page)).toBeFocused();
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  await expect(privacy(page)).toBeFocused();
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  await expect(news(page)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cta(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/role");
  expect(registration(api).status).toBe("complete");
});

test("18 · a new visitor end to end: /signup?intent=fighter → email → code → WA5 → WF0 → WF1 → WF6", async ({
  page,
}) => {
  let api!: OnboardingApi;
  await open(
    page,
    "/en/signup?intent=fighter",
    page.getByRole("heading", { level: 1 }),
    async (page) => {
      api = await onboardingApi(page, { signedOut: true });
    },
  );
  await page.getByRole("link", { name: "Continue with Email" }).click();
  await page.waitForURL((url) => url.pathname === "/en/signup/account");
  await page.getByRole("textbox", { name: "Email" }).fill("fighter@example.com");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/en/signup/verify");
  await page.locator('[data-slot="code-input"]').pressSequentially("482910");

  // SF-45: account registration first, the Fighter journey riding along.
  await page.waitForURL((url) => url.pathname === ROUTE);
  expect(new URL(page.url()).searchParams.get("intent")).toBe("fighter");
  await expect(heading(page)).toBeVisible();
  // The pre-auth WA3 consents were never sent: WA5 starts unchecked.
  await expect(terms(page)).not.toBeChecked();
  await expect(privacy(page)).not.toBeChecked();
  await fillAll(page);
  await cta(page).click();

  // WF0 → WF1 → WF6 (SF-38): the Fighter registration, not WA5's to decide.
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/fighter");
  await expect(page.getByRole("heading", { level: 1, name: "Your fighter profile" })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Alex K.");
  await page.getByRole("textbox", { name: "Username" }).fill("alex_k");
  await page.getByRole("combobox", { name: "Country" }).click();
  await page.getByRole("combobox", { name: "Search countries" }).fill("Poland");
  await page.keyboard.press("Enter");
  await page.getByLabel("City").fill("Warsaw");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your boxing profile" })).toBeVisible();
  await page.getByText("Competitive amateur").click();
  await page.getByText("Orthodox").click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "You’re in, Alex." })).toBeVisible();

  // The writes, in order: the registration, its completion, then the Fighter profile.
  expect(
    api.requests
      .filter((request) => request.method !== "GET" && request.path !== "/api/auth/session/refresh")
      .map((request) => `${request.method} ${request.path}`),
  ).toEqual([
    "POST /api/auth/email/registrations",
    "POST /api/auth/email/registrations/verify",
    "PATCH /api/v1/me/account-profile",
    "POST /api/v1/me/account-profile/complete-registration",
    "PATCH /api/v1/me/fighter-profile",
    "PATCH /api/v1/me/fighter-profile",
    "POST /api/v1/me/fighter-profile/complete-onboarding",
  ]);
  // The account's full name never became the Fighter's display name.
  expect(api.state()?.display_name).toBe("Alex K.");
  expect((api.account() as { full_name: string }).full_name).toBe("Alex Kowalski");
});

// ── Geometry (Claude Design V78 WebAccountBasics, 1440 × 980) ──

/** The WA5 frame: the 72 px header and the three columns on the 64 px gutters. */
async function expectFrame(page: Page, width: number) {
  await expectBox(page.locator("[data-account-registration]"), { x: 0, y: 0, w: width });
  await expectBox(page.locator("header").first(), { x: 0, y: 0, w: width, h: 72 });
  await expectBox(page.locator("header a").first(), { x: 56, h: 30 });
  const signOut = await box(page.getByRole("button", { name: "Sign out" }));
  expect(Math.abs(signOut.x + signOut.width - (width - 56))).toBeLessThanOrEqual(1);
  await expectBox(page.locator("[data-step-nav]"), { x: 64, y: 120, w: 250 });
  const formWidth = width - 128 - 250 - 320 - 80;
  await expectBox(page.locator("[data-onboarding-grid] > div").first(), {
    x: 354,
    y: 120,
    w: formWidth,
  });
  await expectBox(page.locator("[data-onboarding-grid] > aside"), {
    x: width - 64 - 320,
    y: 120,
    w: 320,
  });
  return formWidth;
}

test.describe("geometry at the artboard size (1440 × 980)", () => {
  test("WA5: frame, step card, heading, fields, agreements, CTA and aside on the artboard", async ({
    page,
  }) => {
    await openWa5(page);
    await page.evaluate(() => document.fonts.ready);
    expect(await expectFrame(page, 1440)).toBe(662);
    await expect(page.locator("header").getByText("Account setup")).toBeVisible();
    // Eyebrow, the 32 px heading 8 px under it.
    await expectBox(page.getByText("Account basics · needed once"), { x: 354, y: 120 });
    await expectBox(heading(page), { x: 354, y: 142, h: 40 });
    expect(await heading(page).evaluate((el) => getComputedStyle(el).fontSize)).toBe("32px");
    // Step rows: 40 px, 4 px apart.
    const rows = page.locator("[data-step-nav] li > *");
    const first = await box(rows.first());
    for (let index = 0; index < 3; index++) {
      await expectBox(rows.nth(index), { x: 83, y: first.y + index * 44, w: 212, h: 40 });
    }
    // Name and date of birth split the column with a 14 px gap; 44 px high, at the artboard's y.
    await expectBox(fullName(page), { x: 354, y: 279, w: 324, h: 44 });
    await expectBox(dob(page), { x: 692, y: 279, w: 324, h: 44 });
    // Further down, the type roles' line heights (caption 18 for the artboard's
    // 16.8, label 14 for 13) add up to a few px: within 4 px of the artboard.
    const near = async (locator: Locator, y: number) =>
      expect(Math.abs((await box(locator)).y - y)).toBeLessThanOrEqual(4);
    await near(page.locator("[data-agreements]"), 367.8);
    await near(terms(page), 415.8);
    await near(news(page), 500.8);
    await near(cta(page), 608.8);
    await near(page.locator("aside section").nth(1), 380);
    // The agreements card across the column (radius 20 = `2xl`); 22 px boxes.
    const agreements = page.locator("[data-agreements]");
    await expectBox(agreements, { x: 354, w: 662 });
    expect(await agreements.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe(
      "20px",
    );
    for (const control of [terms(page), privacy(page), news(page)]) {
      await expectBox(control, { x: 354 + 19, w: 22, h: 22 });
    }
    // Continue: 48 px, at least 120 wide, on the column's right edge, below the agreements.
    const action = await box(cta(page));
    expect(Math.abs(action.height - 48)).toBeLessThanOrEqual(1);
    expect(action.width).toBeGreaterThanOrEqual(120);
    expect(Math.abs(action.x + action.width - 1016)).toBeLessThanOrEqual(1);
    const card = await box(agreements);
    expect(action.y).toBeGreaterThan(card.y + card.height);
    // Aside: the two cards (radius 22 = `3xl`, 24 → §8.1) and the olive note.
    const why = page.locator("section", { has: page.getByRole("heading", { name: "Why we ask" }) });
    await expectBox(why, { x: 1056, y: 120, w: 320 });
    expect(await why.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("22px");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // The whole composition fits the artboard: nothing below the fold at 1440 × 980.
    await expect(cta(page)).toBeInViewport();
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/production/wa5-1440x980.png", fullPage: true });
  });
});

for (const [width, height] of [
  [1280, 720],
  [1366, 768],
  [1440, 980],
  [1512, 982],
  [1728, 1117],
  [1920, 1080],
] as const) {
  test.describe(`${width} × ${height}`, () => {
    test.use({ viewport: { width, height } });

    test("WA5: the same three columns, full-bleed, Continue reachable, no horizontal scroll", async ({
      page,
    }) => {
      await openWa5(page);
      const formWidth = await expectFrame(page, width);
      const half = (formWidth - 14) / 2;
      await expectBox(fullName(page), { x: 354, w: half, h: 44 });
      await expectBox(dob(page), { x: 354 + half + 14, w: half, h: 44 });
      const action = await box(cta(page));
      expect(Math.abs(action.x + action.width - (354 + formWidth))).toBeLessThanOrEqual(1);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await cta(page).scrollIntoViewIfNeeded();
      await expect(cta(page)).toBeInViewport();
      await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
      await page.screenshot({
        path: `test-results/production/wa5-${width}x${height}.png`,
        fullPage: true,
      });
    });
  });
}

test.describe("narrow (390 × 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("WA5 stacks into one column: nothing clipped, no horizontal scroll, Continue reachable", async ({
    page,
  }) => {
    await openWa5(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const field = await box(fullName(page));
    expect(field.x).toBeGreaterThanOrEqual(0);
    expect(field.x + field.width).toBeLessThanOrEqual(390);
    await cta(page).scrollIntoViewIfNeeded();
    await expect(cta(page)).toBeInViewport();
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/production/wa5-390x844.png", fullPage: true });
  });
});
