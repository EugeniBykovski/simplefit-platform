import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGym } from "@/entities/gym";
import type {
  Gym,
  GymStaffInvitation,
  GymStaffMember,
  GymViewerPermissionsItem,
} from "@/shared/api/generated/model";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { GymStaff } from "./gym-staff";

/*
 * The gym's coaches and staff (SF-94, WG16) with the network mocked at
 * `fetch`: everything shown is the SF-93 answer, the actions offered follow
 * the viewer's permission projection, and nothing changes on screen before
 * the backend answers.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));

const GYM = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";
const OWNER_ROW = "5e2c7a91-3f4b-4d6e-8a0c-1b9d7f3e5a24";
const MANAGER_ROW = "6a1b2c3d-0000-4000-8000-000000000101";
const COACH_ROW = "6a1b2c3d-0000-4000-8000-000000000102";
const DESK_ROW = "6a1b2c3d-0000-4000-8000-000000000103";
const INVITE = "7b1b2c3d-0000-4000-8000-000000000201";

const PERMISSIONS: Record<Gym["viewer"]["role"], GymViewerPermissionsItem[]> = {
  owner: [
    "view_workspace",
    "view_staff",
    "view_staff_records",
    "invite_manager",
    "invite_staff",
    "change_staff_role",
    "remove_staff",
  ],
  manager: [
    "view_workspace",
    "view_staff",
    "view_staff_records",
    "invite_staff",
    "change_staff_role",
    "remove_staff",
    "leave_gym",
  ],
  coach: ["view_workspace", "view_staff", "leave_gym"],
  front_desk: ["view_workspace", "view_staff", "leave_gym"],
};

const VIEWER_ROW: Record<Gym["viewer"]["role"], string> = {
  owner: OWNER_ROW,
  manager: MANAGER_ROW,
  coach: COACH_ROW,
  front_desk: DESK_ROW,
};

const gym = (role: Gym["viewer"]["role"] = "owner"): Gym => ({
  id: GYM,
  name: "Ring One Boxing",
  gym_type: "boxing_club",
  setup_status: "completed",
  inserted_at: "2026-10-27T10:00:00Z",
  updated_at: "2026-10-27T10:00:00Z",
  locations: [],
  viewer: { role, staff_membership_id: VIEWER_ROW[role], permissions: PERMISSIONS[role] },
});

const member = (
  id: string,
  role: GymStaffMember["role"],
  name: string,
  viewerRow: string,
): GymStaffMember => ({
  staff_membership_id: id,
  role,
  status: "active",
  name,
  is_viewer: id === viewerRow,
  joined_at: "2026-10-28T10:00:00Z",
  ended_at: null,
  ended_reason: null,
});

const roster = (viewerRow = OWNER_ROW) => [
  member(OWNER_ROW, "owner", "Yauheni B.", viewerRow),
  member(MANAGER_ROW, "manager", "Agnieszka L.", viewerRow),
  member(COACH_ROW, "coach", "Tomasz Z.", viewerRow),
  member(DESK_ROW, "front_desk", "Michał S.", viewerRow),
];

const invitation = (overrides: Partial<GymStaffInvitation> = {}): GymStaffInvitation => ({
  invitation_id: INVITE,
  role: "coach",
  status: "pending",
  recipient_email: "k•••@example.com",
  invited_by: { staff_membership_id: OWNER_ROW, name: "Yauheni B." },
  created_at: "2026-10-28T10:00:00Z",
  expires_at: "2026-11-04T10:00:00Z",
  last_sent_at: "2026-10-28T10:00:00Z",
  resends_remaining: 3,
  responded_at: null,
  staff_membership_id: null,
  ...overrides,
});

type Answer = { status: number; body?: unknown } | Error;
type Call = { method: string; path: string; search: string; body: unknown };

/** A fake API keyed by `METHOD path`: queued answers in order (the last one repeats). */
function api(routes: Record<string, Answer[]>) {
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

const STAFF = `/api/v1/gyms/${GYM}/staff`;
const INVITATIONS = `/api/v1/gyms/${GYM}/staff-invitations`;

/** What reads answer when a test does not say otherwise (refreshes after an action). */
const DEFAULTS: Record<string, Answer[]> = {
  [`GET ${STAFF}`]: [{ status: 200, body: { staff: roster(), next_cursor: null } }],
  [`GET ${INVITATIONS}`]: [{ status: 200, body: { invitations: [], next_cursor: null } }],
  [`GET /api/v1/gyms/${GYM}`]: [{ status: 200, body: { gym: gym("owner") } }],
};

function standard(role: Gym["viewer"]["role"] = "owner", invitations = [invitation()]) {
  return api({
    [`GET ${STAFF}`]: [
      { status: 200, body: { staff: roster(VIEWER_ROW[role]), next_cursor: null } },
    ],
    [`GET ${INVITATIONS}`]: [{ status: 200, body: { invitations, next_cursor: null } }],
  });
}

const user = userEvent.setup();

/** The console's own read of the gym, as the gym layout keeps it while the page is open. */
function WithConsoleGym({ viewerRole }: { viewerRole: Gym["viewer"]["role"] }) {
  useGym(GYM);
  return <GymStaff gym={gym(viewerRole)} />;
}

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

describe("GymStaff (WG16, SF-94)", () => {
  it("shows the owner the real roster, the invitations and every permitted action", async () => {
    const calls = standard("owner");
    await renderWithProviders(<GymStaff gym={gym("owner")} />);

    const table = await screen.findByRole("table", { name: "Active staff" });
    for (const name of ["Yauheni B.", "Agnieszka L.", "Tomasz Z.", "Michał S."]) {
      expect(within(table).getByText(name)).toBeVisible();
    }
    // Only gym facts: no location, last activity or shifts columns.
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Person",
      "Role",
      "Joined",
      "Status",
    ]);
    expect(screen.queryByText(/last active|on shift/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Invite" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Ended" })).toBeVisible();
    expect(await screen.findByText("k•••@example.com")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Resend the invitation to k•••@example.com" }),
    ).toBeVisible();
    // The counts appear once the lists are complete.
    expect(
      await screen.findByText("1 owner · 1 manager · 1 coach · 1 at the front desk"),
    ).toBeVisible();
    // Every read names this gym.
    expect(calls.every((call) => call.path.includes(GYM))).toBe(true);

    // The owner's own row: no action on the owner.
    expect(screen.getByText(/The owner keeps full access/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Show Agnieszka L." }));
    expect(screen.getByRole("button", { name: "Change role" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove from team" })).toBeVisible();
  });

  it("gives coaches and front desk a read-only roster without invitations or ended staff", async () => {
    for (const role of ["coach", "front_desk"] as const) {
      const calls = standard(role);
      const view = await renderWithProviders(<GymStaff gym={gym(role)} />);
      await screen.findByRole("table", { name: "Active staff" });
      expect(screen.queryByRole("button", { name: "Invite" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Ended" })).toBeNull();
      expect(screen.queryByRole("heading", { name: "Invitations" })).toBeNull();
      expect(calls.some((call) => call.path === INVITATIONS)).toBe(false);
      await user.click(screen.getByRole("button", { name: "Show Agnieszka L." }));
      expect(screen.queryByRole("button", { name: "Change role" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Remove from team" })).toBeNull();
      expect(
        screen.getByText("Your role doesn’t include changing this person’s access."),
      ).toBeVisible();
      view.unmount();
      vi.unstubAllGlobals();
    }
  });

  it("limits a manager to coaches and front desk: no action on managers or the owner", async () => {
    standard("manager");
    await renderWithProviders(<GymStaff gym={gym("manager")} />);
    await screen.findByRole("table", { name: "Active staff" });

    await user.click(screen.getByRole("button", { name: "Show Yauheni B." }));
    expect(screen.queryByRole("button", { name: "Change role" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show Tomasz Z." }));
    await user.click(screen.getByRole("button", { name: "Change role" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("value")),
    ).toEqual(["front_desk"]);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Invite" }));
    const invite = await screen.findByRole("dialog");
    expect(
      within(invite)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("value")),
    ).toEqual(["coach", "front_desk"]);
    expect(within(invite).queryByText("Owner")).toBeNull();
  });

  it("invites with exactly the email and role, and says only what the backend kept", async () => {
    const calls = standard("owner", []);
    await renderWithProviders(<GymStaff gym={gym("owner")} />);
    await screen.findByRole("table", { name: "Active staff" });

    await user.click(screen.getByRole("button", { name: "Invite" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("value")),
    ).toEqual(["manager", "coach", "front_desk"]);
    await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    expect(await within(dialog).findByText("Enter a valid email address.")).toBeVisible();

    api({
      [`POST ${INVITATIONS}`]: [
        {
          status: 201,
          body: {
            invitation: invitation({ role: "manager", recipient_email: "n•••@example.com" }),
          },
        },
      ],
      [`GET ${STAFF}`]: [{ status: 200, body: { staff: roster(), next_cursor: null } }],
      [`GET ${INVITATIONS}`]: [{ status: 200, body: { invitations: [], next_cursor: null } }],
    });
    const posted = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock;
    await user.type(within(dialog).getByLabelText("Email"), "  natalia@example.com ");
    await user.click(within(dialog).getByRole("radio", { name: /Manager/ }));
    await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));

    expect(
      await within(dialog).findByText(
        /An invitation to n•••@example.com as Manager is pending until/,
      ),
    ).toBeVisible();
    const post = posted.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1].body))).toEqual({
      email: "natalia@example.com",
      role: "manager",
    });
    expect(dialog).not.toHaveTextContent(/sent|delivered/i);
    expect(calls).toBeDefined();
  });

  it("names a refused or unconfirmed invitation without claiming one exists", async () => {
    standard("owner", []);
    await renderWithProviders(<GymStaff gym={gym("owner")} />);
    await screen.findByRole("table", { name: "Active staff" });
    await user.click(screen.getByRole("button", { name: "Invite" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Email"), "kuba@example.com");
    await user.click(within(dialog).getByRole("radio", { name: /Coach/ }));

    for (const [answer, text] of [
      [
        error(409, "conflict", { staff_invitation: "pending_other_role" }),
        /pending invitation for another role/,
      ],
      [error(409, "conflict", { staff_membership: "already_active" }), /already works at this gym/],
      [error(429, "rate_limited"), /Too many requests/],
      [error(403, "forbidden"), /Your role doesn’t allow this any more/],
      [new TypeError("Failed to fetch"), /couldn’t confirm whether it worked/],
    ] as const) {
      api({ [`POST ${INVITATIONS}`]: [answer as Answer] });
      await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(text);
      expect(within(dialog).queryByText(/is pending until/)).toBeNull();
    }
  });

  it("changes a role only after the backend answers, and says a refusal", async () => {
    standard("owner");
    await renderWithProviders(<WithConsoleGym viewerRole="owner" />);
    await screen.findByRole("table", { name: "Active staff" });
    await user.click(screen.getByRole("button", { name: "Show Tomasz Z." }));
    await user.click(screen.getByRole("button", { name: "Change role" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Change role" })).toBeDisabled();

    api({ [`PATCH ${STAFF}/${COACH_ROW}`]: [error(403, "forbidden")] });
    await user.click(within(dialog).getByRole("radio", { name: /Manager/ }));
    await user.click(within(dialog).getByRole("button", { name: "Change role" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /doesn’t allow this any more/,
    );

    const calls = api({
      [`PATCH ${STAFF}/${COACH_ROW}`]: [
        {
          status: 200,
          body: { staff_member: { ...member(COACH_ROW, "manager", "Tomasz Z.", OWNER_ROW) } },
        },
      ],
    });
    await user.click(within(dialog).getByRole("button", { name: "Change role" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({ role: "manager" });
    // The roster and the viewer's gym are read again.
    await waitFor(() =>
      expect(calls.some((call) => call.method === "GET" && call.path === STAFF)).toBe(true),
    );
    expect(calls.some((call) => call.path === `/api/v1/gyms/${GYM}`)).toBe(true);
  });

  it("removes only after a confirmation that names the gym and spares the account", async () => {
    standard("owner");
    await renderWithProviders(<GymStaff gym={gym("owner")} />);
    await screen.findByRole("table", { name: "Active staff" });
    await user.click(screen.getByRole("button", { name: "Show Michał S." }));
    const calls = api({
      [`DELETE ${STAFF}/${DESK_ROW}`]: [
        {
          status: 200,
          body: {
            staff_member: {
              ...member(DESK_ROW, "front_desk", "Michał S.", OWNER_ROW),
              status: "ended",
              ended_at: "2026-10-29T10:00:00Z",
              ended_reason: "removed",
              name: null,
            },
          },
        },
      ],
    });
    await user.click(screen.getByRole("button", { name: "Remove from team" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Remove Michał S. from Ring One Boxing?");
    expect(dialog).toHaveTextContent(
      /SimpleFit account, their profiles and any other gym they work at are not affected/,
    );
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Keep" }));
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Remove from team" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Remove from team",
      }),
    );
    await waitFor(() => expect(calls.filter((call) => call.method === "DELETE")).toHaveLength(1));
  });

  it("cancels an invitation only after confirming", async () => {
    standard("owner");
    await renderWithProviders(<GymStaff gym={gym("owner")} />);
    await screen.findByText("k•••@example.com");
    const calls = api({
      [`POST ${INVITATIONS}/${INVITE}/cancel`]: [
        {
          status: 200,
          body: {
            invitation: invitation({ status: "cancelled", responded_at: "2026-10-29T10:00:00Z" }),
          },
        },
      ],
    });
    await user.click(
      screen.getByRole("button", { name: "Cancel the invitation to k•••@example.com" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(calls.some((call) => call.path.endsWith("/cancel"))).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Cancel invitation" }));
    await waitFor(() =>
      expect(calls.filter((call) => call.path.endsWith("/cancel"))).toHaveLength(1),
    );
  });

  it("pages by cursor and shows no partial count", async () => {
    api({
      [`GET ${STAFF}`]: [
        { status: 200, body: { staff: roster().slice(0, 2), next_cursor: "c1" } },
        { status: 200, body: { staff: roster().slice(2), next_cursor: null } },
      ],
      [`GET ${INVITATIONS}`]: [{ status: 200, body: { invitations: [], next_cursor: null } }],
    });
    await renderWithProviders(<GymStaff gym={gym("owner")} />);
    await screen.findByRole("table", { name: "Active staff" });
    expect(screen.queryByText(/1 owner/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByText("Michał S.")).toBeVisible();
    expect(
      await screen.findByText("1 owner · 1 manager · 1 coach · 1 at the front desk"),
    ).toBeVisible();
  });

  it("reads the gym again when the roster says it is gone (404)", async () => {
    const calls = api({
      [`GET ${STAFF}`]: [error(404, "not_found")],
      [`GET ${INVITATIONS}`]: [error(404, "not_found")],
    });
    await renderWithProviders(<WithConsoleGym viewerRole="owner" />);
    expect(await screen.findByText("We couldn’t load the team")).toBeVisible();
    await waitFor(() =>
      expect(calls.some((call) => call.path === `/api/v1/gyms/${GYM}`)).toBe(true),
    );
  });
});
