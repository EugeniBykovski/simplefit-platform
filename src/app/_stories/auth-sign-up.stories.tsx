import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

import { SignupAccountScreen } from "@/widgets/auth-screens";

import { apiError, installApi } from "./auth-story-api";

/*
 * WA3 (WebRegAccount.dc.html).
 * Deferred to SF-25: the role choice, full name, consent checkboxes and
 * "What happens next"; they are not rendered.
 */
export default {
  title: "Authentication/Sign Up",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export const CreateAccount: StoryObj = {
  name: "Create account (WA3)",
  render: () => <SignupAccountScreen />,
};

export const CreateAccountError: StoryObj = {
  name: "Create account (WA3) · error",
  render: () => <SignupAccountScreen />,
  beforeEach: () =>
    installApi({ "/api/auth/email/registrations": apiError(503, "service_unavailable") }),
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Email"), "yauheni@example.com");
    await userEvent.click(canvas.getByRole("button", { name: "Create account" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Something went wrong");
  },
};
