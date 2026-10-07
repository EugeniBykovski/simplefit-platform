import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { AppleSignInButton } from "@/features/sign-in-with-apple";
import { GoogleSignInButton } from "@/features/sign-in-with-google";

/*
 * Google (SF-22) and Apple (SF-23) as Storybook renders them: without
 * provider configuration, so no live provider script is ever loaded here.
 * The interactive states (exchanging, cancelled, rejected, rate limited,
 * unavailable, script failed, success through the shared session pipeline)
 * are covered by the buttons' unit tests with stubbed Google Identity
 * Services and Apple JS.
 */
const meta = {
  title: "Authentication/Provider States",
  parameters: { nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <div className="flex max-w-110 flex-col gap-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;

export const NotConfigured: StoryObj = {
  render: () => (
    <>
      <GoogleSignInButton />
      <AppleSignInButton />
    </>
  ),
};
