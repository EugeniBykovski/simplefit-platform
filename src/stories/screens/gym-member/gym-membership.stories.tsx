import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { userEvent, within } from "storybook/test";

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
import { AppFrame } from "@/widgets/app-frame";
import { MemberGyms, MemberInvitations, MemberJoin } from "@/widgets/gym-member-booking";
import { LaunchScreen, SessionFailure } from "@/widgets/system-states";

/*
 * My gyms, joining by code and the invitation inbox (SF-134) in the route's own
 * frame, on a deterministic stand-in of the SF-95 API (`fetch` is replaced per
 * story; nothing reaches a backend or storage). No web artboard exists
 * (D-WEB-GYM-MEMBER-JOIN). The code and names are Storybook fixtures.
 */

const GYM = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";

const membership = (status: string, id: number, name: string, extra = {}) => ({
  gym: { gym_id: `3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a6${id}`, name },
  gym_member_id: `8b1b2c3d-0000-4000-8000-00000000000${id}`,
  status,
  joined_via: "join_code",
  auto_approved: false,
  requested_at: "2026-10-30T10:00:00Z",
  joined_at: status === "active" ? "2026-10-30T11:00:00Z" : null,
  responded_at: status === "active" ? "2026-10-30T11:00:00Z" : null,
  ended_at: null,
  ended_reason: null,
  ...extra,
});
const EVERY_STATUS = [
  membership("active", 1, "Ring One Boxing"),
  membership("requested", 2, "Kraków Boxing Academy"),
  membership("ended", 3, "Old Town Gym", {
    ended_at: "2026-09-01T10:00:00Z",
    ended_reason: "left",
  }),
  membership("ended", 4, "Harbour Boxing", {
    ended_at: "2026-08-01T10:00:00Z",
    ended_reason: "removed",
  }),
  membership("rejected", 5, "Northside Club", { responded_at: "2026-07-01T10:00:00Z" }),
  membership("cancelled", 6, "Riverside Boxing", { responded_at: "2026-06-01T10:00:00Z" }),
];
const memberships = (rows: unknown[]) => ok({ memberships: rows, next_cursor: null });
const INVITATION = {
  invitation_id: "7a1b2c3d-0000-4000-8000-000000000701",
  status: "pending",
  gym: { gym_id: GYM, name: "Ring One Boxing" },
  invited_by: { first_name: "Yauheni", role: "owner" },
  sent_to: "marta@example.com",
  created_at: "2026-11-13T10:00:00Z",
  expires_at: "2026-11-20T10:00:00Z",
  responded_at: null,
  gym_member_id: null,
};
const inbox = (rows: unknown[]) => ok({ invitations: rows, next_cursor: null });
const previewOf = (requires_approval: boolean) =>
  ok({ preview: { gym: { name: "Ring One Boxing" }, requires_approval } });
const ENTRY = ok({
  entry: {
    destination: "role_selection",
    reason: "storybook",
    mandatory: false,
    intent: null,
    context: null,
    account_registration: "complete",
    fighter_profile: "not_started",
    coach_profile: "not_started",
    gym_id: null,
    gym_workspaces: [],
    gym_workspace_count: 0,
    sponsor_id: null,
    sponsor_workspaces: [],
    sponsor_workspace_count: 0,
    capabilities: [],
  },
});

function story({
  page,
  rows = memberships(EVERY_STATUS),
  invitations = inbox([INVITATION]),
  preview = previewOf(true),
  join = ok({ membership: membership("requested", 2, "Ring One Boxing") }, 201),
  play,
}: {
  page: "gyms" | "join" | "inbox";
  rows?: Answer;
  invitations?: Answer;
  preview?: Answer;
  join?: Answer;
  play?: StoryObj["play"];
}): StoryObj {
  const View = { gyms: MemberGyms, join: MemberJoin, inbox: MemberInvitations }[page];
  return {
    parameters: {
      nextjs: {
        appDirectory: true,
        navigation: {
          pathname: {
            gyms: "/en/app/me/gyms",
            join: "/en/app/me/gyms/join",
            inbox: "/en/app/me/gyms/invitations",
          }[page],
        },
      },
    },
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/me/entry": ENTRY,
        "/api/v1/me/gyms": ok({ gyms: [], next_cursor: null }),
        "GET /api/v1/me/gym-memberships": rows,
        "GET /api/v1/me/gym-invitations": invitations,
        "/api/v1/gym-join/preview": preview,
        "/api/v1/me/gym-memberships/join": join,
      }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        <AppFrame>
          <View />
        </AppFrame>
      </RequireSession>
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
  title: "Gym Member/Membership",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const T = { timeout: 8000 };
const CODE = "ABCD-EFGH";

const lookUp = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.type(await canvas.findByLabelText("Gym code", undefined, T), CODE);
  await userEvent.click(canvas.getByRole("button", { name: "Find gym" }));
};
const send = async (canvasElement: HTMLElement) => {
  await lookUp(canvasElement);
  await userEvent.click(
    await within(canvasElement).findByRole("button", { name: /Send join request|Join gym/ }, T),
  );
};
const body = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

export const GymsEveryStatus = story({ page: "gyms" });
GymsEveryStatus.name = "My gyms: every status";

export const GymsEmpty = story({ page: "gyms", rows: memberships([]), invitations: inbox([]) });
GymsEmpty.name = "My gyms: no membership";

export const GymsFailed = story({ page: "gyms", rows: "offline" });
GymsFailed.name = "My gyms: failed";

export const LeaveConfirm = story({
  page: "gyms",
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "Leave Ring One Boxing" }, T),
    );
    await body(canvasElement).findByRole("alertdialog", undefined, T);
  },
});
LeaveConfirm.name = "My gyms: leaving asks first";

export const CancelRequestConfirm = story({
  page: "gyms",
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole(
        "button",
        { name: "Cancel the request to join Kraków Boxing Academy" },
        T,
      ),
    );
    await body(canvasElement).findByRole("alertdialog", undefined, T);
  },
});
CancelRequestConfirm.name = "My gyms: cancelling a request asks first";

export const JoinCode = story({ page: "join" });
JoinCode.name = "Join: code";

export const JoinNotFound = story({
  page: "join",
  preview: apiError(404, "not_found"),
  play: async ({ canvasElement }) => {
    await lookUp(canvasElement);
    await within(canvasElement).findByRole("alert", undefined, T);
  },
});
JoinNotFound.name = "Join: code not found";

export const JoinLimited = story({
  page: "join",
  preview: apiError(429, "rate_limited", { "retry-after": "300" }),
  play: async ({ canvasElement }) => {
    await lookUp(canvasElement);
    await within(canvasElement).findByRole("alert", undefined, T);
  },
});
JoinLimited.name = "Join: rate limited";

export const JoinPreviewApproval = story({
  page: "join",
  play: async ({ canvasElement }) => {
    await lookUp(canvasElement);
    await within(canvasElement).findByRole("button", { name: "Send join request" }, T);
  },
});
JoinPreviewApproval.name = "Join: preview, gym approves";

export const JoinPreviewInstant = story({
  page: "join",
  preview: previewOf(false),
  play: async ({ canvasElement }) => {
    await lookUp(canvasElement);
    await within(canvasElement).findByRole("button", { name: "Join gym" }, T);
  },
});
JoinPreviewInstant.name = "Join: preview, auto-approval";

export const JoinRequested = story({
  page: "join",
  play: async ({ canvasElement }) => {
    await send(canvasElement);
    await within(canvasElement).findByText("Request sent to Ring One Boxing", undefined, T);
  },
});
JoinRequested.name = "Join: requested";

export const JoinActive = story({
  page: "join",
  preview: previewOf(false),
  join: ok(
    { membership: membership("active", 1, "Ring One Boxing", { auto_approved: true }) },
    201,
  ),
  play: async ({ canvasElement }) => {
    await send(canvasElement);
    await within(canvasElement).findByText("You're a member of Ring One Boxing", undefined, T);
  },
});
JoinActive.name = "Join: active";

export const JoinAlready = story({
  page: "join",
  join: {
    status: 409,
    body: {
      error: { code: "conflict", message: "storybook", details: { gym_member: "already_active" } },
    },
  },
  play: async ({ canvasElement }) => {
    await send(canvasElement);
    await within(canvasElement).findByText("You're already a member of this gym", undefined, T);
  },
});
JoinAlready.name = "Join: already a member";

export const InboxList = story({ page: "inbox" });
InboxList.name = "Inbox: pending";

export const InboxEmpty = story({ page: "inbox", invitations: inbox([]) });
InboxEmpty.name = "Inbox: empty";

export const InboxFailed = story({ page: "inbox", invitations: "offline" });
InboxFailed.name = "Inbox: failed";

export const InboxDeclineConfirm = story({
  page: "inbox",
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole(
        "button",
        { name: "Decline the invitation from Ring One Boxing" },
        T,
      ),
    );
    await body(canvasElement).findByRole("alertdialog", undefined, T);
  },
});
InboxDeclineConfirm.name = "Inbox: declining asks first";
