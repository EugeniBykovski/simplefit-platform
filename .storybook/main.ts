import type { StorybookConfig } from "@storybook/nextjs-vite";

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
