import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  pendingGymInvitation,
  resetPendingGymInvitationForTests,
} from "@/entities/pending-gym-invitation";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { GymInvitation } from "./gym-invitation";

/*
 * The E07 link's page (SF-134) with the network mocked at `fetch`: the token
 * leaves the URL at once and travels only in bodies, opening accepts nothing,
 * every state is the backend's answer, and an acceptance opens the classes of
 * the gym the backend answered.
 */

const session = vi.hoisted(() => ({ status: "anonymous", viewer: null as { id: string } | null }));
const replace = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
  onSessionBoundary: () => () => undefined,
  signOut,
  useSession: () => session,
}));
vi.mock("@/shared/i18n/navigation", () => ({
  useRouter: () => ({ replace, push }),
  usePathname: () => "/invite/gym",
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));

const TOKEN = `sgm_${"a".repeat(43)}`;
const GYM = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";
const MEMBER = "6a1b2c3d-0000-4000-8000-000000000101";
const MEMBERSHIPS = "GET /api/v1/me/gym-memberships";
const membership = (status: string) => ({
  gym: { gym_id: GYM, name: "Ring One Boxing" },
  gym_member_id: MEMBER,
  status,
  joined_via: "invitation",
  auto_approved: false,
  requested_at: null,
  joined_at: "2026-11-13T10:00:00Z",
  responded_at: "2026-11-13T10:00:00Z",
  ended_at: null,
  ended_reason: null,
});

const preview = {
  gym: { name: "Ring One Boxing" },
  invited_by: { first_name: "Yauheni", role: "owner" },
  expires_at: "2026-11-20T10:00:00Z",
};
const mine = (status = "pending", extra = {}) => ({
  invitation_id: "7a1b2c3d-0000-4000-8000-000000000701",
  status,
  gym: { gym_id: GYM, name: "Ring One Boxing" },
  invited_by: { first_name: "Yauheni", role: "owner" },
  sent_to: "natalia@example.com",
  created_at: "2026-11-13T10:00:00Z",
  expires_at: "2026-11-20T10:00:00Z",
  responded_at: null,
  gym_member_id: null,
  ...extra,
});
const accepted = {
  invitation: mine("accepted"),
  gym_id: GYM,
  gym_member_id: MEMBER,
  outcome: "accepted",
};
const ENTRY = {
  entry: { destination: "fighter_home", account_registration: "complete", capabilities: [] },
};

type Answer = { status: number; body?: unknown } | Error;
const error = (status: number, code: string, details: Record<string, unknown> = {}) => ({
  status,
  body: { error: { code, message: code, details, request_id: null } },
});

function api(routes: Record<string, Answer[]>) {
  const calls: { method: string; path: string; url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      const { pathname } = new URL(url);
      const method = (init.method ?? "GET").toUpperCase();
      calls.push({
        method,
        path: pathname,
        url,
        body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      });
      const queue = routes[`${method} ${pathname}`];
      if (!queue) {
        if (pathname === "/api/v1/me/entry") return Promise.resolve(jsonResponse(ENTRY));
        return Promise.resolve(jsonResponse({}, { status: 500 }));
      }
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve(jsonResponse(answer.body ?? {}, { status: answer.status }));
    }),
  );
  return calls;
}

const PREVIEW = "POST /api/v1/gym-invitations/preview";
const RESOLVE = "POST /api/v1/me/gym-invitations/resolve";
const ACCEPT = "POST /api/v1/me/gym-invitations/accept";
const DECLINE = "POST /api/v1/me/gym-invitations/decline";

const user = userEvent.setup();

function signedIn() {
  session.status = "authenticated";
  session.viewer = { id: "user-1" };
}

beforeEach(() => {
  resetPendingGymInvitationForTests();
  session.status = "anonymous";
  session.viewer = null;
  replace.mockReset();
  push.mockReset();
  signOut.mockReset();
  window.history.replaceState(null, "", `/en/invite/gym#token=${TOKEN}`);
});
afterEach(() => vi.unstubAllGlobals());

describe("GymInvitation (SF-134)", () => {
  it("anonymous: the fragment leaves the URL, the preview comes from the body, nothing is accepted", async () => {
    const calls = api({ [PREVIEW]: [{ status: 200, body: { preview } }] });
    await renderWithProviders(<GymInvitation />);

    expect(await screen.findByRole("heading", { name: /Ring One Boxing/ })).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(TOKEN);
    expect(screen.getByText("Yauheni (Owner)")).toBeInTheDocument();
    expect(calls.map((call) => call.path)).toEqual(["/api/v1/gym-invitations/preview"]);
    expect(calls[0]!.body).toEqual({ token: TOKEN });
    expect(calls.every((call) => !call.url.includes(TOKEN))).toBe(true);
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();

    // The way in carries the page, never the token.
    const signIn = screen.getByRole("link", { name: "Sign in" });
    expect(signIn.getAttribute("href")).toContain("returnTo=%2Finvite%2Fgym");
    expect(signIn.getAttribute("href")).not.toContain("sgm_");
    expect(screen.getByRole("link", { name: "Create account" }).getAttribute("href")).toContain(
      "returnTo=%2Finvite%2Fgym",
    );
  });

  it("no token in the link: asks to open the email again, reads nothing", async () => {
    window.history.replaceState(null, "", "/en/invite/gym");
    const calls = api({});
    await renderWithProviders(<GymInvitation />);
    expect(await screen.findByText("Open the invitation from your email")).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("a malformed fragment is dropped, never sent", async () => {
    window.history.replaceState(null, "", "/en/invite/gym#token=sfs_notamembertoken");
    const calls = api({});
    await renderWithProviders(<GymInvitation />);
    expect(await screen.findByText("Open the invitation from your email")).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(calls).toEqual([]);
  });

  it("anonymous, unusable link: one state, with a way to sign in", async () => {
    api({ [PREVIEW]: [error(410, "invitation_unavailable")] });
    await renderWithProviders(<GymInvitation />);
    expect(await screen.findByText("This invitation isn't available")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  it("rate limits and failures offer a retry", async () => {
    const calls = api({
      [PREVIEW]: [error(429, "rate_limited"), { status: 200, body: { preview } }],
    });
    await renderWithProviders(<GymInvitation />);
    expect(await screen.findByText("Too many attempts.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: /Ring One Boxing/ })).toBeInTheDocument();
    expect(calls).toHaveLength(2);
  });

  it("the recipient accepts explicitly and enters the gym the backend answered", async () => {
    signedIn();
    const calls = api({
      [RESOLVE]: [{ status: 200, body: { invitation: mine() } }],
      [ACCEPT]: [{ status: 200, body: accepted }],
    });
    await renderWithProviders(<GymInvitation />);

    const accept = await screen.findByRole("button", { name: "Accept invitation" });
    expect(screen.getByText("natalia@example.com")).toBeInTheDocument();
    // Nothing happens by opening the page.
    expect(calls.some((call) => call.path.endsWith("/accept"))).toBe(false);

    await user.click(accept);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/app/me/gyms/${GYM}/classes`));
    expect(calls.find((call) => call.path.endsWith("/accept"))!.body).toEqual({ token: TOKEN });
    expect(screen.getByRole("status", { name: "Opening the gym's classes" })).toBeInTheDocument();
    expect(sessionStorage.getItem("simplefit.gym-invitation")).toBeNull();
  });

  it("declining asks first, then records the backend's answer and drops the token", async () => {
    signedIn();
    const calls = api({
      [RESOLVE]: [{ status: 200, body: { invitation: mine() } }],
      [DECLINE]: [{ status: 200, body: { invitation: mine("declined") } }],
    });
    await renderWithProviders(<GymInvitation />);

    await user.click(await screen.findByRole("button", { name: "Decline" }));
    expect(calls.some((call) => call.path.endsWith("/decline"))).toBe(false);
    expect(screen.getByText(/Decline the invitation to Ring One Boxing\?/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toHaveFocus();

    // Keeping it returns to the choice.
    await user.click(screen.getByRole("button", { name: "Keep the invitation" }));
    await user.click(screen.getByRole("button", { name: "Decline" }));
    await user.click(screen.getByRole("button", { name: "Decline" }));

    expect(await screen.findByText("You declined this invitation")).toBeInTheDocument();
    expect(sessionStorage.getItem("simplefit.gym-invitation")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("another address: verify in place or use another account; acceptance is never offered", async () => {
    signedIn();
    api({
      [RESOLVE]: [
        error(403, "invitation_recipient_mismatch"),
        { status: 200, body: { invitation: mine() } },
      ],
      [PREVIEW]: [{ status: 200, body: { preview } }],
    });
    await renderWithProviders(<GymInvitation />);

    expect(await screen.findByText("This invitation is for another email.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Use another account" }));
    expect(signOut).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Verify the invited email" }));
    expect(
      await screen.findByRole("button", { name: "Back to the invitation" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["expired", "This invitation has expired"],
    ["cancelled", "This invitation was withdrawn"],
    ["declined", "You declined this invitation"],
  ])("the recipient sees %s, with no answer offered", async (status, title) => {
    signedIn();
    api({ [RESOLVE]: [{ status: 200, body: { invitation: mine(status) } }] });
    await renderWithProviders(<GymInvitation />);
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  });

  it("unavailable for this account (410)", async () => {
    signedIn();
    api({ [RESOLVE]: [error(410, "invitation_unavailable")] });
    await renderWithProviders(<GymInvitation />);
    expect(await screen.findByText("This invitation isn't available")).toBeInTheDocument();
  });

  it("already accepted: opens the classes while the membership is active", async () => {
    signedIn();
    api({
      [RESOLVE]: [
        { status: 200, body: { invitation: mine("accepted", { gym_member_id: MEMBER }) } },
      ],
      [MEMBERSHIPS]: [
        { status: 200, body: { memberships: [membership("active")], next_cursor: null } },
      ],
    });
    await renderWithProviders(<GymInvitation />);
    expect(await screen.findByText("You're a member of Ring One Boxing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open classes" })).toHaveAttribute(
      "href",
      `/app/me/gyms/${GYM}/classes`,
    );
  });

  it("accepted earlier but ended since: says so and offers no classes", async () => {
    signedIn();
    api({
      [RESOLVE]: [
        { status: 200, body: { invitation: mine("accepted", { gym_member_id: MEMBER }) } },
      ],
      [MEMBERSHIPS]: [
        { status: 200, body: { memberships: [membership("ended")], next_cursor: null } },
      ],
    });
    await renderWithProviders(<GymInvitation />);
    expect(await screen.findByText("This membership has ended")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open classes" })).toBeNull();
  });

  it("account registration comes first and comes back here", async () => {
    signedIn();
    const calls = api({
      [RESOLVE]: [{ status: 200, body: { invitation: mine() } }],
      "GET /api/v1/me/entry": [
        { status: 200, body: { entry: { ...ENTRY.entry, account_registration: "required" } } },
      ],
    });
    await renderWithProviders(<GymInvitation />);
    expect(await screen.findByText("Finish your account first.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Finish my account" }).getAttribute("href")).toContain(
      "returnTo=%2Finvite%2Fgym",
    );
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
    expect(calls.some((call) => call.path.endsWith("/accept"))).toBe(false);
  });

  it("a refusal on accept reads the invitation again: withdrawn meanwhile", async () => {
    signedIn();
    api({
      [RESOLVE]: [
        { status: 200, body: { invitation: mine() } },
        { status: 200, body: { invitation: mine("cancelled") } },
      ],
      [ACCEPT]: [error(410, "invitation_unavailable")],
    });
    await renderWithProviders(<GymInvitation />);
    await user.click(await screen.findByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByText("This invitation was withdrawn")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("already a member (409): nothing changed", async () => {
    signedIn();
    api({
      [RESOLVE]: [{ status: 200, body: { invitation: mine() } }],
      [ACCEPT]: [error(409, "conflict", { gym_member: "already_active" })],
    });
    await renderWithProviders(<GymInvitation />);
    await user.click(await screen.findByRole("button", { name: "Accept invitation" }));
    expect(
      await screen.findByText("You're already a member of Ring One Boxing"),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("a dropped connection claims nothing and lets the person retry", async () => {
    signedIn();
    api({
      [RESOLVE]: [{ status: 200, body: { invitation: mine() } }],
      [ACCEPT]: [new TypeError("offline"), { status: 200, body: accepted }],
    });
    await renderWithProviders(<GymInvitation />);
    await user.click(await screen.findByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByText("We couldn't confirm that.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    await waitFor(() => expect(replace).toHaveBeenCalled());
  });

  it("a token bound to one viewer never passes to another", async () => {
    signedIn();
    api({ [RESOLVE]: [{ status: 200, body: { invitation: mine() } }] });
    const view = await renderWithProviders(<GymInvitation />);
    await screen.findByRole("button", { name: "Accept invitation" });

    pendingGymInvitation.crossBoundary();
    session.viewer = { id: "user-2" };
    view.rerender(<GymInvitation />);
    expect(await screen.findByText("Open the invitation from your email")).toBeInTheDocument();
    expect(sessionStorage.getItem("simplefit.gym-invitation")).toBeNull();
  });
});
