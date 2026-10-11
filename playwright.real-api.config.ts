import { defineConfig, devices } from "@playwright/test";

/*
 * Real-backend acceptance (SF-30): the new-Fighter journey on the production
 * build against a real simplefit-api and PostgreSQL, nothing mocked. A local
 * acceptance gate, not part of CI: it needs a running API on a disposable
 * database. See e2e/real-api/README.md for the setup.
 *
 *   E2E_REAL_API_URL       the API the web build was built against
 *   E2E_API_DIR            the simplefit-api checkout (reads the emailed code)
 *   E2E_API_DATABASE_URL   that API's disposable database ("e2e" in its name)
 *
 * Without E2E_REAL_API_URL every test is skipped.
 */
export default defineConfig({
  testDir: "e2e/real-api",
  outputDir: "test-results/real-api",
  // One journey per project; projects share the API's per-address limits.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    colorScheme: "dark",
    reducedMotion: "reduce",
    trace: "off",
    screenshot: "off",
  },
  projects: [
    {
      name: "chromium-1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "firefox-1280",
      use: { ...devices["Desktop Firefox"], viewport: { width: 1280, height: 720 } },
    },
    {
      name: "webkit-1920",
      use: { ...devices["Desktop Safari"], viewport: { width: 1920, height: 1080 } },
    },
    { name: "mobile-chromium-412", use: { ...devices["Pixel 7"] } },
    { name: "mobile-webkit-390", use: { ...devices["iPhone 14"] } },
  ],
  webServer: process.env.E2E_REAL_API_URL
    ? {
        // The production build, made with NEXT_PUBLIC_API_URL=$E2E_REAL_API_URL.
        command: "pnpm exec next start -p 3100",
        url: "http://127.0.0.1:3100/en",
        reuseExistingServer: false,
        timeout: 60_000,
      }
    : undefined,
});
