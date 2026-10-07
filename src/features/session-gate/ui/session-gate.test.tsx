import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Session } from "@/entities/session";
import { renderWithProviders } from "@/test/render";

import { resolveEntry } from "../model/entry";
import { GuestOnly, RequireSession } from "./session-gate";

const VIEWER = { id: "8a6e0804-2bd0-4672-b79d-d97027f9071b", created_at: "2026-10-01T10:00:00Z" };

const session = vi.hoisted(() => ({ current: { status: "loading" } as Session }));
vi.mock("@/entities/session", () => ({ useSession: () => session.current }));

const navigation = vi.hoisted(() => ({ replace: vi.fn(), pathname: "/app/coach/fighters" }));
vi.mock("@/shared/i18n/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
}));

beforeEach(() => {
  navigation.replace.mockClear();
  navigation.pathname = "/app/coach/fighters";
});

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

  it("omits returnTo when the page is not a valid destination (onboarding)", async () => {
    session.current = { status: "anonymous" };
    navigation.pathname = "/app/onboarding/fighter";
    window.history.replaceState(null, "", "/en/app/onboarding/fighter");
    await renderWithProviders(
      <RequireSession signIn="web.login">
        <p>private</p>
      </RequireSession>,
    );
    expect(navigation.replace).toHaveBeenCalledWith("/login");
  });
});

describe("GuestOnly (GUEST_ONLY)", () => {
  it.each(["loading", "anonymous"] as const)("renders the page while %s", async (status) => {
    session.current = { status };
    await renderWithProviders(
      <GuestOnly>
        <p>sign in</p>
      </GuestOnly>,
    );
    expect(screen.getByText("sign in")).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("shows the unavailable view instead of the page when the session cannot be confirmed", async () => {
    session.current = { status: "unavailable", error: new TypeError("Failed to fetch") };
    await renderWithProviders(
      <GuestOnly unavailable={<p>offline</p>}>
        <p>sign in</p>
      </GuestOnly>,
    );
    expect(screen.getByText("offline")).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("sends an authenticated viewer to the neutral /app entry", async () => {
    window.history.replaceState(null, "", "/en/login");
    session.current = { status: "authenticated", viewer: VIEWER };
    await renderWithProviders(
      <GuestOnly>
        <p>sign in</p>
      </GuestOnly>,
    );
    expect(screen.queryByText("sign in")).not.toBeInTheDocument();
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/app");
  });

  it("consumes a valid returnTo once, replacing the auth page", async () => {
    window.history.replaceState(null, "", "/en/login/code?returnTo=%2Fapp%2Fmessages%3Fthread%3D7");
    session.current = { status: "authenticated", viewer: VIEWER };
    await renderWithProviders(
      <GuestOnly>
        <p>sign in</p>
      </GuestOnly>,
    );
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/app/messages?thread=7");
  });

  it.each([
    "https%3A%2F%2Fevil.example%2Fapp",
    "%2F%2Fevil.example",
    "%2Flogin",
    "%2Fsignup%2Fverify",
    "javascript%3Aalert(1)",
  ])("ignores the unsafe returnTo %s and enters /app", async (value) => {
    window.history.replaceState(null, "", `/en/login?returnTo=${value}`);
    session.current = { status: "authenticated", viewer: VIEWER };
    await renderWithProviders(
      <GuestOnly>
        <p>sign in</p>
      </GuestOnly>,
    );
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/app");
  });
});

describe("resolveEntry", () => {
  it("uses a valid returnTo, otherwise the neutral /app entry, and infers nothing else", () => {
    expect(resolveEntry(VIEWER, "/app/home")).toBe("/app/home");
    expect(resolveEntry(VIEWER, undefined)).toBe("/app");
    expect(resolveEntry(VIEWER, "//evil.example")).toBe("/app");
    expect(resolveEntry(VIEWER, "/app/onboarding/coach")).toBe("/app");
  });
});
