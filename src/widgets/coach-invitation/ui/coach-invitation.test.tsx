import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetPendingCoachInvitationForTests } from "@/entities/pending-coach-invitation";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { CoachInvitation } from "./coach-invitation";

/*
 * WFI1 (SF-60): the E08 link page on the SF-57 API, with the network mocked
 * at `fetch`. The token is read from the fragment only, never travels in a
 * URL, and only the backend's answer decides an outcome.
 */

const session = vi.hoisted(() => ({
  current: { status: "anonymous" } as { status: string; viewer?: { id: string } },
  signOut: vi.fn(),
}));
vi.mock("@/entities/session", () => ({
  useSession: () => session.current,
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
  signOut: session.signOut,
}));
vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

// Canary: this exact value must never appear in a URL, the DOM or a query key.
const TOKEN = `sfi_${"C4n4ry".repeat(7)}X`;
const PREVIEW = {
  invitation: {
    coach: { display_name: "Coach Marek", brand_name: "Marek Boxing" },
    expires_at: "2026-10-30T10:00:00Z",
    message: "See you Saturday.",
  },
  disclosure: {
    version: "test-disclosure-v1",
    fields: ["display_name", "username", "stance"],
    never_shared: ["goals", "weight", "email"],
  },
};
const ENTRY = (fighter: string, account = "complete") => ({
  entry: {
    destination: fighter === "completed" ? "fighter_home" : "fighter_onboarding",
    reason: "test",
    mandatory: false,
    intent: "fighter",
    context: null,
    account_registration: account,
    fighter_profile: fighter,
    coach_profile: "not_started",
    capabilities: fighter === "completed" ? ["FIGHTER"] : [],
  },
});

type Call = { method: string; url: string; body: Record<string, unknown> | undefined };
type Reply = Response | ((call: Call) => Response | Promise<Response>);

function server(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      const call: Call = {
        method: (init.method ?? "GET").toUpperCase(),
        url,
        body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      const path = new URL(url, "http://localhost").pathname;
      const reply = routes[`${call.method} ${path}`];
      if (reply === undefined)
        return Promise.reject(new Error(`unexpected ${call.method} ${path}`));
      return Promise.resolve(typeof reply === "function" ? reply(call) : reply.clone());
    }),
  );
  return calls;
}

const error = (status: number, code: string, details: Record<string, unknown> = {}) =>
  jsonResponse({ error: { code, message: "x", details, request_id: "r" } }, { status });

const PREVIEW_PATH = "POST /api/v1/coach-invitations/preview";
const ACCEPT_PATH = "POST /api/v1/me/coach-invitations/accept";
const DECLINE_PATH = "POST /api/v1/me/coach-invitations/decline";
const ENTRY_PATH = "GET /api/v1/me/entry";

function openLink(hash = `#token=${TOKEN}`) {
  window.history.replaceState(null, "", `/en/invite/coach${hash}`);
}
const signedIn = () => (session.current = { status: "authenticated", viewer: { id: "user-a" } });

beforeEach(() => {
  resetPendingCoachInvitationForTests();
  session.current = { status: "anonymous" };
  session.signOut.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  // No test leaves the token anywhere a URL could carry it.
  expect(window.location.href).not.toContain(TOKEN);
});

/** Every request: the token only ever in a body. */
const tokenInUrls = (calls: Call[]) => calls.filter((call) => call.url.includes(TOKEN));

describe("Coach invitation (WFI1) signed out", () => {
  it("previews anonymously, removes the fragment and continues to sign-in without the token", async () => {
    openLink();
    const calls = server({ [PREVIEW_PATH]: jsonResponse(PREVIEW) });
    await renderWithProviders(<CoachInvitation />);

    expect(
      await screen.findByRole("heading", {
        name: "Coach Marek invited you to connect on SimpleFit.",
      }),
    ).toBeVisible();
    expect(window.location.hash).toBe("");
    expect(screen.getByText("Username")).toBeVisible();
    expect(screen.getByText("Weight")).toBeVisible();
    const signIn = screen.getByRole("link", { name: "Sign in to respond" });
    expect(signIn.getAttribute("href")).toContain("returnTo=%2Finvite%2Fcoach");
    expect(signIn.getAttribute("href")).toContain("intent=fighter");
    expect(signIn.getAttribute("href")).not.toContain("sfi_");
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();

    expect(calls.map((call) => `${call.method} ${new URL(call.url, "http://x").pathname}`)).toEqual(
      [PREVIEW_PATH],
    );
    expect(calls[0]?.body).toEqual({ token: TOKEN });
    expect(tokenInUrls(calls)).toEqual([]);
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it("shows one not-available state when sharing is off or the token is not current", async () => {
    for (const reply of [error(404, "not_found"), error(410, "invitation_unavailable")]) {
      resetPendingCoachInvitationForTests();
      openLink();
      server({ [PREVIEW_PATH]: reply });
      const view = await renderWithProviders(<CoachInvitation />);
      expect(
        await screen.findByRole("heading", { name: "This invitation isn’t available" }),
      ).toBeVisible();
      expect(window.sessionStorage.getItem("simplefit.coach-invitation")).toBeNull();
      view.unmount();
    }
  });

  it("asks to open the email link again when there is no token", async () => {
    openLink("");
    const calls = server({});
    await renderWithProviders(<CoachInvitation />);
    expect(await screen.findByRole("heading", { name: "No invitation to show" })).toBeVisible();
    expect(calls).toEqual([]);
  });
});

describe("Coach invitation (WFI1) signed in", () => {
  it("sends an unfinished profile through the entry and back, accepting nothing", async () => {
    openLink();
    signedIn();
    const calls = server({
      [PREVIEW_PATH]: jsonResponse(PREVIEW),
      [ENTRY_PATH]: jsonResponse(ENTRY("in_progress")),
    });
    await renderWithProviders(<CoachInvitation />);
    const setup = await screen.findByRole("link", { name: "Continue setup" });
    expect(setup.getAttribute("href")).toContain("returnTo=%2Finvite%2Fcoach");
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
    expect(calls.some((call) => call.url.includes("/accept"))).toBe(false);
  });

  it("accepts only with an explicit consent to the backend's version, once", async () => {
    openLink();
    signedIn();
    let answer: (response: Response) => void = () => undefined;
    const calls = server({
      [PREVIEW_PATH]: jsonResponse(PREVIEW),
      [ENTRY_PATH]: jsonResponse(ENTRY("completed")),
      [ACCEPT_PATH]: () => new Promise<Response>((resolve) => (answer = resolve)),
    });
    await renderWithProviders(<CoachInvitation />);
    const accept = await screen.findByRole("button", { name: "Accept invitation" });
    const consent = screen.getByRole("checkbox", {
      name: /I agree that Coach Marek sees the fields above\./,
    });
    expect(consent).not.toBeChecked();
    expect(accept).toBeDisabled();

    await userEvent.click(consent);
    await userEvent.click(accept);
    expect(screen.getByRole("button", { name: "Accepting…" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Accepting…" }));
    expect(calls.filter((call) => call.url.includes("/accept"))).toHaveLength(1);
    expect(calls.find((call) => call.url.includes("/accept"))?.body).toEqual({
      token: TOKEN,
      disclosure_version: "test-disclosure-v1",
    });

    await act(async () => answer(jsonResponse({ outcome: "created", relationship_id: "rel-1" })));
    const heading = await screen.findByRole("heading", {
      name: "You’re connected with Coach Marek.",
    });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole("link", { name: "Go to Coaches" })).toHaveAttribute(
      "href",
      "/app/coaches",
    );
    expect(window.sessionStorage.getItem("simplefit.coach-invitation")).toBeNull();
    expect(tokenInUrls(calls)).toEqual([]);
  });

  it("says when the pair was already connected", async () => {
    openLink();
    signedIn();
    server({
      [PREVIEW_PATH]: jsonResponse(PREVIEW),
      [ENTRY_PATH]: jsonResponse(ENTRY("completed")),
      [ACCEPT_PATH]: jsonResponse({ outcome: "already_connected", relationship_id: "rel-1" }),
    });
    await renderWithProviders(<CoachInvitation />);
    await userEvent.click(await screen.findByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(
      await screen.findByRole("heading", { name: "You’re already connected with Coach Marek." }),
    ).toBeVisible();
  });

  it("reports a different recipient without revealing anything, and offers to switch account", async () => {
    openLink();
    signedIn();
    server({
      [PREVIEW_PATH]: jsonResponse(PREVIEW),
      [ENTRY_PATH]: jsonResponse(ENTRY("completed")),
      [ACCEPT_PATH]: error(403, "invitation_recipient_mismatch"),
    });
    await renderWithProviders(<CoachInvitation />);
    await userEvent.click(await screen.findByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(
      await screen.findByText(/This invitation was sent to a different email address\./),
    ).toBeVisible();
    expect(screen.queryByText(/@/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Sign out and switch account" }));
    expect(session.signOut).toHaveBeenCalled();
  });

  it("asks again after a stale disclosure, with the consent cleared", async () => {
    openLink();
    signedIn();
    let previews = 0;
    server({
      [PREVIEW_PATH]: () => {
        previews += 1;
        return jsonResponse(
          previews === 1
            ? PREVIEW
            : { ...PREVIEW, disclosure: { ...PREVIEW.disclosure, version: "test-disclosure-v2" } },
        );
      },
      [ENTRY_PATH]: jsonResponse(ENTRY("completed")),
      [ACCEPT_PATH]: error(409, "conflict", { disclosure_version: "stale" }),
    });
    await renderWithProviders(<CoachInvitation />);
    await userEvent.click(await screen.findByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByText(/What you would share has changed\./)).toBeVisible();
    expect(await screen.findByText("Disclosure test-disclosure-v2")).toBeVisible();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Accept invitation" })).toBeDisabled();
  });

  it("treats an invitation answered elsewhere as unavailable, never as accepted", async () => {
    openLink();
    signedIn();
    server({
      [PREVIEW_PATH]: jsonResponse(PREVIEW),
      [ENTRY_PATH]: jsonResponse(ENTRY("completed")),
      [ACCEPT_PATH]: error(410, "invitation_unavailable"),
    });
    await renderWithProviders(<CoachInvitation />);
    await userEvent.click(await screen.findByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(
      await screen.findByRole("heading", { name: "This invitation isn’t available" }),
    ).toBeVisible();
    expect(screen.queryByText(/connected/)).toBeNull();
  });

  it("declines explicitly, creating nothing", async () => {
    openLink();
    signedIn();
    const calls = server({
      [PREVIEW_PATH]: jsonResponse(PREVIEW),
      [ENTRY_PATH]: jsonResponse(ENTRY("completed")),
      [DECLINE_PATH]: new Response(null, { status: 204 }),
    });
    await renderWithProviders(<CoachInvitation />);
    await userEvent.click(await screen.findByRole("button", { name: "Decline" }));
    expect(await screen.findByRole("heading", { name: "Invitation declined" })).toBeVisible();
    expect(calls.some((call) => call.url.includes("/accept"))).toBe(false);
    expect(calls.find((call) => call.url.includes("/decline"))?.body).toEqual({ token: TOKEN });
  });
});
