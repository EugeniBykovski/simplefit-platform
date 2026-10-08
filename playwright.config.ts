import { defineConfig, devices } from "@playwright/test";

/*
 * Geometry QA (SF-34): measures the production components in the static
 * Storybook build (`pnpm storybook:build`) at the Claude Design web frame,
 * 1440 × 900, and checks the canonical layout values. It does not prove
 * pixel parity with the artboards; the side-by-side Design QA does
 * (docs/design-handoff.md §11). Screenshots are kept for that comparison.
 */
export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:6007",
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    // Freezes the design's motion so measurements and screenshots are stable.
    reducedMotion: "reduce",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: ["production/**", "portability/**"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        // Headless Chromium on Linux (CI) defaults to full hinting, which
        // snaps every glyph advance to a whole pixel: 13 px Manrope runs ~4 %
        // wide and 12 px narrow, so right-aligned text and line breaks move.
        // Unhinted outlines render the fractional advances the artboards were
        // measured with (Chrome on macOS; `slight`, the Linux desktop default,
        // is identical).
        launchOptions: { args: ["--font-render-hinting=none"] },
      },
    },
    {
      // SF-42: the actual production routes (next start), at every desktop and
      // laptop width. The backend is mocked at the network edge.
      name: "production",
      testMatch: "production/**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:3100",
        launchOptions: { args: ["--font-render-hinting=none"] },
      },
    },
    // SF-38: browser-engine portability of production behaviour that rests on
    // engine data (the country list comes from each engine's region names).
    ...(
      [
        ["chromium", devices["Desktop Chrome"]],
        ["firefox", devices["Desktop Firefox"]],
        ["webkit", devices["Desktop Safari"]],
      ] as const
    ).map(([engine, device]) => ({
      name: `portability-${engine}`,
      testMatch: "portability/**/*.spec.ts",
      use: { ...device, baseURL: "http://127.0.0.1:3100" },
    })),
  ],
  webServer: [
    {
      command: "node scripts/serve-static.mjs storybook-static 6007",
      url: "http://127.0.0.1:6007/index.json",
      reuseExistingServer: !process.env.CI,
    },
    {
      // The production build (`pnpm build`, run before this suite in CI).
      command: "pnpm exec next start -p 3100",
      url: "http://127.0.0.1:3100/en",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
