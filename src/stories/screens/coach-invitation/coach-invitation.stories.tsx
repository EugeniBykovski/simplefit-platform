import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, userEvent, within } from "storybook/test";

import { resetPendingCoachInvitationForTests } from "@/entities/pending-coach-invitation";
import {
  apiError,
  installApi,
  ok,
  SESSION,
  VIEWER,
  type Answer,
} from "@/stories/support/auth-story-api";
import { AuthMinimalFrame } from "@/widgets/auth-screens";
import { CoachInvitation } from "@/widgets/coach-invitation";

/*
 * WFI1 Coach invitation (SF-60; Claude Design 1792151007-1d70): the E08 link
 * page in its minimal frame, on a deterministic stand-in of the SF-57 API
 * (`fetch` is replaced per story; nothing reaches an API). The token is a
 * well-formed fixture, never a real one; names are Storybook fixtures.
 */

const FIXTURE_TOKEN = `sfi_${"Storybook0".repeat(4)}abc`;
const PREVIEW = {
  invitation: {
    coach: { display_name: "Coach Marek", brand_name: "Marek Boxing" },
    expires_at: "2026-10-30T10:00:00Z",
    message: "Saturday sparring is on — connect so I can plan with you.",
  },
  disclosure: {
    version: "storybook-disclosure",
    fields: [
      "display_name",
      "username",
      "country_code",
      "city",
      "experience_level",
      "stance",
      "amateur_bout_count",
    ],
    never_shared: [
      "goals",
      "next_fight",
      "weight",
      "height",
      "account_name",
      "date_of_birth",
      "email",
      "other_coaches",
    ],
  },
};
const entry = (fighter: "completed" | "in_progress") =>
  ok({
    entry: {
      destination: fighter === "completed" ? "fighter_home" : "fighter_onboarding",
      reason: "storybook",
      mandatory: false,
      intent: "fighter",
      context: null,
      account_registration: "complete",
      fighter_profile: fighter,
      coach_profile: "not_started",
      capabilities: fighter === "completed" ? ["FIGHTER"] : [],
    },
  });

function story({
  signedIn = true,
  link = true,
  preview = ok(PREVIEW),
  fighter = "completed",
  accept = ok({ outcome: "created", relationship_id: "rel-1" }),
  decline = ok(undefined, 204),
  play,
}: {
  signedIn?: boolean;
  link?: boolean;
  preview?: Answer | Answer[];
  fighter?: "completed" | "in_progress";
  accept?: Answer;
  decline?: Answer;
  play?: StoryObj["play"];
} = {}): StoryObj {
  return {
    parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/en/invite/coach" } } },
    beforeEach: () => {
      resetPendingCoachInvitationForTests();
      window.history.replaceState(
        null,
        "",
        link
          ? `${window.location.pathname}${window.location.search}#token=${FIXTURE_TOKEN}`
          : `${window.location.pathname}${window.location.search}`,
      );
      return installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": signedIn ? ok(SESSION) : apiError(401, "unauthorized"),
        "/api/v1/coach-invitations/preview": preview,
        "/api/v1/me/entry": entry(fighter),
        "/api/v1/me/coach-invitations/accept": accept,
        "/api/v1/me/coach-invitations/decline": decline,
      });
    },
    render: () => (
      <AuthMinimalFrame>
        <CoachInvitation />
      </AuthMinimalFrame>
    ),
    play,
  };
}

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

const meta = {
  title: "Coach Invitation/Fighter response",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const T = { timeout: 5000 };
const review = async (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole("button", { name: "Accept invitation" }, T);

export const SignedOut = story({
  signedIn: false,
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("link", { name: "Sign in to respond" }, T);
  },
});
SignedOut.name = "WFI1 · preview, signed out";

export const Loading = story({ preview: "pending" });
Loading.name = "WFI1 · loading";

export const Review = story({
  play: async ({ canvasElement }) => void (await review(canvasElement)),
});
Review.name = "WFI1 · disclosure review (unticked)";

export const ProfileNeeded = story({
  fighter: "in_progress",
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("link", { name: "Continue setup" }, T);
  },
});
ProfileNeeded.name = "WFI1 · profile to finish first";

export const AcceptPending = story({
  accept: "pending",
  play: async ({ canvasElement }) => {
    await review(canvasElement);
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("checkbox"));
    await userEvent.click(canvas.getByRole("button", { name: "Accept invitation" }));
    await expect(await canvas.findByRole("button", { name: "Accepting…" }, T)).toBeDisabled();
  },
});
AcceptPending.name = "WFI1 · accepting";

export const Accepted = story({
  play: async ({ canvasElement }) => {
    await review(canvasElement);
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("checkbox"));
    await userEvent.click(canvas.getByRole("button", { name: "Accept invitation" }));
    await canvas.findByRole("heading", { name: "You’re connected with Coach Marek." }, T);
  },
});
Accepted.name = "WFI1 · accepted";

export const Mismatch = story({
  accept: apiError(403, "invitation_recipient_mismatch"),
  play: async ({ canvasElement }) => {
    await review(canvasElement);
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("checkbox"));
    await userEvent.click(canvas.getByRole("button", { name: "Accept invitation" }));
    await canvas.findByRole("button", { name: "Sign out and switch account" }, T);
  },
});
Mismatch.name = "WFI1 · different recipient";

export const Stale = story({
  accept: {
    status: 409,
    body: {
      error: { code: "conflict", message: "storybook", details: { disclosure_version: "stale" } },
    },
  },
  play: async ({ canvasElement }) => {
    await review(canvasElement);
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("checkbox"));
    await userEvent.click(canvas.getByRole("button", { name: "Accept invitation" }));
    await canvas.findByText(/What you would share has changed\./, {}, T);
  },
});
Stale.name = "WFI1 · disclosure changed";

export const DeclinePending = story({
  decline: "pending",
  play: async ({ canvasElement }) => {
    await review(canvasElement);
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Decline" }));
    await canvas.findByRole("button", { name: "Declining…" }, T);
  },
});
DeclinePending.name = "WFI1 · declining";

export const Declined = story({
  play: async ({ canvasElement }) => {
    await review(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Decline" }));
    await within(canvasElement).findByRole("heading", { name: "Invitation declined" }, T);
  },
});
Declined.name = "WFI1 · declined";

export const Unavailable = story({
  preview: apiError(410, "invitation_unavailable"),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole(
      "heading",
      { name: "This invitation isn’t available" },
      T,
    );
  },
});
Unavailable.name = "WFI1 · not available (410 / sharing off 404)";

export const Limited = story({
  preview: apiError(429, "rate_limited"),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(/Too many attempts\./, {}, T);
  },
});
Limited.name = "WFI1 · rate limited";

export const NetworkError = story({
  preview: "offline",
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("button", { name: "Try again" }, T);
  },
});
NetworkError.name = "WFI1 · network error";

export const NoLink = story({
  link: false,
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("heading", { name: "No invitation to show" }, T);
  },
});
NoLink.name = "WFI1 · no invitation in this tab";
