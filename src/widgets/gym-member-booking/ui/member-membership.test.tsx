import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MyGymInvitation, MyGymMembership } from "@/shared/api/generated/model";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { MemberGyms } from "./member-gyms";
import { MemberInvitations } from "./member-invitations";
import { MemberJoin } from "./member-join";

/*
 * Joining by code, the invitation inbox and My gyms' actions (SF-134) with the
 * network mocked at `fetch`: the code travels only in bodies, opening accepts
 * nothing, each press sends once, and every status is the backend's answer.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
  onSessionBoundary: () => () => undefined,
}));
vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/app/me/gyms",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const GYM = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";
const MEMBER = "8b1b2c3d-0000-4000-8000-000000000001";
const INVITE = "7a1b2c3d-0000-4000-8000-000000000701";
const CODE = "ABCD-EFGH";

const PREVIEW = "POST /api/v1/gym-join/preview";
const JOIN = "POST /api/v1/me/gym-memberships/join";
const MEMBERSHIPS = "GET /api/v1/me/gym-memberships";
const INBOX = "GET /api/v1/me/gym-invitations";

const membership = (overrides: Partial<MyGymMembership> = {}): MyGymMembership => ({
  gym: { gym_id: GYM, name: "Ring One Boxing" },
  gym_member_id: MEMBER,
  status: "requested",
  joined_via: "join_code",
  auto_approved: false,
  requested_at: "2026-10-30T10:00:00Z",
  joined_at: null,
  responded_at: null,
  ended_at: null,
  ended_reason: null,
  ...overrides,
});
const invitation = (): MyGymInvitation =>
  ({
    invitation_id: INVITE,
    status: "pending",
    gym: { gym_id: GYM, name: "Ring One Boxing" },
    invited_by: { first_name: "Yauheni", role: "owner" },
    sent_to: "marta@example.com",
    created_at: "2026-11-13T10:00:00Z",
    expires_at: "2026-11-20T10:00:00Z",
    responded_at: null,
    gym_member_id: null,
  }) as MyGymInvitation;

type Answer = { status: number; body?: unknown } | Error;
const error = (status: number, code: string, details: Record<string, unknown> = {}) => ({
  status,
  body: { error: { code, message: code, details, request_id: null } },
});
const preview = (requires_approval = true) => ({
  status: 200,
  body: { preview: { gym: { name: "Ring One Boxing" }, requires_approval } },
});

function api(routes: Record<string, Answer[]>) {
  const calls: { key: string; url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      const { pathname } = new URL(url);
      const key = `${(init.method ?? "GET").toUpperCase()} ${pathname}`;
      calls.push({
        key,
        url,
        body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      });
      const queue = routes[key];
      if (!queue) return Promise.resolve(jsonResponse({}, { status: 500 }));
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve(jsonResponse(answer.body ?? {}, { status: answer.status }));
    }),
  );
  return calls;
}

const user = userEvent.setup();

async function lookUp() {
  await user.type(await screen.findByLabelText("Gym code"), CODE);
  await user.click(screen.getByRole("button", { name: "Find gym" }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("MemberJoin (SF-134)", () => {
  it("an empty code asks for one and sends nothing", async () => {
    const calls = api({});
    await renderWithProviders(<MemberJoin />);
    await user.click(await screen.findByRole("button", { name: "Find gym" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter your gym's code.");
    expect(calls).toEqual([]);
  });

  it("previewing creates nothing; joining is a separate press, sent once with the code in the body", async () => {
    const calls = api({
      [PREVIEW]: [preview()],
      [JOIN]: [{ status: 201, body: { membership: membership() } }],
      [MEMBERSHIPS]: [{ status: 200, body: { memberships: [], next_cursor: null } }],
    });
    await renderWithProviders(<MemberJoin />);
    await lookUp();

    expect(await screen.findByText("Ring One Boxing")).toBeInTheDocument();
    expect(calls.map((call) => call.key)).toEqual([PREVIEW]);
    expect(calls[0]!.body).toEqual({ code: CODE });

    await user.click(screen.getByRole("button", { name: "Send join request" }));
    expect(await screen.findByText("Request sent to Ring One Boxing")).toBeInTheDocument();
    expect(calls.filter((call) => call.key === JOIN)).toHaveLength(1);
    expect(calls.find((call) => call.key === JOIN)!.body).toEqual({ code: CODE });

    // The code is nowhere but the request bodies.
    expect(calls.every((call) => !call.url.includes("ABCD"))).toBe(true);
    expect(window.location.href).not.toContain("ABCD");
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain("ABCD");
  });

  it("the backend's answer decides: a hint of approval can still come back active", async () => {
    api({
      [PREVIEW]: [preview(true)],
      [JOIN]: [
        {
          status: 201,
          body: { membership: membership({ status: "active", auto_approved: true }) },
        },
      ],
      [MEMBERSHIPS]: [{ status: 200, body: { memberships: [], next_cursor: null } }],
    });
    await renderWithProviders(<MemberJoin />);
    await lookUp();
    await user.click(await screen.findByRole("button", { name: "Send join request" }));
    expect(await screen.findByText("You're a member of Ring One Boxing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open classes" })).toHaveAttribute(
      "href",
      `/app/me/gyms/${GYM}/classes`,
    );
  });

  it("auto-approval is offered as joining, and never decided here", async () => {
    api({
      [PREVIEW]: [preview(false)],
      [JOIN]: [{ status: 201, body: { membership: membership() } }],
      [MEMBERSHIPS]: [{ status: 200, body: { memberships: [], next_cursor: null } }],
    });
    await renderWithProviders(<MemberJoin />);
    await lookUp();
    await user.click(await screen.findByRole("button", { name: "Join gym" }));
    // An unverified identity: the backend's request wins over the preview's hint.
    expect(await screen.findByText("Request sent to Ring One Boxing")).toBeInTheDocument();
  });

  it("an unknown, malformed or disabled code gets one answer", async () => {
    api({ [PREVIEW]: [error(404, "not_found")] });
    await renderWithProviders(<MemberJoin />);
    await lookUp();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't find a gym with that code.",
    );
    expect(screen.queryByRole("button", { name: "Send join request" })).toBeNull();
  });

  it("rate limits say so, with the wait the server gave", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: "rate_limited", message: "x", details: {}, request_id: null },
            }),
            {
              status: 429,
              headers: { "content-type": "application/json", "retry-after": "120" },
            },
          ),
        ),
      ),
    );
    await renderWithProviders(<MemberJoin />);
    await lookUp();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Too many attempts/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("a code rotated between preview and joining goes back with the same answer", async () => {
    api({
      [PREVIEW]: [preview()],
      [JOIN]: [error(404, "not_found")],
      [MEMBERSHIPS]: [{ status: 200, body: { memberships: [], next_cursor: null } }],
    });
    await renderWithProviders(<MemberJoin />);
    await lookUp();
    await user.click(await screen.findByRole("button", { name: "Send join request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't find a gym with that code.",
    );
  });

  it("a dropped connection claims nothing and doesn't send again by itself", async () => {
    const calls = api({
      [PREVIEW]: [preview()],
      [JOIN]: [new TypeError("offline")],
      [MEMBERSHIPS]: [{ status: 200, body: { memberships: [], next_cursor: null } }],
    });
    await renderWithProviders(<MemberJoin />);
    await lookUp();
    await user.click(await screen.findByRole("button", { name: "Send join request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't confirm that.");
    expect(calls.filter((call) => call.key === JOIN)).toHaveLength(1);
    expect(screen.queryByText("Request sent to Ring One Boxing")).toBeNull();
  });

  it("already a member and an unfinished account", async () => {
    api({
      [PREVIEW]: [preview()],
      [JOIN]: [error(409, "conflict", { gym_member: "already_active" })],
      [MEMBERSHIPS]: [{ status: 200, body: { memberships: [], next_cursor: null } }],
    });
    const first = await renderWithProviders(<MemberJoin />);
    await lookUp();
    await user.click(await screen.findByRole("button", { name: "Send join request" }));
    expect(await screen.findByText("You're already a member of this gym")).toBeInTheDocument();
    first.unmount();

    api({
      [PREVIEW]: [preview()],
      [JOIN]: [
        {
          status: 422,
          body: {
            error: {
              code: "validation_error",
              message: "x",
              details: { field_codes: { account_registration: ["required"] } },
              request_id: null,
            },
          },
        },
      ],
      [MEMBERSHIPS]: [{ status: 200, body: { memberships: [], next_cursor: null } }],
    });
    await renderWithProviders(<MemberJoin />);
    await lookUp();
    await user.click(await screen.findByRole("button", { name: "Send join request" }));
    const finish = await screen.findByRole("link", { name: "Finish my account" });
    expect(finish.getAttribute("href")).toContain("returnTo=%2Fapp%2Fme%2Fgyms%2Fjoin");
    expect(finish.getAttribute("href")).not.toContain("ABCD");
  });
});

describe("MemberInvitations (SF-134)", () => {
  it("opening accepts nothing; accepting is by id and shows the backend's result", async () => {
    const accept = `POST /api/v1/me/gym-invitations/${INVITE}/accept`;
    const calls = api({
      [INBOX]: [
        { status: 200, body: { invitations: [invitation()], next_cursor: null } },
        { status: 200, body: { invitations: [], next_cursor: null } },
      ],
      [accept]: [
        {
          status: 200,
          body: {
            invitation: invitation(),
            gym_id: GYM,
            gym_member_id: MEMBER,
            outcome: "accepted",
          },
        },
      ],
      [MEMBERSHIPS]: [{ status: 200, body: { memberships: [], next_cursor: null } }],
    });
    await renderWithProviders(<MemberInvitations />);

    const row = (await screen.findByRole("heading", { name: "Ring One Boxing" })).closest("li")!;
    expect(within(row).getByText("Invited by Yauheni")).toBeVisible();
    expect(calls.some((call) => call.key === accept)).toBe(false);
    expect(calls.find((call) => call.key === INBOX)!.url).toContain("status=pending");

    await user.click(
      within(row).getByRole("button", { name: "Accept the invitation from Ring One Boxing" }),
    );
    expect(await screen.findByText("You're a member of Ring One Boxing.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open classes" })).toHaveAttribute(
      "href",
      `/app/me/gyms/${GYM}/classes`,
    );
    expect(await screen.findByText("No invitations right now")).toBeInTheDocument();
  });

  it("declining asks first", async () => {
    const decline = `POST /api/v1/me/gym-invitations/${INVITE}/decline`;
    const calls = api({
      [INBOX]: [
        { status: 200, body: { invitations: [invitation()], next_cursor: null } },
        { status: 200, body: { invitations: [], next_cursor: null } },
      ],
      [decline]: [{ status: 200, body: { invitation: invitation() } }],
      [MEMBERSHIPS]: [{ status: 200, body: { memberships: [], next_cursor: null } }],
    });
    await renderWithProviders(<MemberInvitations />);
    await user.click(
      await screen.findByRole("button", { name: "Decline the invitation from Ring One Boxing" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(calls.some((call) => call.key === decline)).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Decline" }));
    expect(
      await screen.findByText("You declined the invitation from Ring One Boxing."),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.key === decline)).toHaveLength(1);
  });

  it("withdrawn meanwhile: says it changed and reads the list again", async () => {
    const accept = `POST /api/v1/me/gym-invitations/${INVITE}/accept`;
    const calls = api({
      [INBOX]: [{ status: 200, body: { invitations: [invitation()], next_cursor: null } }],
      [accept]: [error(410, "invitation_unavailable")],
      [MEMBERSHIPS]: [{ status: 200, body: { memberships: [], next_cursor: null } }],
    });
    await renderWithProviders(<MemberInvitations />);
    await user.click(await screen.findByRole("button", { name: /Accept the invitation/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This changed in the meantime.");
    await waitFor(() =>
      expect(calls.filter((call) => call.key === INBOX).length).toBeGreaterThan(1),
    );
  });

  it("reads every page, and a failed list offers a retry", async () => {
    const second = { ...invitation(), invitation_id: "7a1b2c3d-0000-4000-8000-000000000702" };
    api({
      [INBOX]: [
        { status: 200, body: { invitations: [invitation()], next_cursor: "page-2" } },
        { status: 200, body: { invitations: [second], next_cursor: null } },
      ],
    });
    const view = await renderWithProviders(<MemberInvitations />);
    expect(await screen.findAllByRole("heading", { name: "Ring One Boxing" })).toHaveLength(2);
    view.unmount();

    api({
      [INBOX]: [
        new TypeError("offline"),
        { status: 200, body: { invitations: [], next_cursor: null } },
      ],
    });
    await renderWithProviders(<MemberInvitations />);
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No invitations right now")).toBeInTheDocument();
  });
});

describe("MemberGyms' actions (SF-134)", () => {
  it("a pending request can be cancelled, and leaving asks first with what it costs", async () => {
    const cancel = `POST /api/v1/me/gym-memberships/${MEMBER}/cancel`;
    const calls = api({
      [MEMBERSHIPS]: [
        { status: 200, body: { memberships: [membership()], next_cursor: null } },
        {
          status: 200,
          body: {
            memberships: [
              membership({ status: "cancelled", responded_at: "2026-10-31T10:00:00Z" }),
            ],
            next_cursor: null,
          },
        },
      ],
      [INBOX]: [{ status: 200, body: { invitations: [invitation()], next_cursor: null } }],
      [cancel]: [{ status: 200, body: { membership: membership({ status: "cancelled" }) } }],
    });
    await renderWithProviders(<MemberGyms />);

    expect(await screen.findByRole("link", { name: "Invitations (1)" })).toHaveAttribute(
      "href",
      "/app/me/gyms/invitations",
    );
    await user.click(
      await screen.findByRole("button", { name: "Cancel the request to join Ring One Boxing" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(calls.some((call) => call.key === cancel)).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Cancel request" }));
    expect(await screen.findByText(/You cancelled this request/)).toBeInTheDocument();
  });

  it("leaving: the dialog says bookings end; a refusal stays in it", async () => {
    const leave = `POST /api/v1/me/gym-memberships/${MEMBER}/leave`;
    api({
      [MEMBERSHIPS]: [
        {
          status: 200,
          body: { memberships: [membership({ status: "active" })], next_cursor: null },
        },
      ],
      [INBOX]: [{ status: 200, body: { invitations: [], next_cursor: null } }],
      [leave]: [error(409, "conflict", { gym_member: "ended" })],
    });
    await renderWithProviders(<MemberGyms />);
    await user.click(await screen.findByRole("button", { name: "Leave Ring One Boxing" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("your upcoming bookings at this gym are cancelled");
    await user.click(within(dialog).getByRole("button", { name: "Leave gym" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This changed in the meantime.",
    );
  });

  it("no gyms: offers joining and the inbox, with no failed-inbox noise", async () => {
    api({
      [MEMBERSHIPS]: [{ status: 200, body: { memberships: [], next_cursor: null } }],
      [INBOX]: [new TypeError("offline")],
    });
    await renderWithProviders(<MemberGyms />);
    expect(
      await screen.findByRole("heading", { name: "You’re not a member of a gym" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Join a gym" })).toHaveAttribute(
      "href",
      "/app/me/gyms/join",
    );
    expect(screen.getByRole("link", { name: "Invitations" })).toBeVisible();
  });
});
