import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, userEvent, within } from "storybook/test";

import { resetPendingStaffInvitationForTests } from "@/entities/pending-staff-invitation";
import {
  apiError,
  installApi,
  ok,
  SESSION,
  VIEWER,
  type Answer,
} from "@/stories/support/auth-story-api";
import { AuthMinimalFrame } from "@/widgets/auth-screens";
import { StaffInvitation } from "@/widgets/staff-invitation";

/*
 * The staff invitation page (SF-133): the E06 link page in its minimal frame,
 * on a deterministic stand-in of the SF-93 API (`fetch` is replaced per story;
 * nothing reaches an API). No web artboard exists: this is the WFI1 column with
 * the OS1 and OS1b content (D-WEB-STAFF-INVITATION). The token is a well-formed
 * fixture, never a real one; names are Storybook fixtures.
 */

const FIXTURE_TOKEN = `sfs_${"Storybook0".repeat(4)}abc`;
const GYM = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";

const PREVIEW = ok({
  preview: {
    gym: { name: "Ring One Boxing" },
    role: "coach",
    invited_by: { first_name: "Yauheni", role: "owner" },
    expires_at: "2026-11-20T10:00:00Z",
  },
});
const invitation = (status: string, role = "coach") =>
  ok({
    invitation: {
      invitation_id: "7a1b2c3d-0000-4000-8000-000000000701",
      status,
      role,
      gym: { gym_id: GYM, name: "Ring One Boxing" },
      invited_by: { first_name: "Yauheni", role: "owner" },
      sent_to: "natalia@example.com",
      created_at: "2026-11-13T10:00:00Z",
      expires_at: "2026-11-20T10:00:00Z",
      responded_at: null,
      staff_membership_id: null,
    },
  });
const entry = (registration: "complete" | "required") =>
  ok({
    entry: {
      destination: registration === "complete" ? "fighter_home" : "account_registration",
      reason: "storybook",
      mandatory: registration !== "complete",
      intent: null,
      context: null,
      account_registration: registration,
      fighter_profile: "completed",
      coach_profile: "not_started",
      gym_id: null,
      gym_workspaces: [],
      gym_workspace_count: 0,
      capabilities: ["FIGHTER"],
    },
  });
const conflict = (details: Record<string, unknown>): Answer => ({
  status: 409,
  body: { error: { code: "conflict", message: "storybook", details } },
});

function story({
  signedIn = true,
  link = true,
  preview = PREVIEW,
  resolve = invitation("pending"),
  registration = "complete",
  accept = "pending",
  decline = ok({ invitation: {} }),
  gym = apiError(404, "not_found"),
  play,
}: {
  signedIn?: boolean;
  link?: boolean;
  preview?: Answer;
  resolve?: Answer | Answer[];
  registration?: "complete" | "required";
  accept?: Answer;
  decline?: Answer;
  gym?: Answer;
  play?: StoryObj["play"];
} = {}): StoryObj {
  return {
    parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/en/invite/staff" } } },
    beforeEach: () => {
      resetPendingStaffInvitationForTests();
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
        "/api/v1/staff-invitations/preview": preview,
        "/api/v1/me/staff-invitations/resolve": resolve,
        "/api/v1/me/entry": entry(registration),
        "/api/v1/me/staff-invitations/accept": accept,
        "/api/v1/me/staff-invitations/decline": decline,
        [`/api/v1/gyms/${GYM}`]: gym,
      });
    },
    render: () => (
      <AuthMinimalFrame>
        <StaffInvitation />
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
  title: "Staff Invitation/Recipient",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const T = { timeout: 5000 };
const pressAccept = async (canvasElement: HTMLElement) =>
  userEvent.click(
    await within(canvasElement).findByRole("button", { name: "Accept invitation" }, T),
  );

export const Loading = story({ signedIn: false, preview: "pending" });
Loading.name = "Loading";

export const SignedOut = story({
  signedIn: false,
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("link", { name: "Create account" }, T);
  },
});
SignedOut.name = "Preview, signed out";

export const SignedOutUnavailable = story({
  signedIn: false,
  preview: apiError(410, "invitation_unavailable"),
});
SignedOutUnavailable.name = "Unavailable, signed out";

export const SignedOutLimited = story({
  signedIn: false,
  preview: apiError(429, "rate_limited"),
});
SignedOutLimited.name = "Rate limited";

export const BackendUnavailable = story({
  signedIn: false,
  preview: apiError(503, "unavailable"),
});
BackendUnavailable.name = "Backend unavailable";

export const NetworkRetry = story({ signedIn: false, preview: "offline" });
NetworkRetry.name = "Network retry";

export const NoToken = story({ signedIn: false, link: false });
NoToken.name = "No token in the link";

export const Pending = story();
Pending.name = "Valid: the recipient answers";

export const PendingManager = story({ resolve: invitation("pending", "manager") });
PendingManager.name = "Valid: Manager";

export const Registration = story({ registration: "required" });
Registration.name = "Account registration first";

export const WrongAccount = story({
  resolve: apiError(403, "invitation_recipient_mismatch"),
});
WrongAccount.name = "Another account: verify or switch";

export const Verifying = story({
  resolve: apiError(403, "invitation_recipient_mismatch"),
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "Verify the invited email" }, T),
    );
    await within(canvasElement).findByRole("button", { name: "Back to the invitation" }, T);
  },
});
Verifying.name = "Verifying the invited email";

export const Accepting = story({
  play: async ({ canvasElement }) => {
    await pressAccept(canvasElement);
    await expect(
      await within(canvasElement).findByRole("button", { name: "Accepting…" }, T),
    ).toBeDisabled();
  },
});
Accepting.name = "Accepting";

export const ConfirmDecline = story({
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: "Decline" }, T));
    await within(canvasElement).findByRole("button", { name: "Keep the invitation" }, T);
  },
});
ConfirmDecline.name = "Decline: asks first";

export const DeclinedJustNow = story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Decline" }, T));
    await canvas.findByRole("button", { name: "Keep the invitation" }, T);
    await userEvent.click(canvas.getByRole("button", { name: "Decline" }));
    await canvas.findByText("You declined this invitation", undefined, T);
  },
});
DeclinedJustNow.name = "Declined just now";

export const Expired = story({ resolve: invitation("expired") });
Expired.name = "Expired";

export const Revoked = story({ resolve: invitation("cancelled") });
Revoked.name = "Withdrawn by the gym";

export const Declined = story({ resolve: invitation("declined") });
Declined.name = "Declined earlier";

export const AlreadyAccepted = story({
  resolve: invitation("accepted"),
  gym: ok({ gym: { id: GYM } }),
});
AlreadyAccepted.name = "Already accepted";

export const AccessEnded = story({ resolve: invitation("accepted") });
AccessEnded.name = "Gym access revoked after acceptance";

export const AlreadyStaff = story({
  accept: conflict({ staff_membership: "already_active" }),
  play: async ({ canvasElement }) => {
    await pressAccept(canvasElement);
    await within(canvasElement).findByText("You already work at Ring One Boxing", undefined, T);
  },
});
AlreadyStaff.name = "Already on the team";

export const AcceptFailed = story({
  accept: "offline",
  play: async ({ canvasElement }) => {
    await pressAccept(canvasElement);
    await within(canvasElement).findByText("We couldn't confirm that.", undefined, T);
  },
});
AcceptFailed.name = "Accept: connection dropped";

export const Unavailable = story({ resolve: apiError(410, "invitation_unavailable") });
Unavailable.name = "Unavailable, signed in";
