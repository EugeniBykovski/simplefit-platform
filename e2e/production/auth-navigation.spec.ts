import { expect, test, type Page, type Request } from "@playwright/test";

import { apiError, expectProviderControls, open, seedPending } from "./harness";

/*
 * Real navigation through the web authentication routes on the production
 * build (SF-36): each method completes a session through the shared pipeline,
 * the guest-only layout asks the backend entry resolver (SF-45) where to go,
 * and the browser lands on that destination with the continuation (`intent`,
 * `returnTo`). The API and the providers are deterministic mocks at the
 * network edge; nothing here talks to Google, Apple or a backend.
 *
 * The destinations reached here: account registration (WA5, SF-46) renders
 * its form on a not-started registration; role selection (WA6) and the other
 * role onboarding entries are still SF-32 placeholders, so those flows end on
 * the right route, not on a finished screen.
 */

test.use({ viewport: { width: 1440, height: 900 } });

const TOKENS = {
  access_token: "sfa_fixture",
  access_token_expires_at: "2099-01-01T00:00:00Z",
  refresh_token_transport: "cookie",
  token_type: "Bearer",
};

type EntryFixture = {
  destination:
    | "account_registration"
    | "role_selection"
    | "fighter_onboarding"
    | "coach_onboarding"
    | "gym_onboarding"
    | "sponsor_application"
    | "fighter_home";
  account_registration: "not_started" | "in_progress" | "complete";
  mandatory: boolean;
  capabilities?: "FIGHTER"[];
  fighter_profile?: "not_started" | "in_progress" | "completed";
};

/** A new account's SF-44 registration, as WA5 reads it. */
const NEW_ACCOUNT = {
  account_profile: {
    registration: {
      status: "not_started",
      completed_at: null,
      missing_requirements: ["full_name", "date_of_birth", "terms", "privacy"],
    },
    full_name: null,
    date_of_birth: null,
    consents: Object.fromEntries(
      (["terms", "privacy"] as const).map((kind) => [
        kind,
        {
          accepted: false,
          accepted_version: null,
          accepted_at: null,
          current_version: `${kind}-v1`,
          current: false,
        },
      ]),
    ),
    product_news: { subscribed: false, updated_at: null },
  },
};

/**
 * The signed-in API: the current user, a new account's registration (WA5) and
 * the entry resolution, which records its intent.
 */
async function signedInApi(page: Page, entry: EntryFixture) {
  const resolutions: (string | null)[] = [];
  await page.route(
    (url) => url.pathname === "/api/v1/me/account-profile" && url.port !== "3100",
    (call) => call.fulfill({ json: NEW_ACCOUNT }),
  );
  await page.route(
    (url) => url.pathname === "/api/me" && url.port !== "3100",
    (call) =>
      call.fulfill({
        json: {
          user: { id: "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5", created_at: "2026-10-06T12:00:00Z" },
        },
      }),
  );
  await page.route(
    (url) => url.pathname === "/api/v1/me/entry" && url.port !== "3100",
    (call) => {
      const intent = new URL(call.request().url()).searchParams.get("intent");
      resolutions.push(intent);
      return call.fulfill({
        json: {
          entry: {
            capabilities: [],
            fighter_profile: "not_started",
            intent,
            reason: entry.destination,
            ...entry,
          },
        },
      });
    },
  );
  return resolutions;
}

/** The JSON bodies posted to `/api/<path>`. */
function posted(page: Page, path: string) {
  const bodies: unknown[] = [];
  page.on("request", (request: Request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === `/api/${path}`) {
      bodies.push(request.postDataJSON());
    }
  });
  return bodies;
}

async function answer(page: Page, path: string, status: number, json: unknown) {
  await page.route(
    (url) => url.pathname === `/api/${path}` && url.port !== "3100",
    (call) => call.fulfill({ status, json }),
  );
}

const codeInput = (page: Page) => page.locator('[data-slot="code-input"]');

test("email registration: WA3 → WA4 → entry → account registration (WA5), continuation kept", async ({
  page,
}) => {
  const registrations = posted(page, "auth/email/registrations");
  const verifications = posted(page, "auth/email/registrations/verify");
  let resolutions: (string | null)[] = [];
  await open(
    page,
    "/en/signup/account?intent=coach&returnTo=%2Fapp%2Fmessages",
    page.getByRole("heading", { level: 1 }),
    async (page) => {
      await answer(page, "auth/email/registrations", 202, {
        registration_token: "sfg_fixture",
        expires_in_seconds: 600,
        resend_after_seconds: 60,
      });
      await answer(page, "auth/email/registrations/verify", 200, TOKENS);
      resolutions = await signedInApi(page, {
        destination: "account_registration",
        account_registration: "not_started",
        mandatory: true,
      });
    },
  );
  await page.getByRole("textbox", { name: "Email" }).fill("fighter@example.com");
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL("**/en/signup/verify?returnTo=%2Fapp%2Fmessages&intent=coach");
  // The disabled name and consents are never part of the request.
  expect(registrations).toEqual([{ email: "fighter@example.com" }]);
  await codeInput(page).pressSequentially("482910");

  await page.waitForURL("**/en/app/onboarding/account?returnTo=%2Fapp%2Fmessages&intent=coach");
  expect(verifications).toEqual([
    { registration_token: "sfg_fixture", code: "482910", refresh_token_transport: "cookie" },
  ]);
  expect(resolutions[0]).toBe("coach");
  // WA5 (SF-46): the account basics form, empty for a new account.
  await expect(page.getByRole("heading", { level: 1, name: "Before you start" })).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue("");
  // Not a trap: the frame keeps Sign out and the brand link to the public site.
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("link", { name: /SimpleFit Boxing/ })).toHaveAttribute("href", "/en");
  await page.screenshot({ path: "test-results/production/flow-wa5.png" });
});

test("email sign-in: WA1 → WA1b → entry → role selection (WA6)", async ({ page }) => {
  const requests = posted(page, "auth/email/sign-in");
  await open(page, "/en/login", page.getByRole("heading", { level: 1 }), async (page) => {
    await answer(page, "auth/email/sign-in", 202, {
      expires_in_seconds: 600,
      resend_after_seconds: 60,
    });
    await answer(page, "auth/email/sign-in/verify", 200, TOKENS);
    await signedInApi(page, {
      destination: "role_selection",
      account_registration: "complete",
      mandatory: false,
    });
  });
  await page.getByRole("textbox", { name: "Email" }).fill("fighter@example.com");
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await page.waitForURL("**/en/login/code");
  expect(requests).toEqual([{ email: "fighter@example.com" }]);
  await codeInput(page).pressSequentially("528461");
  await page.waitForURL("**/en/app/onboarding/role");
  await expect(
    page.getByRole("heading", { level: 1, name: "Choose where to start" }),
  ).toBeVisible();
});

test("Google: the GSI credential → POST /api/auth/google → entry, with no implied role", async ({
  page,
}) => {
  const exchanges = posted(page, "auth/google");
  let resolutions: (string | null)[] = [];
  await open(page, "/en/login", page.getByRole("heading", { level: 1 }), async (page) => {
    await answer(page, "auth/google", 200, { ...TOKENS, account: "created" });
    resolutions = await signedInApi(page, {
      destination: "account_registration",
      account_registration: "not_started",
      mandatory: true,
    });
  });
  await expectProviderControls(page);
  // Google's side: the popup returns an ID token to the page's callback.
  await page.evaluate(() =>
    (
      window as unknown as { __gsiConfig: { callback: (r: { credential: string }) => void } }
    ).__gsiConfig.callback({ credential: "fixture-google-id-token" }),
  );
  await page.waitForURL("**/en/app/onboarding/account");
  expect(exchanges).toEqual([
    { id_token: "fixture-google-id-token", refresh_token_transport: "cookie" },
  ]);
  // A generic Google sign-in carries no intent: never a Fighter default.
  expect(resolutions.length).toBeGreaterThan(0);
  expect(resolutions.every((intent) => intent === null)).toBe(true);
});

test("Apple: the popup's identity token → POST /api/auth/apple → entry with the page's intent", async ({
  page,
}) => {
  const exchanges = posted(page, "auth/apple");
  let resolutions: (string | null)[] = [];
  await open(
    page,
    "/en/login?intent=gym",
    page.getByRole("heading", { level: 1 }),
    async (page) => {
      await answer(page, "auth/apple", 200, { ...TOKENS, account: "existing" });
      resolutions = await signedInApi(page, {
        destination: "gym_onboarding",
        account_registration: "complete",
        mandatory: false,
      });
    },
  );
  await expectProviderControls(page);
  // Apple's side: the popup answers with a token for the state the page generated.
  await page.evaluate(() => {
    const w = window as unknown as {
      __appleSignIn: (config: { state: string }) => Promise<unknown>;
    };
    w.__appleSignIn = (config) =>
      Promise.resolve({
        authorization: { id_token: "fixture-apple-id-token", state: config.state },
      });
  });
  await page.getByRole("button", { name: "Continue with Apple" }).click();
  await page.waitForURL("**/en/app/onboarding/gym?intent=gym");
  expect(exchanges).toHaveLength(1);
  expect(exchanges[0]).toMatchObject({
    id_token: "fixture-apple-id-token",
    refresh_token_transport: "cookie",
  });
  // The raw nonce goes to the API; Apple only ever saw its SHA-256.
  expect((exchanges[0] as { nonce: string }).nonce).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  expect(resolutions[0]).toBe("gym");
  await expect(page.getByRole("heading", { level: 1, name: "Gym setup" })).toBeVisible();
});

test("Apple cancelled: the popup closes, nothing is sent, the control is ready again", async ({
  page,
}) => {
  const exchanges = posted(page, "auth/apple");
  await open(page, "/en/login", page.getByRole("heading", { level: 1 }));
  await expectProviderControls(page);
  await page.evaluate(() => {
    (window as unknown as { __appleSignIn: () => Promise<unknown> }).__appleSignIn = () =>
      Promise.reject({ error: "popup_closed_by_user" });
  });
  const apple = page.getByRole("button", { name: "Continue with Apple" });
  await apple.click();
  await expect(apple).toBeEnabled();
  // No failure message (Next.js's empty route announcer is the only alert region).
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  expect(exchanges).toEqual([]);
  expect(new URL(page.url()).pathname).toBe("/en/login");
});

test("expired sign-in code: the API's code_expired, a new code, then sign-in completes", async ({
  page,
}) => {
  const resent = posted(page, "auth/email/sign-in");
  let attempts = 0;
  await open(page, "/en/login/code", page.getByRole("heading", { level: 1 }), async (page) => {
    await seedPending(page, "signIn");
    await answer(page, "auth/email/sign-in", 202, {
      expires_in_seconds: 600,
      resend_after_seconds: 60,
    });
    await page.route(
      (url) => url.pathname === "/api/auth/email/sign-in/verify" && url.port !== "3100",
      (call) => {
        attempts += 1;
        return attempts === 1
          ? call.fulfill({
              status: 422,
              json: { error: { code: "code_expired", message: "", details: {}, request_id: null } },
            })
          : call.fulfill({ json: TOKENS });
      },
    );
    await signedInApi(page, {
      destination: "fighter_onboarding",
      account_registration: "complete",
      mandatory: true,
    });
  });
  await codeInput(page).pressSequentially("528461");
  await expect(
    page.getByText("This code has expired. Send a new one to sign in.").last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Send a new code", exact: true }).first().click();
  await expect(
    page.getByText("We sent a new code. It expires in 10 minutes.").last(),
  ).toBeVisible();
  expect(resent).toEqual([{ email: "fighter@example.com" }]);
  await codeInput(page).pressSequentially("640213");
  await page.waitForURL("**/en/app/onboarding/fighter");
});

test("invalid registration code: the step stays, nothing navigates", async ({ page }) => {
  await open(page, "/en/signup/verify", page.getByRole("heading", { level: 1 }), async (page) => {
    await seedPending(page, "registration");
    await apiError(page, "auth/email/registrations/verify", 422, "code_invalid");
  });
  await codeInput(page).pressSequentially("482900");
  await expect(
    page.getByText("That code isn’t right. Check the digits and try again.").last(),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/en/signup/verify");
});

test("session restore: a signed-in visitor on /login enters through the resolver", async ({
  page,
}) => {
  let resolutions: (string | null)[] = [];
  await open(
    page,
    "/en/login?intent=sponsor",
    page
      .getByRole("heading", { level: 1, name: /Become a sponsor|Partner/ })
      .or(page.locator("main")),
    async (page) => {
      // The refresh cookie restores the session on load.
      await answer(page, "auth/session/refresh", 200, TOKENS);
      resolutions = await signedInApi(page, {
        destination: "sponsor_application",
        account_registration: "complete",
        mandatory: false,
      });
    },
  );
  await page.waitForURL("**/en/partners/apply");
  expect(resolutions[0]).toBe("sponsor");
});

const signedOut = (page: Page) =>
  page.route(
    (url) => url.pathname.startsWith("/api/") && url.port !== "3100",
    (call) =>
      call.fulfill({
        status: 401,
        json: { error: { code: "unauthorized", message: "", details: {}, request_id: null } },
      }),
  );

test("a signed-out visitor on an app route goes to sign-in with it as a safe returnTo", async ({
  page,
}) => {
  await signedOut(page);
  await page.goto("/en/app/messages");
  await page.waitForURL("**/en/login?returnTo=%2Fapp%2Fmessages");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
});

test("signed-out Fighter onboarding deep link → /login?intent=fighter → email sign-in → resolver(intent=fighter)", async ({
  page,
}) => {
  await signedOut(page);
  let resolutions: (string | null)[] = [];
  await answer(page, "auth/email/sign-in", 202, {
    expires_in_seconds: 600,
    resend_after_seconds: 60,
  });
  await answer(page, "auth/email/sign-in/verify", 200, TOKENS);
  resolutions = await signedInApi(page, {
    destination: "account_registration",
    account_registration: "not_started",
    mandatory: true,
  });
  await page.goto("/en/app/onboarding/fighter?step=basics&intent=fighter");
  // The onboarding URL is never a returnTo; its journey travels as the intent.
  await page.waitForURL((url) => url.pathname === "/en/login");
  expect(new URL(page.url()).search).toBe("?intent=fighter");
  await page.getByRole("textbox", { name: "Email" }).fill("fighter@example.com");
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await page.waitForURL("**/en/login/code?intent=fighter");
  await page.locator('[data-slot="code-input"]').pressSequentially("528461");
  // Account basics first (mandatory), with the Fighter journey riding along.
  await page.waitForURL("**/en/app/onboarding/account?intent=fighter");
  expect(resolutions[0]).toBe("fighter");
});

test("signed-out account onboarding with a Coach intent → /login?intent=coach", async ({
  page,
}) => {
  await signedOut(page);
  await page.goto("/en/app/onboarding/account?intent=coach&returnTo=%2Fapp%2Fmessages");
  await page.waitForURL((url) => url.pathname === "/en/login");
  // The onboarding page is not a returnTo; its explicit journey is kept.
  expect(new URL(page.url()).search).toBe("?intent=coach");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
});

test("an invalid intent on an onboarding deep link is dropped, never guessed", async ({ page }) => {
  await signedOut(page);
  await page.goto("/en/app/onboarding/role?intent=admin");
  await page.waitForURL((url) => url.pathname === "/en/login");
  expect(new URL(page.url()).search).toBe("");
});

for (const provider of ["Google", "Apple"] as const) {
  test(`${provider} on /login?intent=fighter: the resolver receives the Fighter intent`, async ({
    page,
  }) => {
    let resolutions: (string | null)[] = [];
    await open(
      page,
      "/en/login?intent=fighter",
      page.getByRole("heading", { level: 1 }),
      async (page) => {
        await answer(page, `auth/${provider.toLowerCase()}`, 200, {
          ...TOKENS,
          account: "existing",
        });
        resolutions = await signedInApi(page, {
          destination: "fighter_onboarding",
          account_registration: "complete",
          mandatory: true,
        });
      },
    );
    await expectProviderControls(page);
    if (provider === "Google") {
      await page.evaluate(() =>
        (
          window as unknown as { __gsiConfig: { callback: (r: { credential: string }) => void } }
        ).__gsiConfig.callback({ credential: "fixture-google-id-token" }),
      );
    } else {
      await page.evaluate(() => {
        (
          window as unknown as { __appleSignIn: (c: { state: string }) => Promise<unknown> }
        ).__appleSignIn = (config) =>
          Promise.resolve({
            authorization: { id_token: "fixture-apple-id-token", state: config.state },
          });
      });
      await page.getByRole("button", { name: "Continue with Apple" }).click();
    }
    await page.waitForURL("**/en/app/onboarding/fighter?intent=fighter");
    expect(resolutions[0]).toBe("fighter");
  });
}

test("a completed Fighter with a Fighter intent goes home, not back into onboarding", async ({
  page,
}) => {
  let resolutions: (string | null)[] = [];
  await open(page, "/en/login?intent=fighter", page.locator("body"), async (page) => {
    await answer(page, "auth/session/refresh", 200, TOKENS);
    resolutions = await signedInApi(page, {
      destination: "fighter_home",
      account_registration: "complete",
      mandatory: false,
      capabilities: ["FIGHTER"],
      fighter_profile: "completed",
    });
  });
  await page.waitForURL("**/en/app/home");
  expect(resolutions[0]).toBe("fighter");
});
