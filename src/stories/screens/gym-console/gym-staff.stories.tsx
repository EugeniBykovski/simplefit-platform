import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, useMessages } from "next-intl";
import type { ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";

import { GymGate, RequireSession } from "@/features/session-gate";
import { signInRouteFor } from "@/shared/routes/routes";
import {
  apiError,
  installApi,
  ok,
  SESSION,
  VIEWER,
  type Answer,
} from "@/stories/support/auth-story-api";
import { GymStaff } from "@/widgets/gym-staff";
import { GymWorkspace, useGymWorkspace } from "@/widgets/gym-workspace";
import { EntryFailure, LaunchScreen, SessionFailure } from "@/widgets/system-states";

import deContextSwitcher from "../../../../messages/de/contextSwitcher.json";
import deGymConsole from "../../../../messages/de/gymConsole.json";
import deShells from "../../../../messages/de/shells.json";

/*
 * The gym's coaches and staff (SF-94, WG16) in the route's own composition
 * (session gate, GYM_WORKSPACE gate, the console of the gym in the path) on
 * a deterministic stand-in of the SF-93 API (`fetch` is replaced per story;
 * nothing reaches a backend). Names and addresses are Storybook fixtures.
 */

const RING = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";
const ANNEX = "9b4e2d61-7a3c-4f85-8e1d-6c2a0b5f3d97";
const OWNER_ROW = "5e2c7a91-3f4b-4d6e-8a0c-1b9d7f3e5a24";
const MANAGER_ROW = "6a1b2c3d-0000-4000-8000-000000000101";
const COACH_ROW = "6a1b2c3d-0000-4000-8000-000000000102";
const DESK_ROW = "6a1b2c3d-0000-4000-8000-000000000103";

type Role = "owner" | "manager" | "coach" | "front_desk";

const PERMISSIONS: Record<Role, string[]> = {
  owner: [
    "view_workspace",
    "view_staff",
    "view_staff_records",
    "invite_manager",
    "invite_staff",
    "change_staff_role",
    "remove_staff",
    "edit_gym",
  ],
  manager: [
    "view_workspace",
    "view_staff",
    "view_staff_records",
    "invite_staff",
    "change_staff_role",
    "remove_staff",
    "leave_gym",
    "edit_gym",
  ],
  coach: ["view_workspace", "view_staff", "leave_gym"],
  front_desk: ["view_workspace", "view_staff", "leave_gym"],
};

const VIEWER_ROW: Record<Role, string> = {
  owner: OWNER_ROW,
  manager: MANAGER_ROW,
  coach: COACH_ROW,
  front_desk: DESK_ROW,
};

const gym = (id: string, name: string, role: Role) => ({
  gym: {
    id,
    name,
    gym_type: "boxing_club",
    setup_status: "completed",
    inserted_at: "2026-10-27T10:00:00Z",
    updated_at: "2026-10-27T10:00:00Z",
    locations: [],
    viewer: { role, staff_membership_id: VIEWER_ROW[role], permissions: PERMISSIONS[role] },
  },
});

const member = (id: string, role: Role, name: string | null, viewer: Role, ended = false) => ({
  staff_membership_id: id,
  role,
  status: ended ? "ended" : "active",
  name,
  is_viewer: id === VIEWER_ROW[viewer],
  joined_at: "2026-10-20T10:00:00Z",
  ended_at: ended ? "2026-10-28T10:00:00Z" : null,
  ended_reason: ended ? "removed" : null,
});

const team = (viewer: Role, long = false) => [
  member(OWNER_ROW, "owner", long ? "Bartłomiej-Konstanty W." : "Yauheni B.", viewer),
  member(MANAGER_ROW, "manager", long ? "Małgorzata-Aleksandra K." : "Agnieszka L.", viewer),
  member(COACH_ROW, "coach", "Tomasz Z.", viewer),
  member(DESK_ROW, "front_desk", "Michał S.", viewer),
];

const invitation = (id: string, status: string, role: Role, email: string) => ({
  invitation_id: id,
  role,
  status,
  recipient_email: email,
  invited_by: { staff_membership_id: OWNER_ROW, name: "Yauheni B." },
  created_at: "2026-10-28T10:00:00Z",
  expires_at: "2026-11-04T10:00:00Z",
  last_sent_at: "2026-10-28T10:00:00Z",
  resends_remaining: status === "pending" ? 3 : 0,
  responded_at: status === "pending" || status === "expired" ? null : "2026-10-29T10:00:00Z",
  staff_membership_id: null,
});

const INVITATIONS = [
  invitation("7b000000-0000-4000-8000-000000000201", "pending", "coach", "k•••@example.com"),
  invitation("7b000000-0000-4000-8000-000000000202", "pending", "front_desk", "n•••@example.com"),
  invitation("7b000000-0000-4000-8000-000000000203", "expired", "coach", "o•••@example.com"),
  invitation("7b000000-0000-4000-8000-000000000204", "accepted", "manager", "a•••@example.com"),
];

const entry = (role: Role) => ({
  entry: {
    destination: "gym_home",
    reason: "storybook",
    mandatory: false,
    intent: null,
    context: null,
    account_registration: "complete",
    fighter_profile: "completed",
    coach_profile: "not_started",
    capabilities: ["FIGHTER", "GYM_WORKSPACE"],
    gym_id: RING,
    gym_workspaces: [
      {
        gym_id: RING,
        name: "Ring One Boxing",
        role,
        setup_status: "completed",
        available_actions: ["enter"],
        selected: false,
      },
      {
        gym_id: ANNEX,
        name: "Annex Club",
        role: "manager",
        setup_status: "completed",
        available_actions: ["enter"],
        selected: false,
      },
    ],
    gym_workspace_count: 2,
  },
});

/** The staff page of the console's gym, as its route renders it. */
function Staff() {
  return <GymStaff gym={useGymWorkspace()} />;
}

function staffStory({
  role = "owner",
  gymId = RING,
  gymName = "Ring One Boxing",
  gymAnswer,
  staff,
  ended = ok({ staff: [member(MANAGER_ROW, "coach", "Ola K.", "owner", true)], next_cursor: null }),
  invitations = ok({ invitations: INVITATIONS, next_cursor: null }),
  routes = {},
  play,
}: {
  role?: Role;
  gymId?: string;
  gymName?: string;
  gymAnswer?: Answer | Answer[];
  staff?: Answer | Answer[];
  ended?: Answer | Answer[];
  invitations?: Answer | Answer[];
  routes?: Record<string, Answer | Answer[]>;
  play?: StoryObj["play"];
} = {}): StoryObj {
  return {
    parameters: {
      nextjs: { appDirectory: true, navigation: { pathname: `/en/app/gyms/${gymId}/staff` } },
    },
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/me/entry": ok(entry(role)),
        [`/api/v1/gyms/${gymId}`]: gymAnswer ?? ok(gym(gymId, gymName, role)),
        [`/api/v1/gyms/${gymId}/staff?status=ended`]: ended,
        [`/api/v1/gyms/${gymId}/staff`]: staff ?? ok({ staff: team(role), next_cursor: null }),
        [`/api/v1/gyms/${gymId}/staff-invitations`]: invitations,
        ...routes,
      }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        <GymGate pending={<LaunchScreen />} failure={<EntryFailure />}>
          <GymWorkspace gymId={gymId}>
            <Staff />
          </GymWorkspace>
        </GymGate>
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

/** German copy over the English messages: the longest labels. */
function German({ children }: { children: ReactNode }) {
  const messages = useMessages();
  return (
    <NextIntlClientProvider
      locale="de"
      timeZone="UTC"
      messages={{
        ...messages,
        contextSwitcher: deContextSwitcher,
        gymConsole: deGymConsole,
        shells: deShells,
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}

const meta = {
  title: "Gym Console/Coaches and staff",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const roster = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole("table", { name: "Active staff" }, { timeout: 5000 });
const body = () => within(document.body);

/* ── Owner ──────────────────────────────────────────────────────────── */

export const OwnerTeam = staffStory({
  play: async ({ canvasElement }) => {
    const table = await roster(canvasElement);
    await expect(within(table).getByText("Agnieszka L.")).toBeVisible();
    await expect(within(canvasElement).getByRole("button", { name: "Invite" })).toBeVisible();
  },
});
OwnerTeam.name = "WG16 · owner · active staff and invitations";

export const OwnerPendingInvitations = staffStory({
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("k•••@example.com", {}, { timeout: 5000 }),
    ).toBeVisible();
  },
});
OwnerPendingInvitations.name = "WG16 · owner · pending, expired and accepted invitations";

export const OwnerAlone = staffStory({
  staff: ok({ staff: [member(OWNER_ROW, "owner", "Yauheni B.", "owner")], next_cursor: null }),
  invitations: ok({ invitations: [], next_cursor: null }),
});
OwnerAlone.name = "WG16 · owner · no staff beyond the owner";

export const ExpiredInvitation = staffStory({
  invitations: ok({
    invitations: [
      invitation("7b000000-0000-4000-8000-000000000203", "expired", "coach", "o•••@example.com"),
    ],
    next_cursor: null,
  }),
});
ExpiredInvitation.name = "WG16 · owner · an expired invitation";

export const EndedEmpty = staffStory({
  ended: ok({ staff: [], next_cursor: null }),
  play: async ({ canvasElement }) => {
    await roster(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Ended" }));
    await expect(await within(canvasElement).findByText("No one has left")).toBeVisible();
  },
});
EndedEmpty.name = "WG16 · ended staff · empty";

/* ── Other roles ────────────────────────────────────────────────────── */

export const Manager = staffStory({
  role: "manager",
  play: async ({ canvasElement }) => {
    await roster(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Show Yauheni B." }));
    await expect(within(canvasElement).queryByRole("button", { name: "Change role" })).toBeNull();
  },
});
Manager.name = "WG16 · manager · coaches and front desk only";

export const Coach = staffStory({ role: "coach" });
Coach.name = "WG16 · coach · read-only roster";

export const FrontDesk = staffStory({ role: "front_desk" });
FrontDesk.name = "WG16 · front desk · read-only roster";

export const OtherGym = staffStory({
  role: "manager",
  gymId: ANNEX,
  gymName: "Annex Club",
  staff: ok({
    staff: [
      member(OWNER_ROW, "owner", "Ewa P.", "manager"),
      member(MANAGER_ROW, "manager", "Agnieszka L.", "manager"),
    ],
    next_cursor: null,
  }),
  invitations: ok({ invitations: [], next_cursor: null }),
});
OtherGym.name = "WG16 · a different gym (manager there)";

/* ── Actions ────────────────────────────────────────────────────────── */

export const InviteDialog = staffStory({
  play: async ({ canvasElement }) => {
    await roster(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Invite" }));
    await expect(await body().findByRole("dialog")).toBeVisible();
  },
});
InviteDialog.name = "Invite · the form";

export const InviteValidation = staffStory({
  play: async ({ canvasElement }) => {
    await roster(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Invite" }));
    const dialog = await body().findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Email"), "not-an-address");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    await expect(await within(dialog).findByText("Enter a valid email address.")).toBeVisible();
  },
});
InviteValidation.name = "Invite · validation errors";

const fillInvite = async (canvasElement: HTMLElement) => {
  await roster(canvasElement);
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Invite" }));
  const dialog = await body().findByRole("dialog");
  await userEvent.type(within(dialog).getByLabelText("Email"), "kuba@example.com");
  await userEvent.click(within(dialog).getByRole("radio", { name: /Coach/ }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
  return dialog;
};

export const InvitePending = staffStory({
  routes: { [`POST /api/v1/gyms/${RING}/staff-invitations`]: "pending" },
  play: async ({ canvasElement }) => {
    const dialog = await fillInvite(canvasElement);
    await expect(await within(dialog).findByRole("button", { name: "Sending…" })).toBeDisabled();
  },
});
InvitePending.name = "Invite · submission pending";

export const InviteRateLimited = staffStory({
  routes: {
    [`POST /api/v1/gyms/${RING}/staff-invitations`]: apiError(429, "rate_limited", {
      "retry-after": "600",
    }),
  },
  play: async ({ canvasElement }) => {
    const dialog = await fillInvite(canvasElement);
    await expect(await within(dialog).findByRole("alert")).toHaveTextContent(/Too many requests/);
  },
});
InviteRateLimited.name = "Invite · rate limited";

export const RoleChange = staffStory({
  play: async ({ canvasElement }) => {
    await roster(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Show Tomasz Z." }));
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Change role" }));
    await expect(await body().findByRole("dialog")).toBeVisible();
  },
});
RoleChange.name = "Change role · the dialog";

export const RemoveConfirmation = staffStory({
  play: async ({ canvasElement }) => {
    await roster(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Show Michał S." }));
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Remove from team" }));
    await expect(await body().findByRole("alertdialog")).toHaveTextContent(
      "Remove Michał S. from Ring One Boxing?",
    );
  },
});
RemoveConfirmation.name = "Remove · confirmation";

export const CancelInvitation = staffStory({
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole(
        "button",
        { name: "Cancel the invitation to k•••@example.com" },
        { timeout: 5000 },
      ),
    );
    await expect(await body().findByRole("alertdialog")).toBeVisible();
  },
});
CancelInvitation.name = "Invitation · cancel confirmation";

/* ── States ─────────────────────────────────────────────────────────── */

export const Loading = staffStory({ staff: "pending", invitations: "pending" });
Loading.name = "State · loading";

export const BackendError = staffStory({
  staff: apiError(500, "internal_error"),
  invitations: apiError(500, "internal_error"),
});
BackendError.name = "State · backend error";

export const PermissionDenied = staffStory({ gymAnswer: apiError(403, "forbidden") });
PermissionDenied.name = "State · permission denied (403)";

export const RevokedGym = staffStory({ gymAnswer: apiError(404, "not_found") });
RevokedGym.name = "State · gym not available (404)";

/* ── Presentation ───────────────────────────────────────────────────── */

export const LongText = staffStory({
  gymName: "Bokserski Klub Sportowy Wybrzeże Gdańsk–Gdynia–Sopot Akademia",
  staff: ok({ staff: team("owner", true), next_cursor: null }),
});
LongText.name = "Long names";

export const GermanLocale = {
  ...staffStory(),
  decorators: [
    (Story: () => ReactNode) => (
      <German>
        <Story />
      </German>
    ),
  ],
} satisfies StoryObj;
GermanLocale.name = "German locale";

export const Light = { ...staffStory(), globals: { theme: "Light" } } satisfies StoryObj;
Light.name = "Light theme";

export const Dark = { ...staffStory(), globals: { theme: "Dark" } } satisfies StoryObj;
Dark.name = "Dark theme";

export const Narrow = {
  ...staffStory(),
  globals: { viewport: { value: "phone", isRotated: false } },
} satisfies StoryObj;
Narrow.name = "Narrow viewport";
