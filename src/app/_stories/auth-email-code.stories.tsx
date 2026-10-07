import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

import { LoginCodeScreen, SignupVerifyScreen } from "@/widgets/auth-screens";

import { apiError, installApi, ok, seedPending, SESSION, VIEWER } from "./auth-story-api";

/*
 * The shared 6-digit code step in every designed state: WA1b sign-in
 * (WebSignInCode.dc.html: sent, typing, resent, invalid, expired, submitting,
 * success, throttled, error) and WA4 sign-up verification
 * (WebRegVerify.dc.html: typing, invalid, expired, submitting, verified,
 * verified-elsewhere, throttled). States come from the API adapter, never
 * from story-only props.
 */
export default {
  title: "Authentication/Email Code",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

const CODE = "528461";
const signedIn = { "/api/me": ok({ user: VIEWER }), "/api/auth/session/refresh": ok(SESSION) };

function signInStory(
  verify: Parameters<typeof installApi>[0][string],
  play?: StoryObj["play"],
  resend = ok({ expires_in_seconds: 600, resend_after_seconds: 60 }, 202),
): StoryObj {
  return {
    render: () => <LoginCodeScreen />,
    beforeEach: () => {
      const clear = seedPending("signIn");
      const restore = installApi({
        "/api/auth/email/sign-in/verify": verify,
        "/api/auth/email/sign-in": resend,
        ...signedIn,
      });
      return () => {
        clear();
        restore();
      };
    },
    play,
  };
}

const typeCode =
  (code = CODE): StoryObj["play"] =>
  async ({ canvas }) => {
    await userEvent.type(await canvas.findByLabelText("6-digit code"), code);
  };

export const SignInSent = signInStory(ok(SESSION));
SignInSent.name = "Sign in · sent";

export const SignInTyping = signInStory(ok(SESSION), async ({ canvas }) => {
  await userEvent.type(await canvas.findByLabelText("6-digit code"), "5284");
});
SignInTyping.name = "Sign in · typing";

export const SignInInvalid = signInStory(apiError(422, "code_invalid"), async (context) => {
  await typeCode("528400")?.(context);
  await expect(await context.canvas.findByText(/That code isn’t right/)).toBeVisible();
});
SignInInvalid.name = "Sign in · invalid";

export const SignInExpired = signInStory(apiError(422, "code_expired"), async (context) => {
  await typeCode()?.(context);
  await expect(await context.canvas.findByText(/This code has expired/)).toBeVisible();
});
SignInExpired.name = "Sign in · expired";

export const SignInResent = signInStory(apiError(422, "code_expired"), async (context) => {
  await typeCode()?.(context);
  await userEvent.click(await context.canvas.findByRole("button", { name: "Send a new code" }));
  await expect(await context.canvas.findByText(/We sent a new code/)).toBeVisible();
});
SignInResent.name = "Sign in · resent";

export const SignInSubmitting = signInStory("pending", async (context) => {
  await typeCode()?.(context);
  await expect(await context.canvas.findByRole("button", { name: "Signing in…" })).toBeDisabled();
});
SignInSubmitting.name = "Sign in · submitting";

export const SignInSuccess = signInStory(ok(SESSION), async (context) => {
  await typeCode()?.(context);
  await expect(await context.canvas.findByText("You’re signed in.")).toBeVisible();
});
SignInSuccess.name = "Sign in · success";

export const SignInThrottled = signInStory(
  apiError(429, "rate_limited", { "retry-after": "60" }),
  async (context) => {
    await typeCode()?.(context);
    await expect(await context.canvas.findByText("Resend unavailable for now")).toBeVisible();
  },
);
SignInThrottled.name = "Sign in · throttled";

export const SignInError = signInStory(apiError(500, "internal_error"), async (context) => {
  await typeCode()?.(context);
  await expect(await context.canvas.findByRole("button", { name: "Try again" })).toBeEnabled();
});
SignInError.name = "Sign in · error";

export const SignInPhone: StoryObj = {
  ...signInStory(ok(SESSION)),
  name: "Sign in · phone",
  globals: { viewport: { value: "phone", isRotated: false } },
};

function verifyStory(
  verify: Parameters<typeof installApi>[0][string],
  play?: StoryObj["play"],
): StoryObj {
  return {
    render: () => <SignupVerifyScreen />,
    beforeEach: () => {
      const clear = seedPending("registration");
      const restore = installApi({
        "/api/auth/email/registrations/verify": verify,
        "/api/auth/email/registrations": ok(
          { registration_token: "sfg_second", expires_in_seconds: 600, resend_after_seconds: 60 },
          202,
        ),
        "/api/auth/email/sign-in": ok({ expires_in_seconds: 600, resend_after_seconds: 60 }, 202),
        ...signedIn,
      });
      return () => {
        clear();
        restore();
      };
    },
    play,
  };
}

export const VerifyTyping = verifyStory(ok(SESSION), async ({ canvas }) => {
  await userEvent.type(await canvas.findByLabelText("6-digit code"), "4829");
});
VerifyTyping.name = "Verify · typing";

export const VerifyInvalid = verifyStory(apiError(422, "code_invalid"), async (context) => {
  await typeCode("482900")?.(context);
  await expect(await context.canvas.findByText(/That code isn’t right/)).toBeVisible();
});
VerifyInvalid.name = "Verify · invalid";

export const VerifyExpired = verifyStory(apiError(422, "code_expired"), async (context) => {
  await typeCode()?.(context);
  await expect(await context.canvas.findByText(/This code has expired/)).toBeVisible();
});
VerifyExpired.name = "Verify · expired";

export const VerifySubmitting = verifyStory("pending", async (context) => {
  await typeCode()?.(context);
  await expect(await context.canvas.findByRole("button", { name: "Verifying…" })).toBeDisabled();
});
VerifySubmitting.name = "Verify · submitting";

export const VerifyVerified = verifyStory(ok(SESSION), async (context) => {
  await typeCode()?.(context);
  await expect(await context.canvas.findByText("Email verified on this device.")).toBeVisible();
});
VerifyVerified.name = "Verify · verified";

export const VerifyVerifiedElsewhere = verifyStory(
  apiError(409, "verified_elsewhere"),
  async (context) => {
    await typeCode()?.(context);
    await expect(
      await context.canvas.findByText(/This email was verified from another device/),
    ).toBeVisible();
  },
);
VerifyVerifiedElsewhere.name = "Verify · verified elsewhere";

export const VerifyThrottled = verifyStory(
  apiError(429, "rate_limited", { "retry-after": "60" }),
  async (context) => {
    await typeCode()?.(context);
    await expect(await context.canvas.findByText("Resend unavailable for now")).toBeVisible();
  },
);
VerifyThrottled.name = "Verify · throttled";
