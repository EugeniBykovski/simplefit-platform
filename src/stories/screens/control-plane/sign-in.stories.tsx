import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, fn, userEvent, within } from "storybook/test";

import { ControlPlaneEntry } from "@/features/control-plane-entry";
import { RequireSession } from "@/features/session-gate";
import { signInRouteFor } from "@/shared/routes/routes";
import {
  apiError,
  installApi,
  ok,
  SESSION,
  VIEWER,
  type Answer,
} from "@/stories/support/auth-story-api";
import { AdminWorkspace, ControlPlaneWelcome } from "@/widgets/admin-workspace";
import { AdminPasswordScreen, AdminSignInScreen } from "@/widgets/auth-screens";
import { LaunchScreen, SessionFailure } from "@/widgets/system-states";

/*
 * SF-157: the Control Plane email and password sign-in (AD0 `handoff`), setting
 * or resetting a password (AD0P), and the Control Plane opened at session
 * assurance for an operator without keys. No artboard draws them (D-SF157-05):
 * interim compositions in AD0's card language. `fetch` is replaced per story;
 * nothing reaches a backend and no browser ceremony runs.
 */

const EMAIL = "founder@example.com";
const PASSWORD = "correct horse battery staple";

const signInStory = (answer?: Answer): StoryObj => ({
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: "/en/admin/login", segments: [] } },
  },
  beforeEach: () =>
    installApi(answer === undefined ? {} : { "POST /api/auth/password/sign-in": answer }),
  render: () => <AdminSignInScreen continuation={{ returnTo: "/admin" }} />,
  ...(answer === undefined
    ? {}
    : {
        play: async ({ canvasElement }) => {
          const canvas = within(canvasElement);
          await userEvent.type(canvas.getByLabelText("Email"), EMAIL);
          await userEvent.type(canvas.getByLabelText("Password"), PASSWORD);
          await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));
          await expect(await canvas.findByRole("alert", {}, { timeout: 5000 })).toBeVisible();
        },
      }),
});

export const SignIn = signInStory();
SignIn.name = "AD0 · email and password";
export const SignInInvalid = signInStory(apiError(422, "invalid_credentials"));
SignInInvalid.name = "AD0 · invalid credentials";
export const SignInThrottled = signInStory(apiError(429, "rate_limited", { "retry-after": "60" }));
SignInThrottled.name = "AD0 · throttled";
export const SignInSuspended = signInStory(apiError(403, "account_suspended"));
SignInSuspended.name = "AD0 · account suspended";
export const SignInOffline = signInStory("offline");
SignInOffline.name = "AD0 · network failure";

const passwordStory = (play?: StoryObj["play"], confirm: Answer = { status: 204 }): StoryObj => ({
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/en/admin/login/password", segments: [] },
    },
  },
  beforeEach: () =>
    installApi({
      "POST /api/auth/password/reset": ok(
        { expires_in_seconds: 600, resend_after_seconds: 60 },
        202,
      ),
      "POST /api/auth/password/reset/confirm": confirm,
    }),
  render: () => <AdminPasswordScreen continuation={{ returnTo: "/admin" }} />,
  play,
});

const toCode: StoryObj["play"] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.type(canvas.getByLabelText("Email"), EMAIL);
  await userEvent.click(canvas.getByRole("button", { name: "Email me a code" }));
  await expect(
    await canvas.findByLabelText("Code from the email", {}, { timeout: 5000 }),
  ).toBeVisible();
};

const submitCode =
  (code: string, password: string): StoryObj["play"] =>
  async (context) => {
    await toCode?.(context);
    const canvas = within(context.canvasElement);
    await userEvent.type(canvas.getByLabelText("Code from the email"), code);
    await userEvent.type(canvas.getByLabelText("New password"), password);
    await userEvent.click(canvas.getByRole("button", { name: "Set password" }));
  };

export const PasswordEmail = passwordStory();
PasswordEmail.name = "AD0P · email";
export const PasswordCode = passwordStory(toCode);
PasswordCode.name = "AD0P · code and new password";
export const PasswordWrongCode = passwordStory(
  async (context) => {
    await submitCode("111111", PASSWORD)?.(context);
    await expect(
      await within(context.canvasElement).findByRole("alert", {}, { timeout: 5000 }),
    ).toBeVisible();
  },
  apiError(422, "code_invalid"),
);
PasswordWrongCode.name = "AD0P · wrong code";
export const PasswordWeak = passwordStory(async (context) => {
  await submitCode("604218", "short")?.(context);
  await expect(
    await within(context.canvasElement).findByRole("alert", {}, { timeout: 5000 }),
  ).toBeVisible();
});
PasswordWeak.name = "AD0P · password too short";
export const PasswordDone = passwordStory(async (context) => {
  await submitCode("604218", PASSWORD)?.(context);
  await expect(
    await within(context.canvasElement).findByText(/Your password is set/, {}, { timeout: 5000 }),
  ).toBeVisible();
});
PasswordDone.name = "AD0P · done";

// The Control Plane at session assurance: a pending operator without keys.

const pending = ok({
  operator: {
    id: "5b0c7f1e-3a2d-4c6b-9e8f-1d2a3b4c5d6e",
    status: "pending_enrollment",
    permissions: ["operators.read", "operators.manage", "audit.read"],
    security_keys: { registered: 0, required: 2 },
    step_up: null,
    enrollment_expires_at: new Date(Date.now() + 20 * 3_600_000).toISOString(),
    activated_at: null,
  },
});

export const PendingOperator: StoryObj = {
  name: "Control Plane · pending operator (keys not registered)",
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/en/admin/welcome", segments: [] },
    },
  },
  beforeEach: () =>
    installApi({
      "/api/me": ok({ user: VIEWER }),
      "/api/auth/session/refresh": ok(SESSION),
      "/api/v1/admin/me": pending,
      "/api/v1/me/first-run": ok({
        experiences: [
          { experience: "control_plane_web_tour", status: "pending", recorded_at: null },
        ],
      }),
    }),
  render: () => (
    <RequireSession
      signIn={signInRouteFor("web.admin")}
      pending={<LaunchScreen />}
      unavailable={<SessionFailure />}
    >
      <AdminWorkspace>
        <ControlPlaneWelcome />
      </AdminWorkspace>
    </RequireSession>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        /security keys aren’t registered yet/,
        {},
        { timeout: 5000 },
      ),
    ).toBeVisible();
  },
};

export const EnrollOnDemand: StoryObj = {
  name: "AD0 · enroll, asked by an action (back to the Control Plane)",
  render: () => (
    <ControlPlaneEntry
      view={{ kind: "enroll", registered: 0, required: 2 }}
      onUseKey={fn()}
      onRegister={fn()}
      onCancel={fn()}
      onRecovery={fn()}
      onBack={fn()}
      onContinue={fn()}
      onRetry={fn()}
      onLeave={fn()}
    />
  ),
};

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

const meta = {
  title: "Control Plane/Password sign-in",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;
