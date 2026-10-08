import { expect, test, type Locator, type Page } from "@playwright/test";

/*
 * The WA6 Where to start stories (SF-47) on the static Storybook build: each
 * renders the route's composition (session gate, onboarding gate, widget) in
 * its state, through its play function, with no request leaving the page
 * (the resolver is a per-story double). Hover and keyboard focus are real
 * browser input here, which a play function cannot give CSS.
 */

async function story(page: Page, id: string) {
  const outside: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      if (!url.hostname.endsWith("fonts.gstatic.com")) outside.push(request.url());
    }
  });
  await page.goto(
    `/iframe.html?id=account-registration-where-to-start--${id}&viewMode=story&globals=theme:Dark`,
  );
  await page.waitForFunction(() =>
    ["sb-show-main", "sb-show-errordisplay"].some((name) => document.body.classList.contains(name)),
  );
  expect(await page.evaluate(() => document.body.classList.contains("sb-show-errordisplay"))).toBe(
    false,
  );
  return outside;
}

test.use({ viewport: { width: 1440, height: 980 } });

const checked = (value: string) => (page: Page) =>
  page.locator(`input[name=journey][value=${value}]:checked`);
const button = (name: string) => (page: Page) => page.getByRole("button", { name });
const text = (value: string) => (page: Page) => page.getByText(value).first();

for (const [id, shown] of [
  ["default", text("Choose one to continue.")],
  ["fighter-selected", checked("fighter")],
  ["coach-selected", checked("coach")],
  ["gym-selected", checked("gym")],
  ["sponsor-selected", checked("sponsor")],
  ["keyboard-interaction", checked("coach")],
  ["resolving", button("Opening…")],
  ["resolver-error", text("We couldn’t open that setup.")],
  ["retry", button("Opening…")],
  ["unexpected-destination", text("This version of SimpleFit can’t open it yet.")],
  ["longer-labels", text("Was möchtest du zuerst einrichten?")],
] as const satisfies readonly (readonly [string, (page: Page) => Locator])[]) {
  test(id, async ({ page }) => {
    const outside = await story(page, id);
    await expect(shown(page)).toBeAttached({ timeout: 15_000 });
    expect(outside).toEqual([]);
  });
}

test("fighter-hovered: the card's border answers a real pointer", async ({ page }) => {
  await story(page, "default");
  const card = page.locator("[data-journey=fighter]");
  await card.waitFor();
  const resting = await card.evaluate((el) => getComputedStyle(el).borderColor);
  await card.hover();
  await expect
    .poll(() => card.evaluate((el) => getComputedStyle(el).borderColor))
    .not.toBe(resting);
});

test("fighter-focused: keyboard focus draws the ring on the card", async ({ page }) => {
  await story(page, "default");
  const card = page.locator("[data-journey=fighter]");
  await card.waitFor();
  await page.locator("[data-step-nav]").click({ position: { x: 5, y: 5 } });
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    if (await page.locator("input[value=fighter]").evaluate((el) => el === document.activeElement))
      break;
  }
  await expect(page.locator("input[value=fighter]")).toBeFocused();
  expect(await card.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
});

test("narrow: one column at 390, nothing wider than the window", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await story(page, "narrow");
  await expect(checked("sponsor")(page)).toBeAttached({ timeout: 15_000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
