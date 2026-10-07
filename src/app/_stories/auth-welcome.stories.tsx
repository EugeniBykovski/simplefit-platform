import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SignupScreen } from "@/widgets/auth-screens";

/*
 * O02w "Join the boxing community" (WebSignUp.dc.html), the web welcome. The
 * page renders it in the public site header and footer. The role cards are
 * descriptive; choosing a role is deferred to SF-25.
 */
const meta = {
  title: "Authentication/Welcome",
  component: SignupScreen,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta<typeof SignupScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
