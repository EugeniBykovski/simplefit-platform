import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { expect, type Page, test } from "@playwright/test";

/*
 * SF-30: a new Fighter, end to end, against the real API and PostgreSQL
 * (playwright.real-api.config.ts). Email registration → WA4 code → WA5
 * account registration → WF0/WF1 Fighter onboarding → WF6 → Home and the
 * FRW2 tour → sign out → email sign-in → Home again, with nothing re-asked.
 *
 * The emailed code is read the way a person would read it from their inbox,
 * from the API's queued email (`mix e2e.email_code`, dev/test only). The
 * Google and Apple scripts are blocked: no live provider is contacted.
 */

const API_URL = process.env.E2E_REAL_API_URL;
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";

test.skip(!API_URL, "E2E_REAL_API_URL is not set: the real-backend journey needs a running API");

/** Fails closed: only a database named for end-to-end runs is ever written to. */
function disposableDatabase(): string {
  const name = new URL(DATABASE_URL).pathname.slice(1);
  if (!/e2e/.test(name) || name === "simple_fit_dev") {
    throw new Error("E2E_API_DATABASE_URL must name a disposable end-to-end database");
  }
  return DATABASE_URL;
}

function api(args: string[]): string {
  return execFileSync("mix", args, {
    cwd: API_DIR,
    env: { ...process.env, MIX_ENV: "dev", DATABASE_URL: disposableDatabase() },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

/** The latest code emailed to `address`. */
function emailedCode(address: string): string {
  const code = api(["e2e.email_code", address])
    .split("\n")
    .find((line) => /^\d{6}$/.test(line.trim()));
  if (!code) throw new Error("no code was emailed");
  return code.trim();
}

/**
 * Ends the per-address request window, as the API's own test suite does
 * (`reset_rate_limits/0`): the test's minute is shorter than the limit's.
 */
function resetRateLimits() {
  execFileSync("psql", [disposableDatabase(), "-qc", "DELETE FROM auth_rate_limits"], {
    stdio: "ignore",
  });
}

const heading = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });
const codeInput = (page: Page) => page.locator('[data-slot="code-input"]');
const dialog = (page: Page) => page.getByRole("dialog");

test("a new Fighter: registration, onboarding, Home, sign out and back in", async ({
  page,
}, testInfo) => {
  const run = `${testInfo.project.name.replace(/\W/g, "")}${Date.now().toString(36)}`;
  const email = `e2e-${run}@example.com`;
  const username = `e2e_${Date.now().toString(36)}`;

  // No live provider: their scripts never load.
  await page.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());

  // WA3 → WA4: the email registration with the Fighter intent.
  await page.goto("/en/signup?intent=fighter");
  await page.getByRole("link", { name: "Continue with Email" }).click();
  await page.waitForURL((url) => url.pathname === "/en/signup/account");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/en/signup/verify");
  await codeInput(page).pressSequentially(emailedCode(email));

  // WA5: the shared account registration first, the Fighter intent kept.
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/account");
  expect(new URL(page.url()).searchParams.get("intent")).toBe("fighter");
  await expect(heading(page, "Before you start")).toBeVisible();
  await page.getByLabel("Full name").fill("Alex Kowalski");
  await page.getByLabel("Date of birth").fill("2000-05-17");
  await page.getByRole("checkbox", { name: /Terms of Service/ }).click();
  await page.getByRole("checkbox", { name: /Privacy Policy/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // WF0: Profile basics.
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/fighter");
  await expect(heading(page, "Your fighter profile")).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Alex K.");
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByRole("combobox", { name: "Country" }).click();
  await page.getByRole("combobox", { name: "Search countries" }).fill("Poland");
  await page.keyboard.press("Enter");
  await page.getByLabel("City").fill("Warsaw");
  await page.getByRole("button", { name: "Continue" }).click();

  // A reload mid-journey resumes from what the API saved.
  await expect(heading(page, "Your boxing profile")).toBeVisible();
  await page.reload();
  await expect(heading(page, "Your boxing profile")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("textbox", { name: "Username" })).toHaveValue(username);
  await page.getByRole("button", { name: "Continue" }).click();

  // WF1: the boxing profile, then completion (WF6).
  await page.getByText("Competitive amateur").click();
  await page.getByText("Orthodox").click();
  await page.getByLabel("Amateur bouts · optional").fill("14");
  await page.getByText("Improve technique").click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(heading(page, "You’re in, Alex.")).toBeVisible();

  // Home through the entry resolver: the first run offers the tour.
  await page.getByRole("link", { name: "Go to my home" }).click();
  await page.waitForURL((url) => url.pathname === "/en/app/home");
  await expect(heading(page, "Welcome to SimpleFit, Alex K.")).toBeVisible();
  await page.getByRole("button", { name: "Take the tour", exact: true }).click();
  for (let step = 1; step < 9; step++) {
    await expect(dialog(page).getByText(`Tour · ${step} of 9`, { exact: true })).toBeVisible();
    await dialog(page).getByRole("button", { name: "Next", exact: true }).click();
  }
  await dialog(page).getByRole("button", { name: "Finish", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Back to my checklist", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);

  // Persisted: a reload is a normal Home, the tour only a replay.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^Good (morning|afternoon|evening), Alex K\.$/,
  );

  // Sign out (on narrow screens, from the navigation sheet): the session
  // ends; the protected route asks to sign in.
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Sign out" }).locator("visible=true").first().click();
  await page.waitForURL(/\/en\/login$/);
  // The signed-out redirect replaces this navigation (WebKit reports that
  // as an interrupted navigation); where the browser ends up is the check.
  await page.goto("/en/app/home").catch((error: Error) => {
    if (!/interrupted by another navigation/.test(error.message)) throw error;
  });
  await page.waitForURL(/\/en\/login/);
  await expect(page.getByRole("heading", { level: 1, name: /Alex K\./ })).toHaveCount(0);

  // Email sign-in: straight to Home, nothing asked again.
  resetRateLimits();
  await page.goto("/en/login");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await page.waitForURL((url) => url.pathname === "/en/login/code");
  await codeInput(page).pressSequentially(emailedCode(email));
  await page.waitForURL((url) => url.pathname === "/en/app/home");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^Good (morning|afternoon|evening), Alex K\.$/,
  );
  resetRateLimits();
});
