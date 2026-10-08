import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Session } from "@/entities/session";
import type { EntryResponseEntry } from "@/shared/api/generated/model";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { EntryRedirect, useEntryFailure } from "./entry-redirect";
import { OnboardingGate } from "./onboarding-gate";
import { GuestOnly, RequireSession } from "./session-gate";

const VIEWER = { id: "8a6e0804-2bd0-4672-b79d-d97027f9071b", created_at: "2026-10-01T10:00:00Z" };

const session = vi.hoisted(() => ({ current: { status: "loading" } as Session }));
vi.mock("@/entities/session", () => ({
  useSession: () => session.current,
  // The real one adds the bearer token and refreshes once on 401 (session.test.ts).
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));

const navigation = vi.hoisted(() => ({ replace: vi.fn(), pathname: "/app/coach/fighters" }));
vi.mock("@/shared/i18n/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
}));

beforeEach(() => {
  navigation.replace.mockClear();
  navigation.pathname = "/app/coach/fighters";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const API = "http://api.test";

const entry = (overrides: Partial<EntryResponseEntry> = {}): EntryResponseEntry => ({
  destination: "role_selection",
  reason: "no_role_started",
  mandatory: false,
  intent: null,
  account_registration: "complete",
  fighter_profile: "not_started",
  capabilities: [],
  ...overrides,
});
const ACCOUNT_GATE = entry({
  destination: "account_registration",
  reason: "account_registration_incomplete",
  mandatory: true,
  account_registration: "not_started",
});

/** Answers GET /api/v1/me/entry with each entry in turn; records the requested URLs. */
function stubEntries(...answers: (EntryResponseEntry | Error)[]) {
  const fetchMock = vi.fn();
  for (const answer of answers) {
    fetchMock.mockImplementationOnce(() =>
      answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(jsonResponse({ entry: answer })),
    );
  }
  vi.stubGlobal("fetch", fetchMock);
  return {
    urls: () =>
      (fetchMock.mock.calls as [string, RequestInit][]).map(([url]) => url.replace(API, "")),
    headers: () =>
      (fetchMock.mock.calls as [string, RequestInit][]).map(([, init]) =>
        new Headers(init.headers).get("authorization"),
      ),
  };
}

function Failure() {
  const { error, retry } = useEntryFailure();
  return (
    <button type="button" onClick={retry}>
      {error instanceof Error ? error.message : "failed"}
    </button>
  );
}
const failure = <Failure />;

describe("RequireSession (AUTHENTICATED)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/en/app/coach/fighters?tab=all");
  });

  it("renders the route for a signed-in user", async () => {
    session.current = { status: "authenticated", viewer: VIEWER };
    await renderWithProviders(
      <RequireSession signIn="web.login">
        <p>private</p>
      </RequireSession>,
    );
    expect(screen.getByText("private")).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("shows only a pending state while the session is restored", async () => {
    session.current = { status: "loading" };
    await renderWithProviders(
      <RequireSession signIn="web.login">
        <p>private</p>
      </RequireSession>,
    );
    expect(screen.queryByText("private")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Checking your session" })).toBeInTheDocument();
  });

  it("renders the layout's pending state (the SF-34 launch screen) only while restoring", async () => {
    session.current = { status: "loading" };
    const { rerender } = await renderWithProviders(
      <RequireSession signIn="web.login" pending={<p>launch</p>}>
        <p>private</p>
      </RequireSession>,
    );
    expect(screen.getByText("launch")).toBeInTheDocument();
    expect(screen.queryByText("private")).not.toBeInTheDocument();

    session.current = { status: "authenticated", viewer: VIEWER };
    rerender(
      <RequireSession signIn="web.login" pending={<p>launch</p>}>
        <p>private</p>
      </RequireSession>,
    );
    expect(screen.queryByText("launch")).not.toBeInTheDocument();
    expect(screen.getByText("private")).toBeInTheDocument();
  });

  it("shows the unavailable view on a network or server failure and never redirects", async () => {
    session.current = { status: "unavailable", error: new TypeError("Failed to fetch") };
    await renderWithProviders(
      <RequireSession signIn="web.login" pending={<p>launch</p>} unavailable={<p>offline</p>}>
        <p>private</p>
      </RequireSession>,
    );
    expect(screen.getByText("offline")).toBeInTheDocument();
    expect(screen.queryByText("private")).not.toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it.each([
    ["web.login", "/login"],
    ["web.sponsor.login", "/sponsor/login"],
    ["web.admin.login", "/admin/login"],
  ] as const)("sends a signed-out visitor to %s with returnTo", async (signIn, path) => {
    session.current = { status: "anonymous" };
    await renderWithProviders(
      <RequireSession signIn={signIn}>
        <p>private</p>
      </RequireSession>,
    );
    expect(screen.queryByText("private")).not.toBeInTheDocument();
    expect(navigation.replace).toHaveBeenCalledWith(
      `${path}?returnTo=${encodeURIComponent("/app/coach/fighters?tab=all")}`,
    );
  });

  it.each([
    // An onboarding route is never a returnTo, but its journey survives (SF-36 fix).
    ["/app/onboarding/fighter", "?step=basics&intent=fighter", "/login?intent=fighter"],
    // The route itself names the journey when the URL has no intent.
    ["/app/onboarding/fighter", "?step=profile", "/login?intent=fighter"],
    ["/app/onboarding/coach", "", "/login?intent=coach"],
    ["/app/onboarding/gym", "", "/login?intent=gym"],
    // Account registration and role selection belong to no journey: only an explicit intent.
    ["/app/onboarding/account", "?intent=coach", "/login?intent=coach"],
    ["/app/onboarding/account", "", "/login"],
    ["/app/onboarding/role", "", "/login"],
    // Unsafe or unknown intents are dropped by the shared parser, never guessed.
    ["/app/onboarding/account", "?intent=admin", "/login"],
    ["/app/onboarding/account", "?intent=Fighter", "/login"],
    ["/app/onboarding/role", "?intent=fighter&intent=coach", "/login"],
    // A valid returnTo and an explicit intent travel together.
    [
      "/app/messages",
      "?intent=gym",
      `/login?returnTo=${encodeURIComponent("/app/messages?intent=gym")}&intent=gym`,
    ],
  ] as const)(
    "a signed-out visitor on %s%s goes to %s (onboarding is never a returnTo)",
    async (pathname, search, expected) => {
      session.current = { status: "anonymous" };
      navigation.pathname = pathname;
      window.history.replaceState(null, "", `/en${pathname}${search}`);
      await renderWithProviders(
        <RequireSession signIn="web.login">
          <p>private</p>
        </RequireSession>,
      );
      expect(navigation.replace).toHaveBeenCalledWith(expected);
    },
  );
});

describe("GuestOnly (GUEST_ONLY)", () => {
  it.each(["loading", "anonymous"] as const)("renders the page while %s", async (status) => {
    session.current = { status };
    const api = stubEntries();
    await renderWithProviders(
      <GuestOnly entryFailure={failure}>
        <p>sign in</p>
      </GuestOnly>,
    );
    expect(screen.getByText("sign in")).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(api.urls()).toEqual([]);
  });

  it("shows the unavailable view instead of the page when the session cannot be confirmed", async () => {
    session.current = { status: "unavailable", error: new TypeError("Failed to fetch") };
    await renderWithProviders(
      <GuestOnly unavailable={<p>offline</p>} entryFailure={failure}>
        <p>sign in</p>
      </GuestOnly>,
    );
    expect(screen.getByText("offline")).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("a new Google / Apple / email user without intent goes to account basics, not Fighter", async () => {
    window.history.replaceState(null, "", "/en/signup");
    session.current = { status: "authenticated", viewer: VIEWER };
    const api = stubEntries(ACCOUNT_GATE);
    await renderWithProviders(
      <GuestOnly entryFailure={failure}>
        <p>sign in</p>
      </GuestOnly>,
    );
    expect(screen.queryByText("sign in")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/app/onboarding/account"),
    );
    expect(api.urls()).toEqual(["/api/v1/me/entry"]);
    expect(api.headers()).toEqual(["Bearer test"]);
  });

  it("an explicit Fighter intent is sent to the resolver and kept through account basics", async () => {
    window.history.replaceState(null, "", "/en/signup/verify?intent=fighter");
    session.current = { status: "authenticated", viewer: VIEWER };
    const api = stubEntries({ ...ACCOUNT_GATE, intent: "fighter" });
    await renderWithProviders(
      <GuestOnly entryFailure={failure}>
        <p>sign in</p>
      </GuestOnly>,
    );
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(
        "/app/onboarding/account?intent=fighter",
      ),
    );
    expect(api.urls()).toEqual(["/api/v1/me/entry?intent=fighter"]);
  });

  it("never sends an intent outside the allow-list", async () => {
    window.history.replaceState(null, "", "/en/login?intent=admin");
    session.current = { status: "authenticated", viewer: VIEWER };
    const api = stubEntries(entry());
    await renderWithProviders(
      <GuestOnly entryFailure={failure}>
        <p>sign in</p>
      </GuestOnly>,
    );
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/app/onboarding/role"),
    );
    expect(api.urls()).toEqual(["/api/v1/me/entry"]);
  });

  it("consumes a usable returnTo once when no mandatory step applies", async () => {
    window.history.replaceState(
      null,
      "",
      "/en/login/code?returnTo=%2Fapp%2Fsettings%2Fsecurity%3Ftab%3D2",
    );
    session.current = { status: "authenticated", viewer: VIEWER };
    stubEntries(entry());
    await renderWithProviders(
      <GuestOnly entryFailure={failure}>
        <p>sign in</p>
      </GuestOnly>,
    );
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/app/settings/security?tab=2"),
    );
  });

  it("the account gate beats a valid returnTo, which rides along", async () => {
    window.history.replaceState(null, "", "/en/login?returnTo=%2Fapp%2Fsettings%2Fsecurity");
    session.current = { status: "authenticated", viewer: VIEWER };
    stubEntries(ACCOUNT_GATE);
    await renderWithProviders(
      <GuestOnly entryFailure={failure}>
        <p>sign in</p>
      </GuestOnly>,
    );
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(
        "/app/onboarding/account?returnTo=%2Fapp%2Fsettings%2Fsecurity",
      ),
    );
  });

  it.each([
    "https%3A%2F%2Fevil.example%2Fapp",
    "%2F%2Fevil.example",
    "%2Flogin",
    "%2Fsignup%2Fverify",
    "javascript%3Aalert(1)",
    "data%3Atext%2Fhtml%2Cx",
    "%2F%5Cevil.example",
  ])("ignores the unsafe returnTo %s", async (value) => {
    window.history.replaceState(null, "", `/en/login?returnTo=${value}`);
    session.current = { status: "authenticated", viewer: VIEWER };
    stubEntries(entry());
    await renderWithProviders(
      <GuestOnly entryFailure={failure}>
        <p>sign in</p>
      </GuestOnly>,
    );
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/app/onboarding/role"),
    );
  });

  it("renders a retryable failure, never navigates, and resolves again on retry", async () => {
    window.history.replaceState(null, "", "/en/login");
    session.current = { status: "authenticated", viewer: VIEWER };
    const api = stubEntries(new TypeError("Failed to fetch"), entry());
    await renderWithProviders(
      <GuestOnly entryFailure={failure}>
        <p>sign in</p>
      </GuestOnly>,
    );
    const retry = await screen.findByRole("button", { name: "Failed to fetch" });
    expect(navigation.replace).not.toHaveBeenCalled();
    await userEvent.click(retry);
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/app/onboarding/role"),
    );
    expect(api.urls()).toHaveLength(2);
  });
});

describe("EntryRedirect (/app)", () => {
  it("is not cached: each resolution reflects current state (two tabs, before and after registration)", async () => {
    window.history.replaceState(null, "", "/en/app");
    session.current = { status: "authenticated", viewer: VIEWER };
    stubEntries(
      ACCOUNT_GATE,
      entry(),
      entry({
        destination: "fighter_home",
        reason: "fighter_onboarding_completed",
        fighter_profile: "completed",
        capabilities: ["FIGHTER"],
      }),
    );
    const first = await renderWithProviders(
      <EntryRedirect pending={<p>launch</p>} failure={failure} />,
    );
    expect(screen.getByText("launch")).toBeInTheDocument();
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenLastCalledWith("/app/onboarding/account"),
    );
    first.unmount();

    const second = await renderWithProviders(
      <EntryRedirect pending={<p>launch</p>} failure={failure} />,
    );
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenLastCalledWith("/app/onboarding/role"),
    );
    second.unmount();

    await renderWithProviders(<EntryRedirect pending={<p>launch</p>} failure={failure} />);
    await waitFor(() => expect(navigation.replace).toHaveBeenLastCalledWith("/app/home"));
    expect(navigation.replace).toHaveBeenCalledTimes(3);
  });
});

describe("OnboardingGate", () => {
  const gate = () => (
    <OnboardingGate pending={<p>launch</p>} failure={failure}>
      <p>onboarding page</p>
    </OnboardingGate>
  );

  it("sends a role onboarding page to account basics first, with the page's continuation", async () => {
    navigation.pathname = "/app/onboarding/fighter";
    window.history.replaceState(null, "", "/en/app/onboarding/fighter?intent=fighter");
    session.current = { status: "authenticated", viewer: VIEWER };
    stubEntries({ ...ACCOUNT_GATE, intent: "fighter" });
    await renderWithProviders(gate());
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(
        "/app/onboarding/account?intent=fighter",
      ),
    );
    expect(screen.queryByText("onboarding page")).not.toBeInTheDocument();
  });

  it("renders account basics while registration is incomplete", async () => {
    navigation.pathname = "/app/onboarding/account";
    window.history.replaceState(null, "", "/en/app/onboarding/account?intent=fighter");
    session.current = { status: "authenticated", viewer: VIEWER };
    stubEntries(ACCOUNT_GATE);
    await renderWithProviders(gate());
    expect(await screen.findByText("onboarding page")).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("continues from account basics once registration is complete (here or in another tab)", async () => {
    navigation.pathname = "/app/onboarding/account";
    window.history.replaceState(null, "", "/en/app/onboarding/account?intent=fighter");
    session.current = { status: "authenticated", viewer: VIEWER };
    const api = stubEntries(
      entry({
        destination: "fighter_onboarding",
        reason: "fighter_onboarding_not_started",
        mandatory: true,
        intent: "fighter",
      }),
    );
    await renderWithProviders(gate());
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(
        "/app/onboarding/fighter?intent=fighter",
      ),
    );
    expect(api.urls()).toEqual(["/api/v1/me/entry?intent=fighter"]);
  });

  it("renders a role page once account registration is complete", async () => {
    navigation.pathname = "/app/onboarding/role";
    window.history.replaceState(null, "", "/en/app/onboarding/role");
    session.current = { status: "authenticated", viewer: VIEWER };
    stubEntries(entry());
    await renderWithProviders(gate());
    expect(await screen.findByText("onboarding page")).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
