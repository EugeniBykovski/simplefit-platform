import { expect, test } from "@playwright/test";

import { onboardingApi } from "./onboarding-api";

/*
 * SF-80 on the production build: the E08 link as the email sends it
 * (`<web app>/invite/coach#token=…`, no locale) when no app opens it, and the
 * association files on a deployment that associates no app. The SF-57
 * preview is mocked at the network edge; route, proxy and page are real.
 * The token is a fixture.
 */

const TOKEN = `sfi_${"E2eFixture".repeat(4)}abc`;
const PREVIEW = {
  invitation: {
    coach: { display_name: "Coach Marek", brand_name: "Marek Boxing" },
    expires_at: "2026-10-30T10:00:00Z",
    message: null,
  },
  disclosure: {
    version: "e2e-disclosure-v1",
    fields: ["display_name", "username"],
    never_shared: ["date_of_birth", "email"],
  },
  // The backend's approved text (SF-72): an E2E fixture, never legal copy.
  document: {
    document_id: "fighter-coach-disclosure",
    version: "e2e-disclosure-v1",
    status: "published",
    effective_at: "2026-01-01T00:00:00Z",
    published_at: "2026-01-01T00:00:00Z",
    requested_language: "en",
    language: "en",
    available_languages: ["en"],
    content_sha256: "f".repeat(64),
    title: "E2E fixture disclosure",
    summary: "E2E FIXTURE, not a legal text. {coach} sees the items listed above.",
    checkbox: "E2E FIXTURE: I agree that {coach} sees the information listed above.",
    full: null,
  },
};

test("the emailed link keeps working in the browser: the token survives the locale redirect and goes only into the preview body", async ({
  page,
}) => {
  await onboardingApi(page, { signedOut: true });
  const bodies: (string | null)[] = [];
  await page.route(
    (url) => url.port !== "3100" && url.pathname === "/api/v1/coach-invitations/preview",
    (route) => {
      bodies.push(route.request().postData());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(PREVIEW),
      });
    },
  );
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));

  await page.goto(`/invite/coach#token=${TOKEN}`);
  await page
    .getByRole("heading", { level: 1, name: "Coach Marek invited you to connect on SimpleFit." })
    .waitFor();

  const url = new URL(page.url());
  expect(url.pathname).toBe("/en/invite/coach");
  expect(url.hash).toBe("");
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toContain(TOKEN);
  // Never in a request line: not the document, not the redirect, not the API.
  expect(urls.filter((requested) => requested.includes("sfi_"))).toEqual([]);
  expect(await page.content()).not.toContain(TOKEN);
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
});

test("no association files while no app is associated: 404, never a redirect or a locale", async ({
  request,
}) => {
  for (const path of ["/.well-known/apple-app-site-association", "/.well-known/assetlinks.json"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
    expect(response.headers().location, path).toBeUndefined();
  }
});
