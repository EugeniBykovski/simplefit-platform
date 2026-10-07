import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

import { LoginScreen } from "@/widgets/auth-screens";

import { apiError, installApi, ok } from "./auth-story-api";

/*
 * WA1 "Sign in" (Claude Design WebLogin.dc.html, 1440). Google and Apple
 * render their production fallback here: Storybook never loads a live
 * provider script (see Authentication/Provider States).
 */
const meta = {
  title: "Authentication/Sign In",
  component: LoginScreen,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  globals: { viewport: { value: "desktop", isRotated: false } },
  beforeEach: () =>
    installApi({
      "/api/auth/email/sign-in": ok({ expires_in_seconds: 600, resend_after_seconds: 60 }, 202),
    }),
} satisfies Meta<typeof LoginScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Phone: Story = { globals: { viewport: { value: "phone", isRotated: false } } };

export const InvalidEmail: Story = {
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Email"), "not-an-email");
    await userEvent.click(canvas.getByRole("button", { name: "Email me a sign-in code" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Enter a valid email address.",
    );
  },
};

export const RateLimited: Story = {
  beforeEach: () =>
    installApi({
      "/api/auth/email/sign-in": apiError(429, "rate_limited", { "retry-after": "30" }),
    }),
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Email"), "yauheni@example.com");
    await userEvent.click(canvas.getByRole("button", { name: "Email me a sign-in code" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Too many attempts");
  },
};

export const Sending: Story = {
  beforeEach: () => installApi({ "/api/auth/email/sign-in": "pending" }),
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Email"), "yauheni@example.com");
    await userEvent.click(canvas.getByRole("button", { name: "Email me a sign-in code" }));
    await expect(canvas.getByRole("button", { name: "Email me a sign-in code" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  },
};
