import { createRequire } from "node:module";

import { expect, type Locator, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);

/*
 * The production geometry harness (SF-42, SF-36): the actual routes on the
 * production build (`next start`), with the network mocked at the edge. The
 * session restore answers 401 (a signed-out visitor), and the Google and
 * Apple scripts are replaced by minimal stand-ins of the APIs the page calls
 * (Google's button is drawn at its documented large size: the requested
 * width × 40 px), so the routes render their signed-out composition, provider
 * row included, without live services.
 */

/**
 * `google.accounts.id` and `AppleID.auth`: only what the provider buttons call.
 * They record what the page passes (`__gsiConfig`, `__appleConfig`), so a test
 * can play the provider's side: `googleCredential` calls the page's GSI
 * callback, and `appleAnswers` decides how Apple's popup resolves.
 */
const PROVIDER_STUBS = {
  google: `window.google = { accounts: { id: {
    initialize(config) { window.__gsiConfig = config; }, disableAutoSelect() {},
    renderButton(parent, options) {
      const button = document.createElement("div");
      button.dataset.gsiStub = "";
      button.style.cssText = "width:" + options.width + "px;height:40px;outline:1px dashed;border-radius:20px";
      parent.append(button);
    },
  } } };`,
  apple: `window.AppleID = { auth: {
    init(config) { window.__appleConfig = config; },
    signIn: () => window.__appleSignIn ? window.__appleSignIn(window.__appleConfig) : new Promise(() => {}),
  } };`,
};

/**
 * Desktop and laptop windows, width × height: the common laptop sizes
 * (1280 × 720 is the shortest supported) and the 1440 × 900 artboard.
 */
export const VIEWPORTS = [
  [1280, 720],
  [1280, 800],
  [1366, 768],
  [1440, 900],
  [1512, 982],
  [1728, 1117],
  [1920, 1080],
] as const;

/**
 * Opens a production route as a signed-out visitor. `setup` runs after the
 * default mocks and before navigation: a route registered there takes
 * precedence (Playwright matches the most recent route first), and an init
 * script there runs before the page's own code.
 */
export async function open(
  page: Page,
  route: string,
  ready: Locator,
  setup?: (page: Page) => Promise<void>,
) {
  await page.route(
    (url) => url.pathname.startsWith("/api/") && url.port !== "3100",
    (call) =>
      call.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "unauthorized", message: "", details: {}, request_id: null },
        }),
      }),
  );
  await page.route(/accounts\.google\.com/, (call) =>
    call.fulfill({ contentType: "text/javascript", body: PROVIDER_STUBS.google }),
  );
  await page.route(/appleid\.cdn-apple\.com/, (call) =>
    call.fulfill({ contentType: "text/javascript", body: PROVIDER_STUBS.apple }),
  );
  await setup?.(page);
  await page.goto(route);
  await ready.waitFor();
  await page.evaluate(() => document.fonts.ready);
}

/**
 * The provider row is measured with Google's and Apple's controls rendered,
 * which needs a build with their public IDs (CI sets fixture IDs). A build
 * without them renders the "not available" lines and requests no script, so
 * no stand-in could ever appear: fail with the reason instead of a timeout.
 */
export async function expectProviderControls(page: Page) {
  for (const line of [
    "Google sign-in is not available right now.",
    "Apple sign-in is not available here.",
  ]) {
    if (await page.getByText(line).isVisible()) {
      throw new Error(
        `The production build has no provider IDs ("${line}"): build with ` +
          "NEXT_PUBLIC_GOOGLE_CLIENT_ID, NEXT_PUBLIC_APPLE_SERVICES_ID and " +
          "NEXT_PUBLIC_APPLE_REDIRECT_URI set (see the CI production build step).",
      );
    }
  }
  await page.locator("[data-gsi-stub]").waitFor();
}

export async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error("element is not visible");
  return rect;
}

/** Within 1 px: browsers place fractional boxes on device pixels. */
export async function expectBox(
  locator: Locator,
  expected: Partial<Record<"x" | "y" | "w" | "h", number>>,
) {
  const r = await box(locator);
  const actual = { x: r.x, y: r.y, w: r.width, h: r.height };
  for (const [key, value] of Object.entries(expected) as [keyof typeof actual, number][]) {
    expect(
      Math.abs(actual[key] - value),
      `${key} ${JSON.stringify(actual)} vs ${value}`,
    ).toBeLessThanOrEqual(1);
  }
}

export const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** How far the document is taller than the window (0: nothing to scroll). */
export const verticalOverflow = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );

/** Entirely inside the window: neither clipped by an edge nor below the fold. */
export async function expectInView(locator: Locator, width: number, height: number) {
  const r = await box(locator);
  expect(r.x, "left edge").toBeGreaterThanOrEqual(0);
  expect(r.y, "top edge").toBeGreaterThanOrEqual(0);
  expect(r.x + r.width, "right edge").toBeLessThanOrEqual(width + 0.5);
  expect(r.y + r.height, "bottom edge").toBeLessThanOrEqual(height + 0.5);
}

/** `upper` ends above where `lower` starts: the composition's reading order. */
export async function expectAbove(upper: Locator, lower: Locator) {
  const [a, b] = [await box(upper), await box(lower)];
  expect(a.y + a.height).toBeLessThanOrEqual(b.y + 0.5);
}

/** Answers `POST /api/<path>` with the API's error envelope (clients branch on `code`). */
export async function apiError(page: Page, path: string, status: number, code: string) {
  await page.route(
    (url) => url.pathname === `/api/${path}` && url.port !== "3100",
    (call) =>
      call.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ error: { code, message: "", details: {}, request_id: null } }),
      }),
  );
}

/** Answers `POST /api/<path>` with a JSON body. */
export async function apiOk(page: Page, path: string, body: unknown, status = 200) {
  await page.route(
    (url) => url.pathname === `/api/${path}` && url.port !== "3100",
    (call) => call.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }),
  );
}

/**
 * The tab's pending email challenge, as the email step leaves it in
 * `sessionStorage` before navigating to the code step (features/email-auth
 * `pending`): the code routes then open the way a visitor reaches them. The
 * address is a fixture; the registration token is worthless without a code.
 */
export async function seedPending(page: Page, kind: "signIn" | "registration") {
  const key =
    kind === "signIn" ? "simplefit.auth.email-sign-in" : "simplefit.auth.email-registration";
  const value = {
    email: "fighter@example.com",
    // The resend countdown at its start, as right after the request.
    resendAt: Date.now() + 60_000,
    ...(kind === "registration" ? { registrationToken: "geometry-fixture" } : {}),
  };
  await page.addInitScript(
    ([storageKey, json]) => {
      try {
        if (!window.sessionStorage.getItem(storageKey)) {
          window.sessionStorage.setItem(storageKey, json);
        }
      } catch {
        // Frames without storage (about:blank) never render the code step.
      }
    },
    [key, JSON.stringify(value)] as const,
  );
}

/** axe-core's WCAG 2.1 A / AA and best-practice findings for the page, as `rule (nodes)`. */
export async function axeViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  return page.evaluate(async () => {
    const { violations } = await (
      window as unknown as {
        axe: {
          run: (
            context: Document,
            options: object,
          ) => Promise<{ violations: { id: string; nodes: unknown[] }[] }>;
        };
      }
    ).axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
      },
    });
    return violations.map((violation) => `${violation.id} (${violation.nodes.length})`);
  });
}
