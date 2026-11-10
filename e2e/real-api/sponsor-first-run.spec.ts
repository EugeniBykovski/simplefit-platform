import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { expect, type Browser, type BrowserContext, type Page, test } from "@playwright/test";

/*
 * SF-119: SRW1 (welcome) and SRW2 (tour) on the production build against a real
 * simplefit-api and PostgreSQL (playwright.real-api.config.ts); nothing in the browser
 * is mocked. Every outcome is checked in `sponsor_first_runs` (the disposable
 * database), never assumed from the UI.
 *
 * Runs after simplefit-api's `test/standalone/sponsor_entry_http_e2e_test.exs` on the
 * same database (operator-approved organizations; `E2E_SPONSOR_HANDOFF`: emails and
 * ids, never a token). Extra organizations and memberships come from
 * `mix sponsors.fixture` (authority `local_fixture`, dev only): the product has no
 * invitation route (D-SA12).
 */

const require = createRequire(import.meta.url);
const API_URL = process.env.E2E_REAL_API_URL ?? "";
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";
const HANDOFF = process.env.E2E_SPONSOR_HANDOFF ?? "";

test.skip(!API_URL || !HANDOFF, "needs a running API and the standalone leg's E2E_SPONSOR_HANDOFF");
test.describe.configure({ mode: "serial" });

type Handoff = {
  applicant: { email: string; user_id: string };
  other: { email: string; user_id: string };
  owned: string;
  revoked: string;
  suspended: string;
};
const handoff = (): Handoff => JSON.parse(readFileSync(HANDOFF, "utf8")) as Handoff;

function disposableDatabase(): string {
  const name = new URL(DATABASE_URL).pathname.slice(1);
  if (!/e2e/.test(name) || name === "simple_fit_dev") {
    throw new Error("E2E_API_DATABASE_URL must name a disposable end-to-end database");
  }
  if (new URL(API_URL).port === "4000") throw new Error("never the development API on 4000");
  return DATABASE_URL;
}

const sql = (query: string) =>
  execFileSync("psql", [disposableDatabase(), "-Atqc", query], { encoding: "utf8" }).trim();

const mix = (args: string[]) =>
  execFileSync("mix", args, {
    cwd: API_DIR,
    env: { ...process.env, MIX_ENV: "dev", DATABASE_URL: disposableDatabase() },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

function emailedCode(address: string): string {
  const code = mix(["e2e.email_code", address])
    .split("\n")
    .find((line) => /^\d{6}$/.test(line.trim()));
  if (!code) throw new Error("no code was emailed");
  return code.trim();
}

const resetRateLimits = () => sql("DELETE FROM auth_rate_limits; DELETE FROM rate_limit_events");

/** The kept state of one member's first run in one organization. */
const kept = (org: string, user: string) =>
  sql(
    `SELECT CASE WHEN completed_at IS NOT NULL THEN 'completed' WHEN dismissed_at IS NOT NULL THEN 'dismissed' ELSE 'in_progress' END FROM sponsor_first_runs WHERE organization_id = '${org}' AND user_id = '${user}'`,
  ) || "none";

const rowCount = (org: string, user: string) =>
  sql(
    `SELECT count(*) FROM sponsor_first_runs WHERE organization_id = '${org}' AND user_id = '${user}'`,
  );

/** A new organization (dev fixture) owned by `owner`; returns its id. */
function provision(owner: string, name: string): string {
  const out = mix([
    "sponsors.fixture",
    "provision",
    "--owner-user-id",
    owner,
    "--legal-name",
    `${name} Sp. z o.o.`,
    "--display-name",
    name,
    "--country",
    "PL",
    "--contact-name",
    "Ola Nowak",
    "--contact-email",
    "ola@corner.example",
  ]);
  return /organization ([0-9a-f-]{36})/.exec(out)?.[1] ?? "";
}

function addMember(org: string, user: string): string {
  const out = mix([
    "sponsors.fixture",
    "add-member",
    "--organization-id",
    org,
    "--user-id",
    user,
    "--role",
    "member",
  ]);
  return /membership ([0-9a-f-]{36}) is active/.exec(out)?.[1] ?? "";
}

async function context(browser: Browser, width = 1440, height = 900) {
  const created = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    viewport: { width, height },
  });
  await created.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());
  return created;
}

/** Signs in on `/sponsor/login` with the emailed code and lands on `path`. */
async function signIn(page: Page, email: string, path: string, locale = "en") {
  resetRateLimits();
  await page.goto(`/${locale}/sponsor/login?returnTo=${encodeURIComponent(path)}`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((url) => url.pathname.endsWith("/login/code"));
  await page.locator('[data-slot="code-input"]').pressSequentially(emailedCode(email));
  await page.waitForURL((url) => url.pathname === `/${locale}${path}`);
}

async function axe(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  return page.evaluate(async () => {
    const { violations } = await (
      window as unknown as {
        axe: {
          run: (
            context: Element,
            options: object,
          ) => Promise<{ violations: { id: string; nodes: unknown[] }[] }>;
        };
      }
    ).axe.run(document.body, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    });
    return violations.map((violation) => `${violation.id} (${violation.nodes.length})`);
  });
}

const dashboard = (org: string) => `/sponsor/${org}/dashboard`;
const welcome = (page: Page) => page.locator("[data-tour-target=sponsor-welcome]");
const only = () => test.skip(test.info().project.name !== "chromium-1440", "one journey per run");
const state: { corner: string; extra: string } = { corner: "", extra: "" };

test("A/J/C: the owner's first run: welcome, six steps, finish; refresh and another device don't replay it", async ({
  browser,
}) => {
  only();
  const h = handoff();
  const ctx = await context(browser);
  const page = await ctx.newPage();
  const writes: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().startsWith(API_URL) &&
      request.method() === "POST" &&
      request.url().includes("first-run")
    )
      writes.push(new URL(request.url()).pathname.split("/").pop() ?? "");
  });
  await signIn(page, h.applicant.email, dashboard(h.owned));
  await expect(welcome(page)).toBeVisible();
  expect(kept(h.owned, h.applicant.user_id)).toBe("none");
  expect(await axe(page)).toEqual([]);

  // J: refresh during SRW2 offers to continue; nothing reopens on its own.
  await welcome(page).getByRole("button", { name: "Take the tour" }).click();
  const tour = page.getByRole("dialog");
  await expect(tour.getByText("Tour · 1 of 6").first()).toBeVisible();
  expect(kept(h.owned, h.applicant.user_id)).toBe("in_progress");
  await page.reload();
  await expect(welcome(page).getByRole("button", { name: "Continue the tour" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The six steps, on real targets; the URL never leaves the overview (H).
  await welcome(page).getByRole("button", { name: "Continue the tour" }).click();
  for (const title of ["Start here", "Overview", "Application", "Organization", "Members"]) {
    await expect(tour.getByRole("heading", { name: title })).toBeVisible();
    await tour.getByRole("button", { name: "Next" }).click();
  }
  await expect(tour.getByRole("heading", { name: "What isn’t here yet" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await tour.getByRole("button", { name: "Finish" }).click();
  await expect(tour.getByRole("heading", { name: "You know your way around" })).toBeVisible();
  expect(kept(h.owned, h.applicant.user_id)).toBe("completed");
  await tour.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Tour finished")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(`/en${dashboard(h.owned)}`);
  expect(writes).toEqual(["start", "start", "complete"]);

  // Refresh: no replay.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);
  await ctx.close();

  // C: another device (an independent browser context and session).
  const other = await context(browser);
  const second = await other.newPage();
  await signIn(second, h.applicant.email, dashboard(h.owned));
  await expect(second.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await expect(welcome(second)).toHaveCount(0);
  expect(rowCount(h.owned, h.applicant.user_id)).toBe("1");
  await other.close();
});

test("D/B/F: another organization starts fresh for the same user; dismissal is kept there only", async ({
  browser,
}) => {
  only();
  const h = handoff();
  state.corner = provision(h.other.user_id, "Corner Club");
  addMember(state.corner, h.applicant.user_id);

  const ctx = await context(browser);
  const page = await ctx.newPage();
  await signIn(page, h.applicant.email, dashboard(state.corner));
  await expect(welcome(page)).toBeVisible();
  // F: a plain member: the Organization step doesn't name the business contact.
  await welcome(page).getByRole("button", { name: "Take the tour" }).click();
  const tour = page.getByRole("dialog");
  for (let i = 0; i < 3; i += 1) await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour.getByText("Your company profile. It’s read-only for now.")).toBeVisible();
  await expect(tour.getByText(/business contact/)).toHaveCount(0);

  // B: End tour, confirmed: dismissed, kept, said once.
  await tour.getByRole("button", { name: "End tour" }).click();
  await tour.getByRole("button", { name: "End tour" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Introduction dismissed")).toBeVisible();
  expect(kept(state.corner, h.applicant.user_id)).toBe("dismissed");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);

  // The first organization keeps its own outcome.
  expect(kept(h.owned, h.applicant.user_id)).toBe("completed");
  await page.goto(`/en${dashboard(h.owned)}`);
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);

  // A suspended organization offers no introduction.
  await page.goto(`/en${dashboard(h.suspended)}`);
  await expect(page.getByText("This organization is suspended.")).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);
  await ctx.close();
});

test("E: a sign-out in another tab ends the open tour; the next account sees only its own", async ({
  browser,
}) => {
  only();
  const h = handoff();
  const ctx: BrowserContext = await context(browser);
  const page = await ctx.newPage();
  await signIn(page, h.other.email, dashboard(h.revoked));
  await welcome(page).getByRole("button", { name: "Take the tour" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(kept(h.revoked, h.other.user_id)).toBe("in_progress");

  const tab = await ctx.newPage();
  await tab.goto(`/en${dashboard(h.revoked)}`);
  await tab.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByText("Northside Agency")).toHaveCount(0);

  await signIn(page, h.applicant.email, dashboard(h.owned));
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await expect(page.getByText("Northside Agency")).toHaveCount(0);
  await expect(welcome(page)).toHaveCount(0);
  // The first account's tour stayed exactly as it was: started, not ended by anyone else.
  expect(kept(h.revoked, h.other.user_id)).toBe("in_progress");
  await ctx.close();
});

test("G: a membership revoked mid-tour: Finish records nothing and the portal shows not available", async ({
  browser,
}) => {
  only();
  const h = handoff();
  state.extra = provision(h.other.user_id, "Ringside Two");
  const membership = addMember(state.extra, h.applicant.user_id);
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await signIn(page, h.applicant.email, dashboard(state.extra));
  await welcome(page).getByRole("button", { name: "Take the tour" }).click();
  const tour = page.getByRole("dialog");
  for (let i = 0; i < 5; i += 1) await tour.getByRole("button", { name: "Next" }).click();

  mix(["sponsors.fixture", "revoke-membership", "--membership-id", membership, "--reason", "e2e"]);
  await tour.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("We can’t find that page")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(kept(state.extra, h.applicant.user_id)).toBe("in_progress");
  await ctx.close();
});

test("I/K: every locale welcomes in its own language, fits 390 and docks the tour", async ({
  browser,
}) => {
  only();
  const h = handoff();
  const fresh = provision(h.applicant.user_id, "Locale Lab");
  const ctx = await context(browser, 390, 844);
  const page = await ctx.newPage();
  await signIn(page, h.applicant.email, dashboard(fresh));
  const titles = new Set<string>();
  for (const locale of ["en", "ru", "pl", "de", "uk", "es", "es-MX", "fr"]) {
    await page.goto(`/${locale}${dashboard(fresh)}`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    const heading = welcome(page).getByRole("heading", { level: 2 });
    await expect(heading).toBeVisible();
    titles.add((await heading.textContent()) ?? "");
    await expect(page.locator("main")).not.toContainText(/sponsorPortal\.|firstRun\.|MISSING/);
    const extra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(extra, locale).toBeLessThanOrEqual(0);
  }
  // es-MX inherits es: seven distinct texts for eight locale codes.
  expect(titles.size).toBe(7);

  await page.goto(`/en${dashboard(fresh)}`);
  await welcome(page).getByRole("button", { name: "Take the tour" }).click();
  const tour = page.getByRole("dialog");
  await expect(tour).toHaveAttribute("data-tour-layout", "docked");
  const box = await tour.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844).toBe(true);
  expect(await axe(page)).toEqual([]);
  await ctx.close();
});
