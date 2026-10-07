import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { LoginScreen } from "@/widgets/auth-screens";

/*
 * WA1 "Sign in" as the page renders it: the full production auth layout
 * (AuthSplitFrame inside the canonical 1440 px Container frame), at the
 * designed frame and wider, where it must stay centred.
 */
const meta = {
  title: "Authentication/Login",
  component: LoginScreen,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
} satisfies Meta<typeof LoginScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FullPage: Story = {
  name: "Full Page",
  globals: { viewport: { value: "desktop", isRotated: false } },
};

export const FullPageWide: Story = {
  name: "Full Page · 1920",
  globals: { viewport: { value: "wide", isRotated: false } },
};

export const FullPageTablet: Story = {
  name: "Full Page · 768",
  globals: { viewport: { value: "tablet", isRotated: false } },
};
