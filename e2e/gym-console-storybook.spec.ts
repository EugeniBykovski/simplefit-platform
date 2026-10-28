import { expect, test, type Page } from "@playwright/test";

/*
 * The gym console stories (SF-88) on the static Storybook build: each renders
 * the production route composition in its state, through its play function,
 * with no request leaving the page (the API is a per-story double), in the
 * dark and light themes.
 */

const STORYBOOK = "http://127.0.0.1:6007";

async function story(page: Page, id: string, theme: "Dark" | "Light" = "Dark") {
  const outside: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      if (!url.hostname.endsWith("fonts.gstatic.com")) outside.push(request.url());
    }
  });
  await page.goto(
    `${STORYBOOK}/iframe.html?id=gym-console-console-and-chooser--${id}&viewMode=story&globals=theme:${theme}`,
  );
  await page.waitForFunction(() =>
    ["sb-show-main", "sb-show-errordisplay"].some((name) => document.body.classList.contains(name)),
  );
  expect(await page.evaluate(() => document.body.classList.contains("sb-show-errordisplay"))).toBe(
    false,
  );
  return outside;
}

test.use({ viewport: { width: 1440, height: 900 } });

for (const [id, text] of [
  ["owner-dashboard", "Box every day. Everyone welcome."],
  ["owner-light", "Ring One Boxing"],
  ["long-name", "Bokserski Klub Sportowy"],
  ["manager", "The Manager dashboard isn’t available yet."],
  ["coach", "The Coach dashboard isn’t available yet."],
  ["front-desk", "The Front desk dashboard isn’t available yet."],
  ["not-available", "This gym isn’t available"],
  ["restricted", "Your role doesn’t include this"],
  ["draft", "This gym isn’t set up yet"],
  ["offline", "Try again"],
  ["retry", "Ring One Boxing"],
  ["details-failed", "We couldn’t load the gym details."],
  ["switcher-open", "Your gyms"],
  ["german-owner", "Dein Gym"],
  ["chooser-several", "Which gym do you want to open?"],
  ["chooser-with-draft", "Setup in progress"],
  ["chooser-none", "You don’t work at a gym yet"],
  ["chooser-many", "Gym 26"],
  ["first-run-not-started", "Welcome to your gym console"],
  ["first-run-in-progress", "Pick up the introduction"],
  ["first-run-unavailable", "We couldn’t load your introduction and checklist."],
  ["first-run-start-failed", "We couldn’t save that. Nothing changed."],
  ["first-run-skip-confirm", "Skip the introduction?"],
  ["first-run-dismissed", "Introduction skipped."],
  ["tour-step-1", "Your opening checklist"],
  ["tour-step-2", "Your gym and your access"],
  ["tour-step-3", "Tools arrive in this menu"],
  ["tour-step-4", "One account, every role"],
  ["tour-done", "You know your way around"],
  ["tour-finish-failed", "We couldn’t save that"],
  ["tour-end-confirm", "End the introduction?"],
  ["first-run-light", "Welcome to your gym console"],
  ["first-run-german", "Einführung fortsetzen"],
] as const) {
  test(`${id}: ${text}`, async ({ page }) => {
    const outside = await story(page, id);
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
    expect(outside).toEqual([]);
  });
}

test("switching: the chosen gym says it is opening", async ({ page }) => {
  await story(page, "switching");
  await expect(page.getByRole("status", { name: "Opening…" })).toBeVisible({ timeout: 15_000 });
});

test("first-run-loading: the introduction and checklist load beside the gym", async ({ page }) => {
  const outside = await story(page, "first-run-loading");
  await expect(page.getByLabel("Loading your introduction and checklist")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Ring One Boxing").first()).toBeVisible();
  expect(outside).toEqual([]);
});

test("loading: the skeleton, never another gym's content", async ({ page }) => {
  await story(page, "loading");
  await expect(page.locator("[data-gym-dashboard]")).toHaveCount(0);
  await expect(page.getByText("Ring One Boxing")).toHaveCount(0);
});

test("the WG1 story keeps the artboard's shell geometry (1440 × 900)", async ({ page }) => {
  await story(page, "owner-dashboard");
  await page.getByText("Box every day. Everyone welcome.").waitFor();
  const aside = await page.getByRole("complementary").boundingBox();
  expect(aside?.width).toBe(240);
  const header = await page.locator("main header").first().boundingBox();
  // The 76 px header row and its 1 px hairline (PageHeader, as on every page).
  expect(Math.abs((header?.height ?? 0) - 76)).toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
});
