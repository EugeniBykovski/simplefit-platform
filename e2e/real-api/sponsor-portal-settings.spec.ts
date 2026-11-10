import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { expect, type Browser, type Page, test } from "@playwright/test";

/*
 * SF-118: the partner portal's overview, settings (SPX9 MVP), application page
 * and unsupported pages on the production build against a real simplefit-api
 * and PostgreSQL (playwright.real-api.config.ts); nothing in the browser is
 * mocked except one injected network failure (H).
 *
 * Like `sponsor-portal.spec.ts` (SF-117) it runs after simplefit-api's
 * `test/standalone/sponsor_entry_http_e2e_test.exs` on the same disposable
 * database, which leaves operator-approved organizations and writes
 * `E2E_SPONSOR_HANDOFF` (emails and ids, never a token). Expected values are
 * read from that database, never assumed. One member is added with
 * `mix sponsors.fixture` (dev only): the product has no invitation route
 * (D-SA12). The API has no organization write, so there is no edit to persist:
 * the spec proves none is offered and none is sent.
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

/** Every request the page makes to the API: method and path (no headers, no bodies). */
function apiRequests(page: Page) {
  const seen: { method: string; path: string }[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(API_URL)) {
      seen.push({ method: request.method(), path: new URL(request.url()).pathname });
    }
  });
  return seen;
}

async function signedIn(browser: Browser, email: string, path: string, locale = "en") {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.route(/accounts\.google\.com|appleid\.cdn-apple\.com/, (route) => route.abort());
  const requests = apiRequests(page);
  let bearer = "";
  page.on("request", (request) => {
    const header = request.headers().authorization;
    if (request.url().startsWith(API_URL) && header) bearer = header;
  });
  resetRateLimits();
  await page.goto(`/${locale}/sponsor/login?returnTo=${encodeURIComponent(path)}`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((url) => url.pathname.endsWith("/login/code"));
  await page.locator('[data-slot="code-input"]').pressSequentially(emailedCode(email));
  await page.waitForURL((url) => url.pathname === `/${locale}${path.split("?")[0]}`);
  return { page, requests, bearer: () => bearer };
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

const settings = (id: string, section: string) => `/sponsor/${id}/settings?section=${section}`;
const only = () => test.skip(test.info().project.name !== "chromium-1440", "one journey per run");
const writes = (requests: { method: string; path: string }[]) =>
  requests.filter((r) => r.method !== "GET" && r.path.includes("/sponsor-organizations"));

test("A/F/G: the owner reads the real company profile, contacts and members; nothing is editable or invented", async ({
  browser,
}) => {
  only();
  const h = handoff();
  const legal = sql(`SELECT legal_name FROM sponsor_organizations WHERE id = '${h.owned}'`);
  const contactEmail = sql(
    `SELECT email FROM sponsor_contacts WHERE organization_id = '${h.owned}' AND kind = 'primary'`,
  );
  const { page, requests } = await signedIn(
    browser,
    h.applicant.email,
    settings(h.owned, "organization"),
  );

  const profile = page.getByRole("region", { name: "Company profile" });
  // The legal name, from the database (the display name may be the same text).
  await expect(profile.getByText(legal, { exact: true }).first()).toBeVisible();
  await expect(profile.getByText("Active")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  expect(await axe(page)).toEqual([]);

  await page.getByRole("link", { name: "Contact", exact: true }).click();
  await expect(page.getByText(contactEmail)).toBeVisible();

  await page.getByRole("navigation").first().getByRole("link", { name: "Members" }).click();
  await expect(page.getByText(/Owner · you/)).toBeVisible();
  // In the page itself (the sidebar's language and theme switchers say "Change …").
  await expect(
    page.locator("main").getByRole("button", { name: /invite|change|remove|transfer/i }),
  ).toHaveCount(0);

  // G: the overview names nothing that doesn't exist.
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  const future = page.locator("[data-sponsor-future]");
  await expect(future.getByRole("listitem")).toHaveCount(4);
  await expect(future.getByRole("link")).toHaveCount(0);
  await expect(page.getByText(/\d+(\.\d+)?%|€|impressions|clicks/i)).toHaveCount(0);

  // The application that created this organization, the applicant's own, read-only.
  await page.getByRole("link", { name: "Application" }).first().click();
  await expect(page.getByText("Reviewed by SimpleFit")).toBeVisible();

  // Pages without a domain say so; nothing is requested for them.
  for (const path of ["campaigns", "invoices", "campaigns/new"]) {
    await page.goto(`/en/sponsor/${h.owned}/${path}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "This isn’t part of SimpleFit yet" }),
    ).toBeVisible();
  }
  expect(requests.filter((r) => /campaign|invoice|analytic/.test(r.path))).toEqual([]);
  expect(writes(requests)).toEqual([]);
  await page.context().close();
});

test("C/22: a member reads the organization and members, never its contacts (403 from the API)", async ({
  browser,
}) => {
  only();
  const h = handoff();
  // The other account becomes a plain member of the applicant's organization.
  const existing = sql(
    `SELECT count(*) FROM sponsor_workspace_memberships WHERE organization_id = '${h.owned}' AND user_id = '${h.other.user_id}' AND status = 'active'`,
  );
  if (existing === "0") {
    mix([
      "sponsors.fixture",
      "add-member",
      "--organization-id",
      h.owned,
      "--user-id",
      h.other.user_id,
      "--role",
      "member",
    ]);
  }
  const { page, requests, bearer } = await signedIn(
    browser,
    h.other.email,
    settings(h.owned, "contact"),
  );
  await expect(
    page.getByText("Business contacts are visible to an owner or manager of this organization."),
  ).toBeVisible();
  // Never requested without the permission; the backend refuses it anyway.
  expect(requests.filter((r) => r.path.endsWith("/contacts"))).toEqual([]);
  const asMember = await page.request.get(
    `${API_URL}/api/v1/sponsor-organizations/${h.owned}/contacts`,
    { headers: { authorization: bearer() } },
  );
  expect(asMember.status()).toBe(403);

  await page.goto(`/en${settings(h.owned, "members")}`);
  await expect(page.getByText(/Member · you/)).toBeVisible();
  await page.goto(`/en/sponsor/${h.owned}/application`);
  await expect(page.getByText("Only the person who applied can see it")).toBeVisible();
  expect(writes(requests)).toEqual([]);
  await page.context().close();
});

test("D: a suspended organization is readable, marked suspended, with nothing to change", async ({
  browser,
}) => {
  only();
  const h = handoff();
  const { page } = await signedIn(browser, h.applicant.email, settings(h.owned, "organization"));
  await page.goto(`/en${settings(h.suspended, "organization")}`);
  await expect(page.getByText("This organization is suspended.")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Company profile" }).getByText("Suspended"),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.context().close();
});

test("H: an unreachable API is an honest failure with a retry that recovers", async ({
  browser,
}) => {
  only();
  const h = handoff();
  const { page } = await signedIn(browser, h.applicant.email, settings(h.owned, "organization"));
  await page.route(`${API_URL}/api/v1/sponsor-organizations/${h.owned}/members**`, (route) =>
    route.abort("internetdisconnected"),
  );
  await page.goto(`/en${settings(h.owned, "members")}`);
  const retry = page.getByRole("button", { name: /Try again/ });
  await expect(retry).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Owner · you/)).toHaveCount(0);
  await page.unroute(`${API_URL}/api/v1/sponsor-organizations/${h.owned}/members**`);
  await retry.click();
  await expect(page.getByText(/Owner · you/)).toBeVisible();
  await page.context().close();
});

test("J: every configured locale renders the portal translated and fits 375 px", async ({
  browser,
}) => {
  only();
  const h = handoff();
  const { page } = await signedIn(browser, h.applicant.email, settings(h.owned, "organization"));
  for (const locale of ["en", "ru", "pl", "de", "uk", "es", "es-MX", "fr"]) {
    for (const path of [`/sponsor/${h.owned}/dashboard`, settings(h.owned, "members")]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/${locale}${path}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator("main")).not.toContainText(/sponsorPortal\.|shells\.|MISSING/);
      await page.setViewportSize({ width: 375, height: 800 });
      const extra = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(extra, `${locale} ${path}`).toBeLessThanOrEqual(0);
    }
  }
  await page.context().close();
});
