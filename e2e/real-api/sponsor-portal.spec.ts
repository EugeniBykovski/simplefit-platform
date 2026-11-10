import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { expect, type Browser, type Page, test } from "@playwright/test";

/*
 * SF-117: sponsor entry, the partner portal and context switching on the
 * production build against a real simplefit-api and PostgreSQL
 * (playwright.real-api.config.ts); nothing is mocked in the browser.
 *
 * It is the browser leg of simplefit-api's
 * `test/standalone/sponsor_entry_http_e2e_test.exs`, which runs first on the
 * same disposable database and writes `E2E_SPONSOR_HANDOFF` (emails and
 * organization ids, never a token or code): there a real founder operator
 * (dev ceremony, software WebAuthn keys, key check over HTTP) approved the
 * applicant's organization, approved another applicant's, suspended a third,
 * and the applicant's membership of the second was revoked. Here the people
 * sign in with the emailed code. A membership added and revoked while a page
 * is open uses `mix sponsors.fixture` (authority `local_fixture`, dev only):
 * the product has no HTTP route for either (D-SA12).
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

async function newPage(browser: Browser) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());
  return page;
}

/** Signs in with the email code on the sign-in page the browser is on, keeping its continuation. */
async function signIn(page: Page, email: string) {
  resetRateLimits();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await page.waitForURL((url) => url.pathname.endsWith("/login/code"));
  await page.locator('[data-slot="code-input"]').pressSequentially(emailedCode(email));
  await page.waitForURL((url) => !url.pathname.includes("/login"));
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

const overview = (page: Page) => page.getByRole("heading", { level: 1, name: "Overview" });
const notAvailable = (page: Page) => page.getByText("We can’t find that page");
const portal = (id: string) => `/en/sponsor/${id}/dashboard`;
const only = () => test.skip(test.info().project.name !== "chromium-1440", "one journey per run");

test("A/C/G: a portal link survives sign-in and opens the approved organization", async ({
  browser,
}) => {
  only();
  const h = handoff();
  const page = await newPage(browser);
  await page.goto(portal(h.owned));
  await page.waitForURL((url) => url.pathname === "/en/sponsor/login");
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(`/sponsor/${h.owned}/dashboard`);
  await signIn(page, h.applicant.email);
  await page.waitForURL((url) => url.pathname === portal(h.owned));
  await expect(overview(page)).toBeVisible();
  await expect(page.getByText("Haymaker Drinks").first()).toBeVisible();
  await expect(page.getByText("Your role: Owner")).toBeVisible();
  // The applicant's own application created this organization.
  await expect(page.getByText("Reviewed by SimpleFit")).toBeVisible();
  await expect(page.getByText(/\d+(\.\d+)?%|€/)).toHaveCount(0);
  expect(await axe(page)).toEqual([]);
  await page.context().close();
});

test("E: suspended, revoked, foreign, forged and malformed organizations", async ({ browser }) => {
  only();
  const h = handoff();
  const page = await newPage(browser);
  await page.goto(
    `/en/sponsor/login?returnTo=${encodeURIComponent(`/sponsor/${h.owned}/dashboard`)}`,
  );
  await signIn(page, h.applicant.email);
  await expect(overview(page)).toBeVisible();

  // Suspended: readable, said to be suspended, with no workspace in the switcher.
  await page.goto(portal(h.suspended));
  await expect(page.getByText("This organization is suspended.")).toBeVisible();
  await expect(page.getByText("Ringside Gear").first()).toBeVisible();

  // Revoked, someone else's, or unknown: one not-available state, no data.
  for (const id of [h.revoked, randomUUID()]) {
    await page.goto(portal(id));
    await expect(notAvailable(page)).toBeVisible();
    await expect(page.getByText("Northside Agency")).toHaveCount(0);
  }
  // A segment that isn't a UUID is the not-found page and never reaches an API path.
  const asked: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("not-a-uuid")) asked.push(request.url());
  });
  await page.goto("/en/sponsor/not-a-uuid/dashboard");
  await expect(page.getByText(/Error 404/).first()).toBeVisible();
  expect(asked.filter((url) => url.startsWith(API_URL))).toEqual([]);

  // The switcher lists only the organization the backend still offers.
  await page.goto(portal(h.owned));
  await page
    .getByRole("button", { name: /Haymaker Drinks, Owner\. Switch organization or profile/ })
    .first()
    .click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitemradio", { name: /Haymaker Drinks/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(menu.getByText(/Northside Agency|Ringside Gear/)).toHaveCount(0);
  await page.context().close();
});

test("D/E/H: two organizations, a remembered choice, then revocation while the page is open", async ({
  browser,
}) => {
  only();
  const h = handoff();
  // A fourth organization, owned by the other account, with the applicant as a member.
  const provisioned = mix([
    "sponsors.fixture",
    "provision",
    "--owner-user-id",
    h.other.user_id,
    "--legal-name",
    "Corner Club Sp. z o.o.",
    "--display-name",
    "Corner Club",
    "--country",
    "PL",
    "--contact-name",
    "Ola Nowak",
    "--contact-email",
    "ola@corner.example",
  ]);
  const corner = /organization ([0-9a-f-]{36})/.exec(provisioned)?.[1] ?? "";
  const membership =
    /membership ([0-9a-f-]{36}) is active/.exec(
      mix([
        "sponsors.fixture",
        "add-member",
        "--organization-id",
        corner,
        "--user-id",
        h.applicant.user_id,
        "--role",
        "member",
      ]),
    )?.[1] ?? "";

  const page = await newPage(browser);
  await page.goto("/en/login?intent=sponsor");
  await signIn(page, h.applicant.email);
  // D: two organizations and no remembered choice: the chooser lists both.
  await page.waitForURL((url) => url.pathname === "/en/app/context");
  await expect(page.getByText("Haymaker Drinks")).toBeVisible();
  await expect(page.getByText("Corner Club")).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.getByRole("button", { name: /Corner Club/ }).click();
  await page.waitForURL((url) => url.pathname === portal(corner));
  await expect(page.getByText("Your role: Member")).toBeVisible();
  // Organization-scoped: nothing of the other organization on this page.
  await expect(page.getByText("Reviewed by SimpleFit")).toHaveCount(0);

  // H: the remembered choice opens it next time, from the entry.
  await page.goto("/en/app?intent=sponsor");
  await page.waitForURL((url) => url.pathname === portal(corner));

  // E: the membership is revoked while the page is open; the next read is denied.
  mix(["sponsors.fixture", "revoke-membership", "--membership-id", membership, "--reason", "e2e"]);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await expect(notAvailable(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Corner Club")).toHaveCount(0);

  // H: the stale remembered choice is ignored: the entry opens the one left.
  await page.goto("/en/app?intent=sponsor");
  await page.waitForURL((url) => url.pathname === portal(h.owned));
  await page.context().close();
});

test("F: another account in the same browser sees nothing of the first", async ({ browser }) => {
  only();
  const h = handoff();
  const page = await newPage(browser);
  await page.goto(
    `/en/sponsor/login?returnTo=${encodeURIComponent(`/sponsor/${h.owned}/dashboard`)}`,
  );
  await signIn(page, h.applicant.email);
  await expect(page.getByText("Haymaker Drinks").first()).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.waitForURL((url) => url.pathname.endsWith("/login"));
  await page.goto(
    `/en/sponsor/login?returnTo=${encodeURIComponent(`/sponsor/${h.owned}/dashboard`)}`,
  );
  await signIn(page, h.other.email);
  // The first account's portal link: the second account is refused, with no trace of it.
  await expect(notAvailable(page)).toBeVisible();
  await expect(page.getByText("Haymaker Drinks")).toHaveCount(0);
  // The second account's own organization (approved for real in the standalone leg).
  await page.goto("/en/app?intent=sponsor");
  await page.waitForURL(
    (url) => url.pathname.startsWith("/en/sponsor/") || url.pathname === "/en/app/context",
  );
  await expect(page.getByText("Northside Agency").first()).toBeVisible();
  await expect(page.getByText("Haymaker Drinks")).toHaveCount(0);
  await page.context().close();
});

test("G: an unsafe returnTo is refused after sign-in; the entry decides", async ({ browser }) => {
  only();
  const h = handoff();
  const page = await newPage(browser);
  await page.goto(`/en/sponsor/login?returnTo=${encodeURIComponent("https://evil.example/x")}`);
  await signIn(page, h.applicant.email);
  await page.waitForURL((url) => url.pathname.startsWith("/en/"));
  expect(new URL(page.url()).host).toBe("127.0.0.1:3100");
  await page.goto(`/en/sponsor/login?returnTo=${encodeURIComponent("//evil.example/x")}`);
  await page.waitForURL((url) => !url.pathname.includes("/login"));
  expect(new URL(page.url()).host).toBe("127.0.0.1:3100");
  await page.context().close();
});
