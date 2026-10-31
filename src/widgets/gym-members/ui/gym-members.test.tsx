import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Gym,
  GymEnrollmentSettings,
  GymMember,
  GymMemberImportPreviewResponsePreview,
  GymMemberInvitation,
  GymViewerPermissionsItem,
} from "@/shared/api/generated/model";
import { Toaster } from "@/shared/ui/sonner";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { GymMembers } from "./gym-members";

/*
 * The gym's members (SF-96, WG3 with OG12) with the network mocked at
 * `fetch`: everything shown is the SF-95 answer, the actions offered follow
 * the viewer's permission projection, nothing changes on screen before the
 * backend answers, member invitations honour the server's gate, and the
 * member-list preview stores and sends nothing.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
  onSessionBoundary: () => () => undefined,
}));

const GYM = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";
const MARTA = "8a1b2c3d-0000-4000-8000-000000000301";
const PIOTR = "8a1b2c3d-0000-4000-8000-000000000302";
const EWA = "8a1b2c3d-0000-4000-8000-000000000303";
const INVITE = "9b1b2c3d-0000-4000-8000-000000000401";

const PERMISSIONS: Record<Gym["viewer"]["role"], GymViewerPermissionsItem[]> = {
  owner: [
    "view_workspace",
    "view_staff",
    "manage_member_enrollment",
    "manage_enrollment_settings",
    "view_members",
    "change_member_status",
  ],
  manager: [
    "view_workspace",
    "view_staff",
    "manage_member_enrollment",
    "manage_enrollment_settings",
    "view_members",
    "change_member_status",
  ],
  coach: ["view_workspace", "view_staff", "view_members"],
  front_desk: ["view_workspace", "view_staff", "manage_member_enrollment", "view_members"],
};

const gym = (role: Gym["viewer"]["role"] = "owner"): Gym => ({
  id: GYM,
  name: "Ring One Boxing",
  gym_type: "boxing_club",
  setup_status: "completed",
  inserted_at: "2026-10-27T10:00:00Z",
  updated_at: "2026-10-27T10:00:00Z",
  locations: [],
  viewer: {
    role,
    staff_membership_id: "6a1b2c3d-0000-4000-8000-000000000101",
    permissions: PERMISSIONS[role],
  },
});

const member = (id: string, name: string, overrides: Partial<GymMember> = {}): GymMember => ({
  gym_member_id: id,
  name,
  status: "active",
  joined_via: "join_code",
  auto_approved: false,
  requested_at: "2026-10-28T09:00:00Z",
  joined_at: "2026-10-28T10:00:00Z",
  responded_at: null,
  ended_at: null,
  ended_reason: null,
  ...overrides,
});

const request = (id: string, name: string) =>
  member(id, name, { status: "requested", joined_at: null });

const invitation = (overrides: Partial<GymMemberInvitation> = {}): GymMemberInvitation => ({
  invitation_id: INVITE,
  status: "pending",
  recipient_email: "k•••@example.com",
  invited_by: { staff_membership_id: "6a1b2c3d-0000-4000-8000-000000000101", name: "Yauheni B." },
  created_at: "2026-10-28T10:00:00Z",
  expires_at: "2026-11-04T10:00:00Z",
  last_sent_at: "2026-10-28T10:00:00Z",
  resends_remaining: 3,
  responded_at: null,
  gym_member_id: null,
  ...overrides,
});

const settings = (overrides: Partial<GymEnrollmentSettings> = {}): GymEnrollmentSettings => ({
  join_code: "ABCD-EFGH",
  join_code_rotated_at: "2026-10-28T10:00:00Z",
  auto_approve: false,
  auto_approve_changed_at: null,
  can_manage: true,
  ...overrides,
});

type Answer = { status: number; body?: unknown } | Error;
type Call = { method: string; path: string; search: string; body: unknown };

const MEMBERS = `/api/v1/gyms/${GYM}/members`;
const REQUESTS = `/api/v1/gyms/${GYM}/join-requests`;
const INVITATIONS = `/api/v1/gyms/${GYM}/member-invitations`;
const ENROLLMENT = `/api/v1/gyms/${GYM}/enrollment`;
const PREVIEW = `/api/v1/gyms/${GYM}/member-imports/preview`;

/** What reads answer when a test does not say otherwise (refreshes after an action). */
const DEFAULTS: Record<string, Answer[]> = {
  [`GET ${MEMBERS}`]: [
    { status: 200, body: { members: [member(MARTA, "Marta K.")], next_cursor: null } },
  ],
  [`GET ${REQUESTS}`]: [{ status: 200, body: { members: [], next_cursor: null } }],
  [`GET ${INVITATIONS}`]: [{ status: 200, body: { invitations: [], next_cursor: null } }],
  [`GET ${ENROLLMENT}`]: [{ status: 200, body: { enrollment: settings() } }],
  [`GET /api/v1/gyms/${GYM}`]: [{ status: 200, body: { gym: gym("owner") } }],
};

/** A fake API keyed by `METHOD path`: queued answers in order (the last one repeats). */
function api(routes: Record<string, Answer[]> = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      const { pathname, search } = new URL(url);
      const method = (init.method ?? "GET").toUpperCase();
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: pathname, search, body });
      const queue =
        routes[`${method} ${pathname}${search}`] ??
        routes[`${method} ${pathname}`] ??
        DEFAULTS[`${method} ${pathname}`];
      if (!queue) return Promise.resolve(jsonResponse({}, { status: 200 }));
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve(
        answer.body === undefined
          ? new Response(null, { status: answer.status })
          : jsonResponse(answer.body, { status: answer.status }),
      );
    }),
  );
  return calls;
}

const error = (status: number, code: string, details: Record<string, unknown> = {}) => ({
  status,
  body: { error: { code, message: code, details, request_id: null } },
});

const user = userEvent.setup();
/** The page as the console shows it, with the app's toasts (where action results are announced). */
const show = (role: Gym["viewer"]["role"]) =>
  renderWithProviders(
    <>
      <GymMembers gym={gym(role)} />
      <Toaster />
    </>,
  );
/** A section tab; Join requests carries the backend's count of waiting requests once complete. */
const tab = (name: string) =>
  user.click(
    screen.getByRole("tab", {
      name: name === "Join requests" ? /^Join requests(, \d+ waiting)?$/ : name,
    }),
  );

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

describe("GymMembers (WG3, SF-96)", () => {
  it("shows the owner the real roster, only SF-95 facts, and the permitted actions", async () => {
    const calls = api({
      [`GET ${MEMBERS}?status=active&limit=50`]: [
        {
          status: 200,
          body: {
            members: [
              member(MARTA, "Marta K."),
              member(PIOTR, "Piotr Z.", { joined_via: "invitation", requested_at: null }),
            ],
            next_cursor: null,
          },
        },
      ],
    });
    await show("owner");

    const table = await screen.findByRole("table", { name: "Active members" });
    expect(within(table).getByText("Marta K.")).toBeVisible();
    expect(within(table).getByText("Piotr Z.")).toBeVisible();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Member",
      "Joined",
      "Joined with",
      "Status",
    ]);
    // No plan, payment, visits, location or contact: those facts do not exist.
    expect(table).not.toHaveTextContent(/plan|paid|visits|last visit|@/i);
    // The list is complete: its length is a real count.
    expect(screen.getByText("2 members", { selector: "[data-members-count]" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "The gym can’t see" })).toBeVisible();
    expect(screen.getByRole("button", { name: "End membership" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Invite member" })).toBeVisible();
    for (const name of [
      "Members",
      /^Join requests/,
      "Invitations",
      "Join code & approval",
      "Import preview",
    ]) {
      expect(screen.getByRole("tab", { name })).toBeVisible();
    }
    expect(calls.every((call) => call.path.includes(GYM))).toBe(true);
  });

  it("shows no total while more pages exist, and loads the next page on request", async () => {
    api({
      [`GET ${MEMBERS}?status=active&limit=50`]: [
        { status: 200, body: { members: [member(MARTA, "Marta K.")], next_cursor: "c1" } },
      ],
      [`GET ${MEMBERS}?status=active&limit=50&cursor=c1`]: [
        { status: 200, body: { members: [member(PIOTR, "Piotr Z.")], next_cursor: null } },
      ],
    });
    await show("owner");
    await screen.findByRole("table", { name: "Active members" });
    expect(document.querySelector("[data-members-count]")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(
      await within(screen.getByRole("table", { name: "Active members" })).findByText("Piotr Z."),
    ).toBeVisible();
    expect(screen.getByText("2 members", { selector: "[data-members-count]" })).toBeVisible();
  });

  it("shows a coach the backend's refusal and nothing else of the members", async () => {
    const calls = api({ [`GET ${MEMBERS}`]: [error(403, "forbidden")] });
    await show("coach");
    expect(await screen.findByText("Your role can’t see this yet")).toBeVisible();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("button", { name: "Invite member" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ended" })).toBeNull();
    expect(calls.some((call) => [REQUESTS, INVITATIONS, ENROLLMENT].includes(call.path))).toBe(
      false,
    );
  });

  it("lets front desk answer requests and read the code, but not end memberships or change settings", async () => {
    api({
      [`GET ${ENROLLMENT}`]: [
        { status: 200, body: { enrollment: settings({ can_manage: false }) } },
      ],
    });
    await show("front_desk");
    await screen.findByRole("table", { name: "Active members" });
    expect(screen.queryByRole("button", { name: "End membership" })).toBeNull();
    expect(screen.getByText("Only the owner and managers can end a membership.")).toBeVisible();

    await tab("Join code & approval");
    expect(await screen.findByText("ABCD-EFGH")).toBeVisible();
    expect(screen.queryByRole("button", { name: "New code" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Turn off" })).toBeNull();
    expect(screen.getByRole("switch")).toBeDisabled();
  });

  it("approves a request only through the backend, then reads everything again", async () => {
    const calls = api({
      // The page's read, the read on opening the tab, then the read after the answer.
      [`GET ${REQUESTS}`]: [
        { status: 200, body: { members: [request(EWA, "Ewa M.")], next_cursor: null } },
        { status: 200, body: { members: [request(EWA, "Ewa M.")], next_cursor: null } },
        { status: 200, body: { members: [], next_cursor: null } },
      ],
      [`GET ${MEMBERS}?status=active&limit=50`]: [
        { status: 200, body: { members: [member(MARTA, "Marta K.")], next_cursor: null } },
        {
          status: 200,
          body: { members: [member(MARTA, "Marta K."), member(EWA, "Ewa M.")], next_cursor: null },
        },
      ],
      [`POST ${REQUESTS}/${EWA}/approve`]: [
        { status: 200, body: { member: member(EWA, "Ewa M.") } },
      ],
    });
    await show("owner");
    await screen.findByRole("table", { name: "Active members" });
    await tab("Join requests");
    expect(await screen.findByText("Ewa M.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Approve Ewa M." }));
    expect(await screen.findByText("Ewa M. is now a member of Ring One Boxing.")).toBeVisible();
    await waitFor(() => expect(screen.getByText("No requests are waiting.")).toBeVisible());
    expect(calls.filter((call) => call.path === `${REQUESTS}/${EWA}/approve`)).toHaveLength(1);

    // The roster shows the member once the backend lists them, not before.
    await tab("Members");
    const table = await screen.findByRole("table", { name: "Active members" });
    expect(await within(table).findByText("Ewa M.")).toBeVisible();
  });

  it("says when a request was already decided elsewhere, instead of claiming a result", async () => {
    api({
      [`GET ${REQUESTS}`]: [
        { status: 200, body: { members: [request(PIOTR, "Ola P.")], next_cursor: null } },
      ],
      [`POST ${REQUESTS}/${PIOTR}/approve`]: [error(409, "conflict", { gym_member: "cancelled" })],
    });
    await show("manager");
    await tab("Join requests");
    await user.click(await screen.findByRole("button", { name: "Approve Ola P." }));
    expect(
      await screen.findByText("The person cancelled this request. The page is up to date."),
    ).toBeVisible();
    expect(screen.queryByText(/Ola P\. is now a member/)).toBeNull();
  });

  it("asks before rejecting, then rejects through the backend", async () => {
    const calls = api({
      [`GET ${REQUESTS}`]: [
        { status: 200, body: { members: [request(EWA, "Ewa M.")], next_cursor: null } },
      ],
      [`POST ${REQUESTS}/${EWA}/reject`]: [
        { status: 200, body: { member: { ...request(EWA, "Ewa M."), status: "rejected" } } },
      ],
    });
    await show("owner");
    await tab("Join requests");
    await user.click(await screen.findByRole("button", { name: "Reject Ewa M." }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/won’t become a member of Ring One Boxing/)).toBeVisible();
    expect(calls.some((call) => call.path.endsWith("/reject"))).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Reject request" }));
    expect(await screen.findByText("Ewa M.’s request was rejected.")).toBeVisible();
    expect(calls.filter((call) => call.path === `${REQUESTS}/${EWA}/reject`)).toHaveLength(1);
  });

  it("ends a membership only after a confirmation that spares the account, profiles and other gyms", async () => {
    const calls = api({
      [`POST ${MEMBERS}/${MARTA}/remove`]: [
        {
          status: 200,
          body: {
            member: member(MARTA, "Marta K.", {
              status: "ended",
              ended_at: "2026-10-30T10:00:00Z",
              ended_reason: "removed",
            }),
          },
        },
      ],
    });
    await show("owner");
    await user.click(await screen.findByRole("button", { name: "End membership" }));
    const dialog = await screen.findByRole("alertdialog");
    for (const line of [
      "Their SimpleFit account isn’t deleted.",
      "Their Fighter or Coach profile isn’t changed.",
      "Their coaches and training stay as they are.",
      "Memberships at other gyms aren’t affected.",
    ]) {
      expect(within(dialog).getByText(line)).toBeVisible();
    }
    expect(calls.some((call) => call.path.endsWith("/remove"))).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "End membership" }));
    expect(
      await screen.findByText("Marta K. is no longer a member of Ring One Boxing."),
    ).toBeVisible();
    expect(calls.filter((call) => call.path === `${MEMBERS}/${MARTA}/remove`)).toHaveLength(1);
  });

  it("never claims an invitation was sent while the server keeps member invitations off", async () => {
    const calls = api({
      [`POST ${INVITATIONS}`]: [
        error(409, "conflict", { member_invitation: "recipient_flow_unavailable" }),
      ],
      [`GET ${INVITATIONS}`]: [
        { status: 200, body: { invitations: [invitation()], next_cursor: null } },
      ],
    });
    await show("owner");
    await user.click(await screen.findByRole("button", { name: "Invite member" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Email address"), "kasia@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Create invitation" }));

    expect(
      await within(dialog).findByText("Member invitations aren’t available yet"),
    ).toBeVisible();
    expect(within(dialog).getByText(/Nothing was created and no email was sent/)).toBeVisible();
    expect(within(dialog).queryByText(/pending until/i)).toBeNull();
    expect(
      calls.filter((call) => call.method === "POST" && call.path === INVITATIONS),
    ).toHaveLength(1);
    await user.click(within(dialog).getByRole("button", { name: "OK" }));

    // The page stops offering what the server refuses; pending ones can still be cancelled.
    expect(screen.queryByRole("button", { name: "Invite member" })).toBeNull();
    await tab("Invitations");
    expect(await screen.findByText(/No invitations can be created or resent/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Resend/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Cancel the invitation for k•••@example.com" }),
    ).toBeVisible();
  });

  it("says an accepted invitation is pending, never sent, where invitations are on", async () => {
    api({ [`POST ${INVITATIONS}`]: [{ status: 201, body: { invitation: invitation() } }] });
    await show("owner");
    await user.click(await screen.findByRole("button", { name: "Invite member" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Email address"), "kasia@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Create invitation" }));
    expect(await within(dialog).findByText("Invitation pending")).toBeVisible();
    expect(within(dialog).queryByText(/\bsent\b|delivered/i)).toBeNull();
  });

  it("issues a new join code only after confirmation and never shows the old one again", async () => {
    const calls = api({
      [`GET ${ENROLLMENT}`]: [
        { status: 200, body: { enrollment: settings() } },
        { status: 200, body: { enrollment: settings({ join_code: "WXYZ-2345" }) } },
      ],
      [`POST /api/v1/gyms/${GYM}/join-code/rotate`]: [
        { status: 200, body: { enrollment: settings({ join_code: "WXYZ-2345" }) } },
      ],
    });
    await show("owner");
    await tab("Join code & approval");
    expect(await screen.findByText("ABCD-EFGH")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "New code" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(calls.some((call) => call.path.endsWith("/join-code/rotate"))).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Issue new code" }));
    expect(await screen.findByText("WXYZ-2345")).toBeVisible();
    expect(screen.queryByText("ABCD-EFGH")).toBeNull();
    // The code never lands in a URL or storage.
    expect(window.location.href).not.toContain("WXYZ");
    expect(JSON.stringify({ ...window.localStorage, ...window.sessionStorage })).not.toContain(
      "WXYZ",
    );
  });

  it("explains auto-approval before switching it on, and sends only the backend's setting", async () => {
    const on = settings({ auto_approve: true, auto_approve_changed_at: "2026-10-30T10:00:00Z" });
    const calls = api({
      [`GET ${ENROLLMENT}`]: [
        { status: 200, body: { enrollment: settings() } },
        { status: 200, body: { enrollment: on } },
      ],
      [`PATCH ${ENROLLMENT}`]: [
        {
          status: 200,
          body: {
            enrollment: settings({
              auto_approve: true,
              auto_approve_changed_at: "2026-10-30T10:00:00Z",
            }),
          },
        },
      ],
    });
    await show("owner");
    await tab("Join code & approval");
    await user.click(await screen.findByRole("switch"));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/verified sign-in/)).toBeVisible();
    expect(within(dialog).getByText(/Everyone else still waits for your answer/)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(screen.getByRole("switch")).toBeChecked());
    expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({ auto_approve: true });
  });

  it("previews a CSV through the backend and shows only its masked dry run, with no import", async () => {
    const preview: GymMemberImportPreviewResponsePreview = {
      persisted: false,
      commit: { available: false, blocked_by: "legal_basis_pending" },
      delimiter: ",",
      columns: [
        { header: "name", field: "name", status: "mapped" },
        { header: "email", field: "email", status: "mapped" },
        { header: "plan", field: null, status: "not_imported" },
      ],
      summary: {
        total: 3,
        ready: 1,
        duplicate: 1,
        invalid_email: 1,
        missing_email: 0,
        already_member: 0,
        already_invited: 0,
        request_pending: 0,
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
          email: "a•••@example.com",
          name_present: true,
          outcome: "duplicate",
          duplicate_of_line: 2,
        },
        {
          line: 4,
          email: null,
          name_present: false,
          outcome: "invalid_email",
          duplicate_of_line: null,
        },
      ],
    };
    const calls = api({ [`POST ${PREVIEW}`]: [{ status: 200, body: { preview } }] });
    await show("owner");
    await tab("Import preview");
    expect(screen.getByText(/Importing members is not available yet/)).toBeVisible();

    const csv =
      "name,email,plan\nAnna Nowak,anna@example.com,Unlimited\nAnna N,ANNA@example.com,x\n,not-an-email,y\n";
    const input = document.querySelector<HTMLInputElement>("[data-import-input]")!;
    fireEvent.change(input, {
      target: { files: [new File([csv], "members.csv", { type: "text/csv" })] },
    });
    expect(await screen.findByRole("heading", { name: "Map columns" })).toBeVisible();
    // The browser keeps no reference to the file in the input.
    expect(input.value).toBe("");

    await user.click(screen.getByRole("button", { name: "Run validation" }));
    expect(await screen.findByRole("heading", { name: "Review results" })).toBeVisible();
    const sent = calls.find((call) => call.path === PREVIEW)!;
    expect(sent.body).toEqual({ csv });
    expect(screen.getAllByText("a•••@example.com")).toHaveLength(2);
    expect(screen.queryByText("anna@example.com")).toBeNull();
    expect(screen.getByText("Same address as line 2")).toBeVisible();
    expect(screen.getByText("Not used: plan.")).toBeVisible();
    expect(
      screen.getByText(/Validation complete. Importing member records is not available yet./),
    ).toBeVisible();
    // No commit control, no success claim, nothing else called.
    expect(screen.queryByRole("button", { name: /^import|commit|send invit/i })).toBeNull();
    expect(screen.queryByText(/imported successfully|import completed|members added/i)).toBeNull();
    expect(calls.filter((call) => call.method !== "GET").map((call) => call.path)).toEqual([
      PREVIEW,
    ]);
    expect(JSON.stringify({ ...window.localStorage, ...window.sessionStorage })).not.toContain(
      "anna@",
    );

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByRole("heading", { name: "Review results" })).toBeNull();
    expect(screen.getByText("No file chosen.")).toBeVisible();
  });

  it("refuses an oversized file in the browser without sending it", async () => {
    const calls = api();
    await show("owner");
    await tab("Import preview");
    const input = document.querySelector<HTMLInputElement>("[data-import-input]")!;
    const big = new File(["email\n" + "a".repeat(1_000_001)], "big.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText("This file is larger than 1 MB.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Run validation" })).toBeNull();
    expect(calls.some((call) => call.path === PREVIEW)).toBe(false);
  });

  it("names a file the backend cannot read without claiming any result", async () => {
    api({
      [`POST ${PREVIEW}`]: [
        error(422, "validation_error", {
          fields: { csv: ["unterminated_quote at line 3"] },
          field_codes: { csv: ["invalid"] },
        }),
      ],
    });
    await show("owner");
    await tab("Import preview");
    const input = document.querySelector<HTMLInputElement>("[data-import-input]")!;
    fireEvent.change(input, {
      target: { files: [new File(['email\n"open'], "bad.csv", { type: "text/csv" })] },
    });
    await user.click(await screen.findByRole("button", { name: "Run validation" }));
    expect(await screen.findByText(/couldn’t be read as a member list/)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Review results" })).toBeNull();
  });
});
