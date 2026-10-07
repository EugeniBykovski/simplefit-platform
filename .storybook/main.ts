import type { StorybookConfig } from "@storybook/nextjs-vite";

/*
 * Public runtime configuration of the workshop (SF-34). Production modules
 * validate NEXT_PUBLIC_API_URL when they are imported
 * (src/shared/config/env.ts), and stories that render a shell import them.
 * The Next.js Vite plugin inlines NEXT_PUBLIC_* from this process's
 * environment, which takes precedence over .env files. The workshop never
 * calls a real API, so it is pinned to the non-secret local default of
 * .env.example: a build is the same on a developer machine, whatever its .env
 * files hold, and in CI, which has none.
 */
process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000";
/*
 * Auth providers are never configured in the workshop (SF-24): Google and
 * Apple render their "not available" fallback instead of loading Google
 * Identity Services or Apple JS, whatever the local .env files hold. Blank
 * means "not configured" (src/shared/config/env.ts).
 */
process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "";
process.env.NEXT_PUBLIC_APPLE_SERVICES_ID = "";
process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI = "";

/*
 * Storybook is the development, documentation and visual-QA workshop for the
 * production design system (docs/design-system.md#storybook). Stories render
 * the real primitives from src/shared/ui with the real tokens, fonts and
 * Tailwind build; nothing here defines styles or token values of its own.
 */
const config: StorybookConfig = {
  framework: "@storybook/nextjs-vite",
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "@storybook/addon-themes"],
  staticDirs: [],
  core: { disableTelemetry: true },
};

export default config;
