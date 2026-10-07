import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionStatus } from "@/entities/session";
import { renderWithProviders } from "@/test/render";

import { GuestOnly, RequireSession } from "./session-gate";

const session = vi.hoisted(() => ({ status: "loading" as SessionStatus }));
vi.mock("@/entities/session", () => ({ useSessionStatus: () => session.status }));

const navigation = vi.hoisted(() => ({ replace: vi.fn(), pathname: "/app/coach/fighters" }));
vi.mock("@/shared/i18n/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
}));

describe("RequireSession (AUTHENTICATED)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/en/app/coach/fighters?tab=all");
  });

  it("renders the route for a signed-in user", async () => {
    session.status = "authenticated";
    await renderWithProviders(
      <RequireSession signIn="web.login">
        <p>private</p>
      </RequireSession>,
    );
    expect(screen.getByText("private")).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("shows only a pending state while the session is restored", async () => {
    session.status = "loading";
    await renderWithProviders(
      <RequireSession signIn="web.login">
        <p>private</p>
      </RequireSession>,
    );
    expect(screen.queryByText("private")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Checking your session" })).toBeInTheDocument();
  });

  it("renders the layout's pending state (the SF-34 launch screen) only while restoring", async () => {
    session.status = "loading";
    const { rerender } = await renderWithProviders(
      <RequireSession signIn="web.login" pending={<p>launch</p>}>
        <p>private</p>
      </RequireSession>,
    );
    expect(screen.getByText("launch")).toBeInTheDocument();
    expect(screen.queryByText("private")).not.toBeInTheDocument();

    session.status = "authenticated";
    rerender(
      <RequireSession signIn="web.login" pending={<p>launch</p>}>
        <p>private</p>
      </RequireSession>,
    );
    expect(screen.queryByText("launch")).not.toBeInTheDocument();
    expect(screen.getByText("private")).toBeInTheDocument();
  });

  it.each([
    ["web.login", "/login"],
    ["web.sponsor.login", "/sponsor/login"],
    ["web.admin.login", "/admin/login"],
  ] as const)("sends a signed-out visitor to %s with returnTo", async (signIn, path) => {
    session.status = "anonymous";
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
});

describe("GuestOnly (GUEST_ONLY)", () => {
  it.each(["loading", "anonymous"] as const)("renders the page while %s", async (status) => {
    session.status = status;
    await renderWithProviders(
      <GuestOnly>
        <p>sign in</p>
      </GuestOnly>,
    );
    expect(screen.getByText("sign in")).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("sends a signed-in user to the /app entry", async () => {
    session.status = "authenticated";
    await renderWithProviders(
      <GuestOnly>
        <p>sign in</p>
      </GuestOnly>,
    );
    expect(screen.queryByText("sign in")).not.toBeInTheDocument();
    expect(navigation.replace).toHaveBeenCalledWith("/app");
  });
});
