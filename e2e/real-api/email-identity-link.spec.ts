import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { expect, type BrowserContext, type Page, test } from "@playwright/test";

/*
 * SF-78: verifying the invited email from a coach invitation, end to end,
 * on the production build against the real SF-77/SF-57 API and PostgreSQL
 * (playwright.real-api.config.ts). Nothing in the browser is mocked; a
 * response is only ever dropped on purpose (Journey 6).
 *
 * Google and Apple sign-in cannot run here (their scripts are blocked), so
 * a Google- or Apple-only user is created in the disposable database with
 * SimpleFit's own context functions (`fixtures/email-link-seed.exs`) and the
 * browser receives that user's refresh cookie: the app then restores the
 * session exactly as after a provider sign-in. Codes are read from the
 * API's queued email (`mix e2e.email_code`).
 *
 * Sharing (Journey 7) needs the API restarted with COACHING_ACCESS_ENABLED
 * =false and E2E_SHARING=off; every other journey runs with sharing on and
 * test-only legal fixtures. See README.md.
 */

const API_URL = process.env.E2E_REAL_API_URL ?? "";
const API_DIR = resolve(process.env.E2E_API_DIR ?? "../simplefit-api");
const DATABASE_URL = process.env.E2E_API_DATABASE_URL ?? "";
const SHARING = process.env.E2E_SHARING ?? "on";
const SEED = resolve("e2e/real-api/fixtures/email-link-seed.exs");

test.skip(!API_URL, "E2E_REAL_API_URL is not set: the real-backend journey needs a running API");

function disposableDatabase(): string {
  const name = new URL(DATABASE_URL).pathname.slice(1);
  if (!/e2e/.test(name) || name === "simple_fit_dev") {
    throw new Error("E2E_API_DATABASE_URL must name a disposable end-to-end database");
  }
  return DATABASE_URL;
}

function mix(args: string[], extra: Record<string, string> = {}): string {
  return execFileSync("mix", args, {
    cwd: API_DIR,
    env: { ...process.env, ...extra, MIX_ENV: "dev", DATABASE_URL: disposableDatabase() },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

/**
 * Fixture creation in its own process: a coach can only invite with sharing
 * configured, so the seed process always has it, with the test-only versions
 * of simplefit-api/test/support/legal. The API server alone decides the gate
 * the journeys see.
 */
const SEED_ENV = {
  COACHING_ACCESS_ENABLED: "true",
  COACHING_DISCLOSURES:
    process.env.COACHING_DISCLOSURES ?? "fighter-coach-disclosure-test-1=basic_profile",
  COACHING_DATA_RULES_VERSION: process.env.COACHING_DATA_RULES_VERSION ?? "coach-data-rules-test-1",
};

function seed(...args: string[]): Record<string, string> {
  return Object.fromEntries(
    mix(["run", SEED, ...args], SEED_ENV)
      .split("\n")
      .map((line) => line.trim().split(" "))
      .filter((parts) => parts.length === 2 && /^[A-Z]+$/.test(parts[0] ?? ""))
      .map(([key, value]) => [key, value]),
  );
}

function sql(query: string): string {
  return execFileSync("psql", [disposableDatabase(), "-Atc", query], { encoding: "utf8" }).trim();
}

const resetRateLimits = () => sql("DELETE FROM auth_rate_limits");

function emailedCode(address: string): string {
  const code = mix(["e2e.email_code", address])
    .split("\n")
    .find((line) => /^\d{6}$/.test(line.trim()));
  if (!code) throw new Error("no code was emailed");
  return code.trim();
}

/** A unique, valid address for this browser project and test. */
const address = (tag: string) =>
  `sf78-${tag}-${test.info().project.name}-${Date.now()}@example.test`.toLowerCase();

/** Hands the browser the refresh cookie of a seeded session (the API's dev cookie). */
async function signInAs(context: BrowserContext, refresh: string | undefined) {
  if (!refresh) throw new Error("no session was seeded");
  await context.addCookies([
    {
      name: "sf_refresh",
      value: refresh,
      domain: new URL(API_URL).hostname,
      path: "/api/auth",
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
}

const userIdOf = (provider: string, subject: string) =>
  sql(
    `SELECT user_id FROM identities WHERE provider='${provider}' AND provider_subject='${subject}'`,
  );
const providersOf = (userId: string) =>
  sql(
    `SELECT string_agg(provider, ',' ORDER BY provider) FROM identities WHERE user_id='${userId}'`,
  );
const ownerOf = (email: string) =>
  sql(`SELECT user_id FROM identities WHERE provider='email' AND provider_subject='${email}'`);

async function openInvitation(page: Page, token: string | undefined) {
  if (!token) throw new Error("no invitation was seeded");
  await page.goto(`/en/invite/coach#token=${token}`);
}

/** Up to the recipient mismatch, then into the flow. */
async function toMismatch(page: Page) {
  await page.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await page.getByRole("button", { name: "Verify the invited email" }).click();
}

async function sendCode(page: Page, email: string) {
  resetRateLimits();
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  const field = page.getByRole("textbox", { name: "6-digit code" });
  await field.waitFor();
  return field;
}

/** No code or token where it could leak (Q). */
async function expectNoLeaks(page: Page, secrets: string[]) {
  const visible = [
    page.url(),
    await page.evaluate(() =>
      JSON.stringify({ local: { ...window.localStorage }, session: { ...window.sessionStorage } }),
    ),
    await page.evaluate(() => document.cookie),
  ].join("\n");
  for (const secret of secrets) {
    if (/^\d{6}$/.test(secret) || secret.startsWith("sfr_")) expect(visible).not.toContain(secret);
  }
}

test.describe("SF-78 verify the invited email, real API", () => {
  test.skip(SHARING !== "on", "these journeys need sharing on");

  test("Journey 1: Google-only user links the invited address and accepts explicitly", async ({
    page,
    context,
  }) => {
    const email = address("google");
    const subject = `sf78-google-${test.info().project.name}-${Date.now()}`;
    const { INVITE } = seed("invite", email);
    const { REFRESH } = seed("user", "google", subject, "fighter");
    const userId = userIdOf("google", subject);
    const users = sql("SELECT count(*) FROM users");
    const consoleLines: string[] = [];
    page.on("console", (message) => consoleLines.push(message.text()));

    await signInAs(context, REFRESH);
    await openInvitation(page, INVITE);
    await toMismatch(page);
    expect(ownerOf(email)).toBe("");

    const field = await sendCode(page, email);
    // A 202 links nothing.
    expect(ownerOf(email)).toBe("");
    const code = emailedCode(email);
    await field.fill(code);
    await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();

    // The same user, with the new email identity; nothing accepted yet.
    expect(ownerOf(email)).toBe(userId);
    expect(providersOf(userId)).toBe("email,google");
    expect(sql("SELECT count(*) FROM users")).toBe(users);
    const fighterProfile = sql(`SELECT id FROM fighter_profiles WHERE user_id='${userId}'`);
    const active = () =>
      sql(
        `SELECT count(*) FROM coach_fighter_relationships WHERE fighter_profile_id='${fighterProfile}' AND status='active'`,
      );
    expect(active()).toBe("0");

    await page.getByRole("button", { name: "Back to the invitation" }).click();
    await expect(page.getByRole("checkbox")).not.toBeChecked();
    resetRateLimits();
    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "You’re connected with Coach Marek." }),
    ).toBeVisible();

    expect(active()).toBe("1");
    await expectNoLeaks(page, [code, INVITE ?? "", REFRESH ?? ""]);
    expect(consoleLines.join("\n")).not.toContain(code);
  });

  test("Journey 2: Apple-only user links the address; still one user", async ({
    page,
    context,
  }) => {
    const email = address("apple");
    const subject = `000778.sf78${Date.now()}${test.info().project.name.replace(/\W/g, "")}`;
    const { INVITE } = seed("invite", email);
    const { REFRESH } = seed("user", "apple", subject, "fighter");
    const userId = userIdOf("apple", subject);
    const users = sql("SELECT count(*) FROM users");

    await signInAs(context, REFRESH);
    await openInvitation(page, INVITE);
    await toMismatch(page);
    const field = await sendCode(page, email);
    await field.fill(emailedCode(email));
    await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();

    expect(ownerOf(email)).toBe(userId);
    expect(providersOf(userId)).toBe("apple,email");
    expect(sql("SELECT count(*) FROM users")).toBe(users);
  });

  test("Journey 3: an address owned by another user is never transferred or merged", async ({
    page,
    context,
  }) => {
    const email = address("owned");
    const { INVITE } = seed("invite", email);
    seed("user", "email", email);
    const owner = ownerOf(email);
    const subject = `sf78-taker-${test.info().project.name}-${Date.now()}`;
    const { REFRESH } = seed("user", "google", subject, "fighter");
    const taker = userIdOf("google", subject);

    await signInAs(context, REFRESH);
    await openInvitation(page, INVITE);
    await toMismatch(page);
    const field = await sendCode(page, email);
    // The request answer said nothing about the owner; the mailbox proof does.
    await field.fill(emailedCode(email));
    await expect(page.getByText(/Accounts are never merged\./).first()).toBeVisible();

    expect(ownerOf(email)).toBe(owner);
    expect(providersOf(taker)).toBe("google");
    expect(providersOf(owner)).toBe("email");
  });

  test("Journey 4: an expired code and a superseded (replayed) code link nothing", async ({
    page,
    context,
  }) => {
    const email = address("expired");
    const { INVITE } = seed("invite", email);
    const subject = `sf78-expired-${test.info().project.name}-${Date.now()}`;
    const { REFRESH } = seed("user", "google", subject, "fighter");

    await signInAs(context, REFRESH);
    await openInvitation(page, INVITE);
    await toMismatch(page);
    let field = await sendCode(page, email);
    const first = emailedCode(email);
    sql(
      `UPDATE email_auth_challenges SET inserted_at = inserted_at - interval '1 hour', expires_at = now() - interval '1 second' WHERE purpose='identity_link' AND closed_at IS NULL`,
    );
    await field.fill(first);
    await expect(
      page.getByText("This code no longer works. Send a new one.").first(),
    ).toBeVisible();
    expect(ownerOf(email)).toBe("");

    // A new code supersedes; the old one is refused.
    resetRateLimits();
    await page.getByRole("button", { name: "Send a new code" }).first().click();
    await expect(
      page.getByText("We sent a new code. Earlier codes no longer work.").first(),
    ).toBeVisible();
    field = page.getByRole("textbox", { name: "6-digit code" });
    await field.fill(first);
    await expect(
      page.getByText("That code isn’t right. Check the digits and try again.").first(),
    ).toBeVisible();
    expect(ownerOf(email)).toBe("");
  });

  test("Journey 5: logout during the challenge; another session cannot complete it", async ({
    page,
    context,
  }) => {
    const email = address("logout");
    const { INVITE } = seed("invite", email);
    const subject = `sf78-logout-${test.info().project.name}-${Date.now()}`;
    const { REFRESH } = seed("user", "google", subject, "fighter");

    await signInAs(context, REFRESH);
    await openInvitation(page, INVITE);
    await toMismatch(page);
    const field = await sendCode(page, email);
    const code = emailedCode(email);

    // Sign out from another tab of this browser (the real cookie logout).
    const other = await context.newPage();
    await other.goto("/en");
    const status = await other.evaluate(async (api) => {
      const response = await fetch(`${api}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "x-simplefit-csrf": "1" },
      });
      return response.status;
    }, API_URL);
    expect(status).toBe(204);
    await other.close();

    await field.fill(code);
    // The session is gone: the bound invitation goes with it, nothing links.
    await expect(page.getByRole("heading", { name: "No invitation to show" })).toBeVisible();
    expect(ownerOf(email)).toBe("");
    expect(
      await page.evaluate(() => window.sessionStorage.getItem("simplefit.coach-invitation")),
    ).toBeNull();
    await expect(page.getByRole("textbox", { name: "6-digit code" })).toHaveCount(0);

    // Another account signs in to this tab: nothing of the previous one survives.
    const switched = seed("user", "google", `${subject}-switched`, "fighter").REFRESH;
    await signInAs(context, switched);
    await page.reload();
    await expect(page.getByRole("heading", { name: "No invitation to show" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Verify the invited email" })).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        JSON.stringify({ ...window.sessionStorage, ...window.localStorage }),
      ),
    ).not.toContain(code);

    // A new session of the same user, and another user, cannot use the old code.
    const again = seed("session", "google", subject).REFRESH;
    const stranger = seed("user", "google", `${subject}-other`).REFRESH;
    for (const refresh of [again, stranger]) {
      const tokens = (await (
        await fetch(`${API_URL}/api/auth/session/refresh`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refresh_token: refresh }),
        })
      ).json()) as { access_token: string };
      const confirm = await fetch(`${API_URL}/api/v1/me/email-identities/confirm-link`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${tokens.access_token}`,
        },
        body: JSON.stringify({ email, code }),
      });
      expect(confirm.status).toBe(422);
      expect(((await confirm.json()) as { error: { code: string } }).error.code).toBe(
        "code_expired",
      );
    }
    expect(ownerOf(email)).toBe("");
  });

  test("Journey 6: the confirmation answer is lost; the page reconciles from the identity list", async ({
    page,
    context,
  }) => {
    const email = address("lost");
    const { INVITE } = seed("invite", email);
    const subject = `sf78-lost-${test.info().project.name}-${Date.now()}`;
    const { REFRESH } = seed("user", "google", subject, "fighter");
    const userId = userIdOf("google", subject);

    await signInAs(context, REFRESH);
    await openInvitation(page, INVITE);
    await toMismatch(page);
    const field = await sendCode(page, email);

    // The request reaches the API (which links), the answer never reaches the page.
    let confirmations = 0;
    await page.route("**/api/v1/me/email-identities/confirm-link", async (route) => {
      confirmations += 1;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("connectionfailed");
    });
    await field.fill(emailedCode(email));
    await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();

    expect(confirmations).toBe(1);
    expect(ownerOf(email)).toBe(userId);
    expect(
      sql(`SELECT count(*) FROM identities WHERE provider='email' AND provider_subject='${email}'`),
    ).toBe("1");
  });

  test("T: double submission sends one confirmation", async ({ page, context }) => {
    const email = address("double");
    const { INVITE } = seed("invite", email);
    const { REFRESH } = seed(
      "user",
      "google",
      `sf78-double-${test.info().project.name}-${Date.now()}`,
      "fighter",
    );
    await signInAs(context, REFRESH);
    await openInvitation(page, INVITE);
    await toMismatch(page);
    const field = await sendCode(page, email);
    let confirmations = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/confirm-link")) confirmations += 1;
    });
    await field.fill(emailedCode(email));
    await field.press("Enter").catch(() => undefined);
    await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
    expect(confirmations).toBe(1);
  });
});

test.describe("SF-78 invitation changed during verification, real API", () => {
  test.skip(SHARING !== "on", "these journeys need sharing on");

  /** An access token of a new session of the user, from the API itself. */
  async function bearer(refresh: string | undefined) {
    const response = await fetch(`${API_URL}/api/auth/session/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    const { access_token } = (await response.json()) as { access_token: string };
    return { "content-type": "application/json", authorization: `Bearer ${access_token}` };
  }

  for (const change of ["expired", "cancelled", "consumed"] as const) {
    test(`Journey 8 (${change}): linking succeeds; the answer is the backend's, never an acceptance`, async ({
      page,
      context,
    }) => {
      const since = sql("SELECT now()");
      const email = address(change);
      const subject = `sf78-${change}-${test.info().project.name}-${Date.now()}`;
      const { INVITE } = seed("invite", email);
      const { REFRESH } = seed("user", "google", subject, "fighter");
      const userId = userIdOf("google", subject);
      const invitation = sql(`SELECT id FROM coach_invitations WHERE inserted_at >= '${since}'`);
      const relationships = sql("SELECT count(*) FROM coach_fighter_relationships");

      await signInAs(context, REFRESH);
      await openInvitation(page, INVITE);
      await toMismatch(page);
      const field = await sendCode(page, email);
      await field.fill(emailedCode(email));
      await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
      expect(ownerOf(email)).toBe(userId);

      // Meanwhile the invitation stops being pending.
      if (change === "expired") {
        sql(
          `UPDATE coach_invitations SET expires_at = inserted_at + interval '1 millisecond' WHERE id='${invitation}'`,
        );
      } else if (change === "cancelled") {
        sql(
          `UPDATE coach_invitations SET status='cancelled', responded_at=now() WHERE id='${invitation}'`,
        );
      } else {
        // Answered elsewhere by the same, now verified, recipient.
        resetRateLimits();
        const declined = await fetch(`${API_URL}/api/v1/me/coach-invitations/decline`, {
          method: "POST",
          headers: await bearer(seed("session", "google", subject).REFRESH),
          body: JSON.stringify({ token: INVITE }),
        });
        expect(declined.status).toBe(204);
      }
      const status = sql(`SELECT status FROM coach_invitations WHERE id='${invitation}'`);

      await page.getByRole("button", { name: "Back to the invitation" }).click();
      const consent = page.getByRole("checkbox");
      await expect(consent).not.toBeChecked();
      resetRateLimits();
      await consent.click();
      await page.getByRole("button", { name: "Accept invitation" }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "This invitation isn’t available" }),
      ).toBeVisible();

      expect(sql(`SELECT status FROM coach_invitations WHERE id='${invitation}'`)).toBe(status);
      expect(sql("SELECT count(*) FROM coach_fighter_relationships")).toBe(relationships);
      expect(
        await page.evaluate(() => window.sessionStorage.getItem("simplefit.coach-invitation")),
      ).toBeNull();
      // Still one user, with both identities.
      expect(providersOf(userId)).toBe("email,google");
    });
  }
});

test.describe("SF-78 with sharing off, real API", () => {
  test.skip(SHARING !== "off", "run with the API's sharing gate off and E2E_SHARING=off");

  test("Journey 7: linking works on its own; the invitation stays unavailable, nothing relates", async ({
    page,
    context,
  }) => {
    const since = sql("SELECT now()");
    const email = address("gateoff");
    const subject = `sf78-gateoff-${test.info().project.name}-${Date.now()}`;
    const { INVITE } = seed("invite", email);
    const { REFRESH } = seed("user", "google", subject, "fighter");
    const userId = userIdOf("google", subject);
    const relationships = sql("SELECT count(*) FROM coach_fighter_relationships");

    await signInAs(context, REFRESH);
    await openInvitation(page, INVITE);
    await expect(
      page.getByRole("heading", { level: 1, name: "This invitation isn’t available" }),
    ).toBeVisible();

    // The SF-77 API itself, with this user's own session.
    const tokens = (await (
      await fetch(`${API_URL}/api/auth/session/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refresh_token: seed("session", "google", subject).REFRESH }),
      })
    ).json()) as { access_token: string };
    const bearer = {
      "content-type": "application/json",
      authorization: `Bearer ${tokens.access_token}`,
    };
    resetRateLimits();
    const requested = await fetch(`${API_URL}/api/v1/me/email-identities/link-challenge`, {
      method: "POST",
      headers: bearer,
      body: JSON.stringify({ email }),
    });
    expect(requested.status).toBe(202);
    const confirmed = await fetch(`${API_URL}/api/v1/me/email-identities/confirm-link`, {
      method: "POST",
      headers: bearer,
      body: JSON.stringify({ email, code: emailedCode(email) }),
    });
    expect(confirmed.status).toBe(200);
    expect(ownerOf(email)).toBe(userId);

    // "Not available" is final (SF-60): the tab dropped the token with it.
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "No invitation to show" }),
    ).toBeVisible();
    expect(
      sql(`SELECT string_agg(status, ',') FROM coach_invitations WHERE inserted_at >= '${since}'`),
    ).toBe("pending");
    expect(sql("SELECT count(*) FROM coach_fighter_relationships")).toBe(relationships);
  });
});
