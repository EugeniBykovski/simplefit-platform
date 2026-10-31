import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, useLocale, useMessages } from "next-intl";
import type { ReactNode } from "react";
import { expect, fireEvent, userEvent, within } from "storybook/test";

import { GymGate, RequireSession } from "@/features/session-gate";
import { formats } from "@/shared/i18n/formats";
import { signInRouteFor } from "@/shared/routes/routes";
import {
  apiError,
  installApi,
  ok,
  SESSION,
  VIEWER,
  type Answer,
} from "@/stories/support/auth-story-api";
import { GymMembers } from "@/widgets/gym-members";
import { GymWorkspace, useGymWorkspace } from "@/widgets/gym-workspace";
import { EntryFailure, LaunchScreen, SessionFailure } from "@/widgets/system-states";

import deContextSwitcher from "../../../../messages/de/contextSwitcher.json";
import deGymConsole from "../../../../messages/de/gymConsole.json";
import deShells from "../../../../messages/de/shells.json";

/*
 * The gym's members (SF-96, WG3 with OG12) in the route's own composition
 * (session gate, GYM_WORKSPACE gate, the console of the gym in the path) on
 * a deterministic stand-in of the SF-95 API (`fetch` is replaced per story;
 * nothing reaches a backend). Names, masked addresses, codes and CSV rows
 * are Storybook fixtures; production pages show only the backend's data.
 */

const RING = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";
const ANNEX = "9b4e2d61-7a3c-4f85-8e1d-6c2a0b5f3d97";
const VIEWER_ROW = "5e2c7a91-3f4b-4d6e-8a0c-1b9d7f3e5a24";

type Role = "owner" | "manager" | "coach" | "front_desk";

const ENROLL = ["manage_member_enrollment", "view_members"];
const PERMISSIONS: Record<Role, string[]> = {
  owner: [
    "view_workspace",
    "view_staff",
    ...ENROLL,
    "manage_enrollment_settings",
    "change_member_status",
  ],
  manager: [
    "view_workspace",
    "view_staff",
    ...ENROLL,
    "manage_enrollment_settings",
    "change_member_status",
  ],
  coach: ["view_workspace", "view_staff", "view_members"],
  front_desk: ["view_workspace", "view_staff", ...ENROLL],
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
    viewer: { role, staff_membership_id: VIEWER_ROW, permissions: PERMISSIONS[role] },
  },
});

const row = (n: number, name: string | null, extra: Record<string, unknown> = {}) => ({
  gym_member_id: `8a000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  name,
  status: "active",
  joined_via: "join_code",
  auto_approved: false,
  requested_at: "2026-10-21T09:00:00Z",
  joined_at: "2026-10-21T10:00:00Z",
  responded_at: null,
  ended_at: null,
  ended_reason: null,
  ...extra,
});

const ACTIVE = [
  row(1, "Marta K."),
  row(2, "Piotr Z.", { joined_via: "invitation", requested_at: null }),
  row(3, "Dawid N.", { auto_approved: true }),
  row(4, "Ewa M."),
];
const ENDED = [
  row(11, "Igor P.", { status: "ended", ended_at: "2026-10-28T10:00:00Z", ended_reason: "left" }),
  row(12, "Agata W.", {
    status: "ended",
    ended_at: "2026-10-29T10:00:00Z",
    ended_reason: "removed",
  }),
];
const REQUESTS = [
  row(21, "Rafał T.", { status: "requested", joined_at: null }),
  row(22, "Kamila L.", {
    status: "requested",
    joined_at: null,
    requested_at: "2026-10-29T08:00:00Z",
  }),
];

const invitation = (n: number, status: string, email: string) => ({
  invitation_id: `9b000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  status,
  recipient_email: email,
  invited_by: { staff_membership_id: VIEWER_ROW, name: "Yauheni B." },
  created_at: "2026-10-28T10:00:00Z",
  expires_at: "2026-11-04T10:00:00Z",
  last_sent_at: "2026-10-28T10:00:00Z",
  resends_remaining: status === "pending" ? 3 : 0,
  responded_at: status === "pending" || status === "expired" ? null : "2026-10-29T10:00:00Z",
  gym_member_id: null,
});
const INVITATIONS = [
  invitation(1, "pending", "k•••@example.com"),
  invitation(2, "expired", "o•••@example.com"),
  invitation(3, "accepted", "a•••@example.com"),
];

const enrollment = (extra: Record<string, unknown> = {}) =>
  ok({
    enrollment: {
      join_code: "K7QM-4TXD",
      join_code_rotated_at: "2026-10-21T10:00:00Z",
      auto_approve: false,
      auto_approve_changed_at: null,
      can_manage: true,
      ...extra,
    },
  });

const PREVIEW = {
  persisted: false,
  commit: { available: false, blocked_by: "legal_basis_pending" },
  delimiter: ",",
  columns: [
    { header: "name", field: "name", status: "mapped" },
    { header: "email", field: "email", status: "mapped" },
    { header: "karnet", field: null, status: "not_imported" },
    { header: "tel", field: null, status: "not_imported" },
  ],
  summary: {
    total: 6,
    ready: 2,
    already_member: 1,
    request_pending: 0,
    already_invited: 1,
    duplicate: 1,
    missing_email: 0,
    invalid_email: 1,
  },
  rows: [
    {
      line: 2,
      email: "a•••@example.com",
      name_present: true,
      outcome: "ready",
      duplicate_of_line: null,
    },
    {
      line: 3,
      email: "m•••@example.com",
      name_present: true,
      outcome: "already_member",
      duplicate_of_line: null,
    },
    {
      line: 4,
      email: "k•••@example.com",
      name_present: true,
      outcome: "already_invited",
      duplicate_of_line: null,
    },
    {
      line: 5,
      email: "a•••@example.com",
      name_present: true,
      outcome: "duplicate",
      duplicate_of_line: 2,
    },
    { line: 6, email: null, name_present: true, outcome: "invalid_email", duplicate_of_line: null },
    {
      line: 7,
      email: "t•••@example.org",
      name_present: false,
      outcome: "ready",
      duplicate_of_line: null,
    },
  ],
};
// Fixture only: the page never shows these values, only the backend's masked answer.
const CSV = "name,email,karnet,tel\nAnna,anna@example.com,Open,1\n";

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

/** The members page of the console's gym, as its route renders it. */
function Members() {
  return <GymMembers gym={useGymWorkspace()} />;
}

/** The app's named date formats (the request config's), over the preview's provider. */
function AppFormats({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale={useLocale()}
      timeZone="UTC"
      messages={useMessages()}
      formats={formats}
    >
      {children}
    </NextIntlClientProvider>
  );
}

function membersStory({
  role = "owner",
  gymId = RING,
  gymName = "Ring One Boxing",
  me = ok({ user: VIEWER }),
  gymAnswer,
  members = ok({ members: ACTIVE, next_cursor: null }),
  ended = ok({ members: ENDED, next_cursor: null }),
  requests = ok({ members: REQUESTS, next_cursor: null }),
  invitations = ok({ invitations: INVITATIONS, next_cursor: null }),
  settings = enrollment(),
  routes = {},
  play,
}: {
  role?: Role;
  gymId?: string;
  gymName?: string;
  me?: Answer;
  gymAnswer?: Answer | Answer[];
  members?: Answer | Answer[];
  ended?: Answer | Answer[];
  requests?: Answer | Answer[];
  invitations?: Answer | Answer[];
  settings?: Answer | Answer[];
  routes?: Record<string, Answer | Answer[]>;
  play?: StoryObj["play"];
} = {}): StoryObj {
  const base = `/api/v1/gyms/${gymId}`;
  return {
    parameters: {
      nextjs: { appDirectory: true, navigation: { pathname: `/en/app/gyms/${gymId}/members` } },
    },
    beforeEach: () =>
      installApi({
        "/api/me": me,
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/me/entry": ok(entry(role)),
        [base]: gymAnswer ?? ok(gym(gymId, gymName, role)),
        [`${base}/members?status=ended`]: ended,
        [`${base}/members`]: members,
        [`${base}/join-requests`]: requests,
        [`${base}/member-invitations`]: invitations,
        [`${base}/enrollment`]: settings,
        ...routes,
      }),
    render: () => (
      <AppFormats>
        <RequireSession
          signIn={signInRouteFor("web")}
          pending={<LaunchScreen />}
          unavailable={<SessionFailure />}
        >
          <GymGate pending={<LaunchScreen />} failure={<EntryFailure />}>
            <GymWorkspace gymId={gymId}>
              <Members />
            </GymWorkspace>
          </GymGate>
        </RequireSession>
      </AppFormats>
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
  title: "Gym Console/Members",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const T = 5000;
const roster = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole("table", { name: "Active members" }, { timeout: T });
const body = () => within(document.body);
const openTab = async (canvasElement: HTMLElement, name: string | RegExp) =>
  userEvent.click(await within(canvasElement).findByRole("tab", { name }, { timeout: T }));

/** Chooses a file in the import tab as a person would (the input is the browser's own picker). */
async function chooseFile(canvasElement: HTMLElement, file: File) {
  await openTab(canvasElement, "Import preview");
  const input = canvasElement.ownerDocument.querySelector<HTMLInputElement>("[data-import-input]")!;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  fireEvent.change(input);
}
const csvFile = () => new File([CSV], "members_export.csv", { type: "text/csv" });

/* ── Roster ─────────────────────────────────────────────────────────── */

export const OwnerActive = membersStory({
  play: async ({ canvasElement }) => {
    const table = await roster(canvasElement);
    await expect(within(table).getByText("Marta K.")).toBeVisible();
    await expect(within(canvasElement).getByText("4 members")).toBeVisible();
  },
});
OwnerActive.name = "WG3 · owner · active members";

export const EmptyRoster = membersStory({
  members: ok({ members: [], next_cursor: null }),
  requests: ok({ members: [], next_cursor: null }),
  invitations: ok({ invitations: [], next_cursor: null }),
});
EmptyRoster.name = "WG3 · empty roster";

export const EndedMembers = membersStory({
  play: async ({ canvasElement }) => {
    await roster(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Ended" }));
    await expect(
      await within(canvasElement).findByRole(
        "table",
        { name: "Ended memberships" },
        { timeout: T },
      ),
    ).toBeVisible();
  },
});
EndedMembers.name = "WG3 · ended memberships";

export const EndConfirmation = membersStory({
  play: async ({ canvasElement }) => {
    await roster(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "End membership" }));
    await expect(await body().findByRole("alertdialog")).toHaveTextContent(
      "End Marta K.’s membership?",
    );
  },
});
EndConfirmation.name = "WG3 · end membership · confirmation";

/* ── Roles ──────────────────────────────────────────────────────────── */

export const Manager = membersStory({ role: "manager" });
Manager.name = "Manager · every enrollment action";

export const FrontDesk = membersStory({
  role: "front_desk",
  settings: enrollment({ can_manage: false }),
});
FrontDesk.name = "Front desk · requests, code read-only, no ending";

export const CoachRestricted = membersStory({
  role: "coach",
  members: apiError(403, "forbidden"),
});
CoachRestricted.name = "Coach · roster refused by the backend";

export const OtherGym = membersStory({
  role: "manager",
  gymId: ANNEX,
  gymName: "Annex Club",
  members: ok({ members: [row(31, "Ola P.")], next_cursor: null }),
  requests: ok({ members: [], next_cursor: null }),
});
OtherGym.name = "A different gym (manager there)";

/* ── Requests ───────────────────────────────────────────────────────── */

export const PendingRequests = membersStory({
  play: async ({ canvasElement }) => {
    await openTab(canvasElement, /^Join requests/);
    await expect(await within(canvasElement).findByText("Rafał T.")).toBeVisible();
  },
});
PendingRequests.name = "Requests · pending";

const APPROVE = `/api/v1/gyms/${RING}/join-requests/${REQUESTS[0]!.gym_member_id}/approve`;
const approveRequest = membersStory({
  routes: {
    [`POST ${APPROVE}`]: ok({
      member: { ...REQUESTS[0], status: "active", joined_at: "2026-10-30T10:00:00Z" },
    }),
  },
  play: async ({ canvasElement }) => {
    await openTab(canvasElement, /^Join requests/);
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "Approve Rafał T." }),
    );
    await expect(
      await body().findByText("Rafał T. is now a member of Ring One Boxing.", {}, { timeout: T }),
    ).toBeVisible();
  },
});
/** The stand-in keeps state: once approved, the request is no longer listed. */
function rememberApproval() {
  const stub = window.fetch;
  let approved = false;
  window.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    if (url.pathname === APPROVE) approved = true;
    if (approved && url.pathname === `/api/v1/gyms/${RING}/join-requests`) {
      return new Response(JSON.stringify({ members: REQUESTS.slice(1), next_cursor: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return stub(input, init);
  };
  return () => {
    window.fetch = stub;
  };
}
export const ApproveRequest = {
  ...approveRequest,
  // Runs after the stand-in is installed; cleanups run in reverse.
  beforeEach: [approveRequest.beforeEach ?? [], rememberApproval].flat(),
} satisfies StoryObj;
ApproveRequest.name = "Requests · approved by the backend";

export const RejectConfirmation = membersStory({
  play: async ({ canvasElement }) => {
    await openTab(canvasElement, /^Join requests/);
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "Reject Kamila L." }),
    );
    await expect(await body().findByRole("alertdialog")).toHaveTextContent("Reject Kamila L.?");
  },
});
RejectConfirmation.name = "Requests · reject confirmation";

export const StaleRequest = membersStory({
  routes: {
    [`POST /api/v1/gyms/${RING}/join-requests/${REQUESTS[0]!.gym_member_id}/approve`]: ok(
      {
        error: {
          code: "conflict",
          message: "conflict",
          details: { gym_member: "cancelled" },
          request_id: null,
        },
      },
      409,
    ),
  },
  play: async ({ canvasElement }) => {
    await openTab(canvasElement, /^Join requests/);
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "Approve Rafał T." }),
    );
    await expect(
      await body().findByText(/The person cancelled this request/, {}, { timeout: T }),
    ).toBeVisible();
  },
});
StaleRequest.name = "Requests · already decided (409)";

/* ── Invitations ────────────────────────────────────────────────────── */

export const InvitationPending = membersStory({
  play: async ({ canvasElement }) => {
    await openTab(canvasElement, "Invitations");
    await expect(await within(canvasElement).findByText("k•••@example.com")).toBeVisible();
  },
});
InvitationPending.name = "Invitations · pending, expired and accepted";

const unavailable = ok(
  {
    error: {
      code: "conflict",
      message: "conflict",
      details: { member_invitation: "recipient_flow_unavailable" },
      request_id: null,
    },
  },
  409,
);

export const InvitationsUnavailable = membersStory({
  routes: { [`POST /api/v1/gyms/${RING}/member-invitations`]: unavailable },
  play: async ({ canvasElement }) => {
    await roster(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Invite member" }));
    const dialog = await body().findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Email address"), "kuba@example.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create invitation" }));
    await expect(
      await within(dialog).findByText("Member invitations aren’t available yet"),
    ).toBeVisible();
  },
});
InvitationsUnavailable.name = "Invitations · off on this server (409)";

export const InviteRateLimited = membersStory({
  routes: {
    [`POST /api/v1/gyms/${RING}/member-invitations`]: apiError(429, "rate_limited", {
      "retry-after": "600",
    }),
  },
  play: async ({ canvasElement }) => {
    await roster(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Invite member" }));
    const dialog = await body().findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Email address"), "kuba@example.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create invitation" }));
    await expect(await within(dialog).findByRole("alert")).toHaveTextContent(/Too many requests/);
  },
});
InviteRateLimited.name = "Invitations · rate limited (429)";

/* ── Join code and approval ─────────────────────────────────────────── */

export const JoinCodeEnabled = membersStory({
  play: async ({ canvasElement }) => {
    await openTab(canvasElement, "Join code & approval");
    await expect(await within(canvasElement).findByText("K7QM-4TXD")).toBeVisible();
  },
});
JoinCodeEnabled.name = "Join code · on";

export const JoinCodeDisabled = membersStory({
  settings: enrollment({ join_code: null, join_code_rotated_at: null }),
  play: async ({ canvasElement }) => {
    await openTab(canvasElement, "Join code & approval");
    await expect(await within(canvasElement).findByText("Joining by code is off.")).toBeVisible();
  },
});
JoinCodeDisabled.name = "Join code · off";

export const RotateConfirmation = membersStory({
  play: async ({ canvasElement }) => {
    await openTab(canvasElement, "Join code & approval");
    await userEvent.click(await within(canvasElement).findByRole("button", { name: "New code" }));
    await expect(await body().findByRole("alertdialog")).toHaveTextContent(
      "Issue a new join code?",
    );
  },
});
RotateConfirmation.name = "Join code · new code confirmation";

export const AutoApprovalConfirmation = membersStory({
  play: async ({ canvasElement }) => {
    await openTab(canvasElement, "Join code & approval");
    await userEvent.click(await within(canvasElement).findByRole("switch"));
    await expect(await body().findByRole("alertdialog")).toHaveTextContent(
      "Approve verified accounts automatically?",
    );
  },
});
AutoApprovalConfirmation.name = "Auto-approval · turning on, explained";

export const AutoApprovalOn = membersStory({
  settings: enrollment({ auto_approve: true, auto_approve_changed_at: "2026-10-29T10:00:00Z" }),
  play: async ({ canvasElement }) => {
    await openTab(canvasElement, "Join code & approval");
    await expect(await within(canvasElement).findByRole("switch")).toBeChecked();
  },
});
AutoApprovalOn.name = "Auto-approval · on";

/* ── Import preview ─────────────────────────────────────────────────── */

export const CsvSelection = membersStory({
  play: async ({ canvasElement }) => {
    await openTab(canvasElement, "Import preview");
    await expect(await within(canvasElement).findByText("No file chosen.")).toBeVisible();
  },
});
CsvSelection.name = "Import · choose a file";

export const CsvMapping = membersStory({
  play: async ({ canvasElement }) => {
    await chooseFile(canvasElement, csvFile());
    await expect(
      await within(canvasElement).findByRole("heading", { name: "Map columns" }, { timeout: T }),
    ).toBeVisible();
  },
});
CsvMapping.name = "Import · map columns";

const previewed = (answer: Answer, then?: (canvasElement: HTMLElement) => Promise<void>) =>
  membersStory({
    routes: { [`POST /api/v1/gyms/${RING}/member-imports/preview`]: answer },
    play: async ({ canvasElement }) => {
      await chooseFile(canvasElement, csvFile());
      await userEvent.click(
        await within(canvasElement).findByRole(
          "button",
          { name: "Run validation" },
          { timeout: T },
        ),
      );
      await then?.(canvasElement);
    },
  });

export const CsvValidPreview = previewed(ok({ preview: PREVIEW }));
CsvValidPreview.name = "Import · validation results (dry run)";

export const CsvInvalidRows = previewed(ok({ preview: PREVIEW }), async (canvasElement) => {
  await userEvent.click(
    await within(canvasElement).findByRole("button", { name: "Needs attention" }, { timeout: T }),
  );
});
CsvInvalidRows.name = "Import · rows needing attention (invalid, duplicate)";

export const CsvSizeViolation = membersStory({
  play: async ({ canvasElement }) => {
    await chooseFile(
      canvasElement,
      new File(["email\n" + "a".repeat(1_000_001)], "too_big.csv", { type: "text/csv" }),
    );
  },
});
CsvSizeViolation.name = "Import · file over 1 MB";

export const CsvPreviewFailure = previewed(
  ok(
    {
      error: {
        code: "validation_error",
        message: "validation_error",
        details: { fields: { csv: ["too_many_rows"] }, field_codes: { csv: ["invalid"] } },
        request_id: null,
      },
    },
    422,
  ),
);
CsvPreviewFailure.name = "Import · the backend cannot read the file";

export const CsvCommitUnavailable = membersStory({
  play: async ({ canvasElement }) => {
    await openTab(canvasElement, "Import preview");
    await expect(
      await within(canvasElement).findByText(/Importing members is not available yet/),
    ).toBeVisible();
  },
});
CsvCommitUnavailable.name = "Import · importing not available (D-G27)";

/* ── States ─────────────────────────────────────────────────────────── */

export const Loading = membersStory({ members: "pending", requests: "pending" });
Loading.name = "State · loading";

export const NetworkFailure = membersStory({ members: "offline" });
NetworkFailure.name = "State · network failure";

export const SessionExpired = membersStory({ me: apiError(401, "unauthorized") });
SessionExpired.name = "State · session expired (back to sign-in)";

export const RevokedGym = membersStory({ gymAnswer: apiError(404, "not_found") });
RevokedGym.name = "State · gym not available (404)";

/* ── Presentation ───────────────────────────────────────────────────── */

export const LongText = membersStory({
  gymName: "Bokserski Klub Sportowy Wybrzeże Gdańsk–Gdynia–Sopot Akademia",
  members: ok({
    members: [row(41, "Małgorzata-Aleksandra K."), row(42, "Bartłomiej-Konstanty W."), ...ACTIVE],
    next_cursor: null,
  }),
});
LongText.name = "Long names";

export const GermanLocale = {
  ...membersStory(),
  decorators: [
    (Story: () => ReactNode) => (
      <German>
        <Story />
      </German>
    ),
  ],
} satisfies StoryObj;
GermanLocale.name = "German locale";

export const Light = { ...membersStory(), globals: { theme: "Light" } } satisfies StoryObj;
Light.name = "Light theme";

export const Dark = { ...membersStory(), globals: { theme: "Dark" } } satisfies StoryObj;
Dark.name = "Dark theme";

export const Narrow = {
  ...membersStory(),
  globals: { viewport: { value: "phone", isRotated: false } },
} satisfies StoryObj;
Narrow.name = "Narrow viewport";
