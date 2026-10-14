import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { expect, type Page, test } from "@playwright/test";

/*
 * SF-52: a new Coach, end to end, against the real API and PostgreSQL
 * (playwright.real-api.config.ts). Email registration with the Coach intent →
 * WA4 code → WA5 account registration → WCR1 / WCR2 Coach onboarding (the
 * account name only suggested, a reload resuming from the API) → WCR7 → the
 * explicit Coach context choice → Coach home → sign out → email sign-in →
 * Coach home again, with nothing re-asked.
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

/** The sidebar's context switcher (SF-54), opened; on narrow projects it is in the navigation sheet. */
async function openSwitcher(page: Page, name: RegExp) {
  const sheet = page.getByRole("button", { name: "Open navigation" });
  if (await sheet.isVisible()) await sheet.click();
  await page.getByRole("button", { name }).locator("visible=true").first().click();
  return page.getByRole("menu");
}
const codeInput = (page: Page) => page.locator('[data-slot="code-input"]');

test("a new Coach: registration, Coach onboarding, Coach home, sign out and back in", async ({
  page,
}, testInfo) => {
  const run = `${testInfo.project.name.replace(/\W/g, "")}${Date.now().toString(36)}`;
  const email = `e2e-coach-${run}@example.com`;

  await page.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());

  // WA3 → WA4: the email registration with the Coach intent.
  await page.goto("/en/signup?intent=coach");
  await page.getByRole("link", { name: "Continue with Email" }).click();
  await page.waitForURL((url) => url.pathname === "/en/signup/account");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/en/signup/verify");
  await codeInput(page).pressSequentially(emailedCode(email));

  // WA5 first, the Coach intent kept.
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/account");
  expect(new URL(page.url()).searchParams.get("intent")).toBe("coach");
  await page.getByLabel("Full name").fill("Alex Kowalski");
  await page.getByLabel("Date of birth").fill("2000-05-17");
  await page.getByRole("checkbox", { name: /Terms of Service/ }).click();
  await page.getByRole("checkbox", { name: /Privacy Policy/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // WCR1: the account name is only a suggestion; the coach name is the Coach's own.
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/coach");
  await expect(heading(page, "Your coach profile")).toBeVisible();
  const name = page.getByRole("textbox", { name: "Coach name" });
  await expect(name).toHaveValue("Alex Kowalski");
  await name.fill("Coach Alex");
  await page.getByRole("combobox", { name: "Country" }).click();
  await page.getByRole("combobox", { name: "Search countries" }).fill("Poland");
  await page.keyboard.press("Enter");
  await page.getByLabel("City").fill("Warsaw");
  await page.getByText("Polski", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // WCR2, and a reload resumes from what the API saved.
  await expect(heading(page, "How do you coach?")).toBeVisible();
  await page.reload();
  await expect(heading(page, "How do you coach?")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(name).toHaveValue("Coach Alex");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Personal Training").click();
  await page.getByText("Amateur", { exact: true }).click();
  await page.getByRole("button", { name: "Finish" }).click();

  // WCR7 after the API completed onboarding; truthful about Coach home.
  await expect(heading(page, "Your coach profile is ready.")).toBeVisible();
  await expect(page.getByText("Coach tools are not available yet.")).toBeVisible();
  await page.getByRole("button", { name: "Continue to coach home" }).click();
  await page.waitForURL((url) => url.pathname === "/en/app/coach");
  // SF-54: the real Coach dashboard with the saved profile, no placeholder.
  await expect(heading(page, "Welcome, Coach Alex")).toBeVisible();
  await expect(page.getByRole("region", { name: "Your coach profile" })).toContainText(
    "Personal Training",
  );
  await expect(page.getByText("Planned")).toHaveCount(0);

  // The Fighter area is not a Coach's: the gate sends them back to Coach home.
  await page.goto("/en/app/home");
  await page.waitForURL((url) => url.pathname === "/en/app/coach");
  await expect(heading(page, "Welcome, Coach Alex")).toBeVisible();

  // SF-54: from the switcher, set up a Fighter profile (by intent, nothing recorded)…
  let menu = await openSwitcher(page, /Coach Alex, Coach\. Switch profile/);
  await menu.getByRole("menuitem", { name: /Set up a fighter profile/ }).click();
  await page.waitForURL((url) => url.pathname === "/en/app/onboarding/fighter");
  await page.getByLabel("Name", { exact: true }).fill("Alex K.");
  await page.getByRole("textbox", { name: "Username" }).fill(`c${Date.now().toString(36)}`);
  await page.getByRole("combobox", { name: "Country" }).click();
  await page.getByRole("combobox", { name: "Search countries" }).fill("Poland");
  await page.keyboard.press("Enter");
  await page.getByLabel("City").fill("Warsaw");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Competitive amateur").click();
  await page.getByText("Orthodox").click();
  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByRole("link", { name: "Go to my home" }).click();
  await page.waitForURL((url) => url.pathname === "/en/app/home");
  // The home (its first run) is on screen before the shell is used.
  await expect(heading(page, "Welcome to SimpleFit, Alex K.")).toBeVisible();

  // …then switch back to Coach: the choice is recorded by the API and survives sign-in.
  menu = await openSwitcher(page, /Alex K\., Fighter\. Switch profile/);
  await menu.getByRole("menuitemradio", { name: /Coach/ }).click();
  await page.waitForURL((url) => url.pathname === "/en/app/coach");
  await expect(heading(page, "Welcome, Coach Alex")).toBeVisible();
  // Both workspaces open for one account, whatever was chosen last. Each page
  // settles before the next navigation, as a person's would: a full load
  // aborted mid-refresh is a separate session concern (SF-28).
  await page.goto("/en/app/home");
  await expect(heading(page, "Welcome to SimpleFit, Alex K.")).toBeVisible();
  await page.goto("/en/app/coach");
  await expect(heading(page, "Welcome, Coach Alex")).toBeVisible();

  // Sign out, then email sign-in: straight to Coach home, nothing asked again.
  const sheet = page.getByRole("button", { name: "Open navigation" });
  if (await sheet.isVisible()) await sheet.click();
  await page.getByRole("button", { name: "Sign out" }).locator("visible=true").first().click();
  await page.waitForURL(/\/en\/login$/);
  resetRateLimits();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await page.waitForURL((url) => url.pathname === "/en/login/code");
  await codeInput(page).pressSequentially(emailedCode(email));
  await page.waitForURL((url) => url.pathname === "/en/app/coach");
  resetRateLimits();
});
