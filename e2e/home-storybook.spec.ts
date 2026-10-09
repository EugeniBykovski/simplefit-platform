import { expect, test, type Locator, type Page } from "@playwright/test";

/*
 * The Fighter home stories (SF-40) on the static Storybook build: each renders
 * the route's composition (session gate, Fighter gate, Fighter shell, widget)
 * in its state, through its play function, with no request leaving the page
 * (the backend is a per-story double).
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
    `/iframe.html?id=fighter-home-first-run--${id}&viewMode=story&globals=theme:Dark`,
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

const heading = (name: string | RegExp) => (page: Page) =>
  page.getByRole("heading", { level: 1, name });
const text = (value: string) => (page: Page) => page.getByText(value).first();
const tour = (page: Page) => page.getByRole("dialog");
const tourStep = (name: string) => (page: Page) => page.getByRole("dialog", { name });

for (const [id, shown] of [
  ["first-run", heading("Welcome to SimpleFit, Yauheni B.")],
  ["loading", (page: Page) => page.getByRole("status").first()],
  ["failure", (page: Page) => page.getByRole("button", { name: "Try again" })],
  ...(
    [
      "Start here",
      "Your Live Board",
      "Fight camp, week by week",
      "See your progress",
      "Your people",
      "Coaches, gyms and programs",
      "Your week and your chats",
      "You decide who sees what",
      "One account, every role",
    ] as const
  ).map((name, at) => [`step-${at + 1}`, tourStep(name)] as const),
  ["back-next", tourStep("Your Live Board")],
  ["tour-saving", (page: Page) => tour(page).locator("[aria-busy=true]")],
  ["tour-failed", (page: Page) => tour(page).getByRole("alert")],
  ["tour-retry", tourStep("You know your way around")],
  ["tour-complete", tourStep("You know your way around")],
  ["tour-completed", heading(/^Good /)],
  ["tour-dismissed", heading(/^Good /)],
  ["returning", heading(/^Good /)],
  ["returning-dismissed", heading(/^Good /)],
  ["replay", heading(/^Good /)],
  ["missing-target", tourStep("Your Live Board")],
  ["longer-labels", text("Richte deine Ecke ein")],
] as const satisfies readonly (readonly [string, (page: Page) => Locator])[]) {
  test(id, async ({ page }) => {
    const outside = await story(page, id);
    await expect(shown(page)).toBeAttached({ timeout: 15_000 });
    expect(outside).toEqual([]);
  });
}

test("step-2: the spotlight sits on the real Live Board item", async ({ page }) => {
  await story(page, "step-2");
  await expect(tourStep("Your Live Board")(page)).toBeVisible({ timeout: 15_000 });
  const item = await page.locator("aside [data-nav-item=board]").boundingBox();
  const spot = await page.locator("[data-tour-spotlight]").boundingBox();
  if (!item || !spot) throw new Error("not rendered");
  expect(Math.abs(spot.x - (item.x - 4))).toBeLessThanOrEqual(1);
  expect(Math.abs(spot.y - (item.y - 4))).toBeLessThanOrEqual(1);
});

test("narrow: the tour is centred at 390, nothing wider than the window", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await story(page, "narrow");
  await expect(tourStep("Your Live Board")(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-tour-spotlight]")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
