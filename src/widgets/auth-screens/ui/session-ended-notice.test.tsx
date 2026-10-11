import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Session } from "@/entities/session";
import { renderWithProviders } from "@/test/render";

import { SessionEndedNotice } from "./session-ended-notice";

const session = vi.hoisted(() => ({ current: { status: "anonymous" } as Session }));
vi.mock("@/entities/session", () => ({ useSession: () => session.current }));

describe("SessionEndedNotice (SF-28)", () => {
  it("says the session ended when the API rejected it", async () => {
    session.current = { status: "anonymous", ended: "expired" };
    await renderWithProviders(<SessionEndedNotice />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your session ended. Sign in again to continue.",
    );
  });

  it("confirms a sign-out on this browser only, never a server revocation", async () => {
    session.current = { status: "anonymous", ended: "signed-out" };
    await renderWithProviders(<SessionEndedNotice />);
    expect(screen.getByRole("status")).toHaveTextContent("You’re signed out on this browser.");
  });

  it("renders nothing on a fresh visit or while signed in", async () => {
    session.current = { status: "anonymous" };
    const { unmount } = await renderWithProviders(<SessionEndedNotice />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    unmount();
    session.current = { status: "authenticated", viewer: { id: "x", created_at: "y" } as never };
    await renderWithProviders(<SessionEndedNotice />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
