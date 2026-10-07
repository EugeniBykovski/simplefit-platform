import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/render";

const replace = vi.hoisted(() => vi.fn());
vi.mock("@/shared/i18n/navigation", () => ({
  useRouter: () => ({ replace }),
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={`/en${href}`}>{children}</a>
  ),
}));

const restored = () =>
  jsonResponse({
    access_token: "sfa_restored",
    access_token_expires_at: new Date(Date.now() + 900_000).toISOString(),
    refresh_token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    refresh_token_transport: "cookie",
    token_type: "Bearer",
  });

const unauthorized = () =>
  jsonResponse(
    { error: { code: "unauthorized", message: "Authentication is required", details: {} } },
    { status: 401 },
  );

/**
 * A fresh session module per test: the session is per page load. Each copy
 * would join the same cross-tab channel as the previous test's copy, so the
 * channel is switched off here.
 */
async function load() {
  vi.stubGlobal("BroadcastChannel", undefined);
  vi.resetModules();
  return (await import("./session-control")).SessionControl;
}

describe("SessionControl", () => {
  it("offers sign-in when there is no session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(unauthorized()));
    const SessionControl = await load();

    await renderWithProviders(<SessionControl />);

    expect(screen.getByRole("status", { name: "Checking your session" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/en/login",
    );
  });

  it("signs out: revokes the session, stops Google auto-select and returns to sign-in", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(restored())
      .mockResolvedValueOnce(
        jsonResponse({
          user: { id: "8a6e0804-2bd0-4672-b79d-d97027f9071b", created_at: "2026-10-01T10:00:00Z" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const disableAutoSelect = vi.fn();
    vi.stubGlobal("google", { accounts: { id: { disableAutoSelect } } });
    const SessionControl = await load();
    const user = userEvent.setup();

    await renderWithProviders(<SessionControl />, { locale: "uk" });
    await user.click(await screen.findByRole("button", { name: "Вийти" }));

    const [url, init] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/auth/logout");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer sfa_restored");
    expect(disableAutoSelect).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/login");
    expect(await screen.findByRole("link", { name: "Увійти" })).toBeInTheDocument();
  });
});
