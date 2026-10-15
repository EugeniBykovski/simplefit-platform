import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getGetMyCoachFighterQueryKey } from "@/shared/api/generated/endpoints/coaching/coaching";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { CoachFighterDetail } from "./coach-fighter-detail";

/*
 * WC4 one fighter (SF-58) on the SF-56 relationship, with the network mocked
 * at `fetch`: only the disclosed C1+C2 fields, one not-available state for
 * every `404`, and ending only through the backend after confirmation.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));

const replace = vi.fn();
vi.mock("@/shared/i18n/navigation", () => ({
  usePathname: () => "/app/coach/fighters/rel-1",
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const RELATIONSHIP = {
  relationship_id: "rel-1",
  status: "active",
  started_at: "2026-09-01T10:00:00Z",
  ended_at: null,
  ended_by: null,
  disclosure_version: "fighter-disclosure-2026-10",
  disclosed_fields: ["display_name", "username", "country_code", "stance"],
  fighter: {
    display_name: "Alex Kowal",
    username: "alexk",
    country_code: "PL",
    city: null,
    experience_level: null,
    stance: "orthodox",
    amateur_bout_count: null,
    // Privacy canaries: never part of the DTO; must never render even if sent.
    weight_kg: 71.5,
    email: "alex@private.example",
  },
  fighter_display_name_at_end: null,
};

function server(end: () => Response, detail = () => jsonResponse({ relationship: RELATIONSHIP })) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
      const { pathname } = new URL(String(input), "http://localhost");
      const call = `${(init.method ?? "GET").toUpperCase()} ${pathname}`;
      calls.push(call);
      if (call === "GET /api/v1/me/coach/fighters/rel-1") return Promise.resolve(detail());
      if (call === "POST /api/v1/me/coach/fighters/rel-1/end") return Promise.resolve(end());
      return Promise.reject(new Error(`unexpected ${call}`));
    }),
  );
  return calls;
}

const notFound = () =>
  jsonResponse(
    { error: { code: "not_found", message: "Not found", details: {}, request_id: "req-1" } },
    { status: 404 },
  );

beforeEach(() => {
  replace.mockReset();
  toast.success.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("CoachFighterDetail (WC4)", () => {
  it("shows the disclosed fields and Not shared for the rest", async () => {
    server(() => new Response(null, { status: 204 }));
    await renderWithProviders(<CoachFighterDetail relationshipId="rel-1" />);

    expect(await screen.findByRole("heading", { level: 1, name: "Alex Kowal" })).toBeVisible();
    const shares = screen.getByRole("region", { name: "What Alex Kowal shares with you" });
    const value = (label: string) => within(shares).getByText(label).nextElementSibling;
    expect(value("Username")).toHaveTextContent("@alexk");
    expect(value("Country")).toHaveTextContent("Poland");
    expect(value("Stance")).toHaveTextContent("Orthodox");
    expect(value("City")).toHaveTextContent("Not shared");
    expect(value("Experience level")).toHaveTextContent("Not shared");
    expect(value("Amateur bouts")).toHaveTextContent("Not shared");
    expect(screen.queryByText(/71\.5|alex@private/)).toBeNull();
  });

  it("ends the relationship only after confirmation and forgets the cached fighter", async () => {
    const calls = server(() => new Response(null, { status: 204 }));
    const { queryClient } = await renderWithProviders(
      <CoachFighterDetail relationshipId="rel-1" />,
    );

    await userEvent.click(await screen.findByRole("button", { name: "End relationship" }));
    const dialog = screen.getByRole("alertdialog", {
      name: "End your relationship with Alex Kowal?",
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep" }));
    expect(calls).not.toContain("POST /api/v1/me/coach/fighters/rel-1/end");

    await userEvent.click(screen.getByRole("button", { name: "End relationship" }));
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "End relationship" }),
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/coach/fighters"));
    expect(toast.success).toHaveBeenCalledWith("Your relationship with Alex Kowal has ended.");
    expect(calls).toContain("POST /api/v1/me/coach/fighters/rel-1/end");
    expect(queryClient.getQueryData(getGetMyCoachFighterQueryKey("rel-1"))).toBeUndefined();
  });

  it("keeps the relationship and says so when ending fails", async () => {
    server(() =>
      jsonResponse(
        { error: { code: "internal_error", message: "x", details: {}, request_id: "r" } },
        { status: 500 },
      ),
    );
    await renderWithProviders(<CoachFighterDetail relationshipId="rel-1" />);
    await userEvent.click(await screen.findByRole("button", { name: "End relationship" }));
    const dialog = screen.getByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "End relationship" }));
    expect(await within(dialog).findByText(/Nothing changed/)).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows one not-available state for an ended, foreign or unknown relationship", async () => {
    server(() => new Response(null, { status: 204 }), notFound);
    await renderWithProviders(<CoachFighterDetail relationshipId="rel-1" />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "This fighter isn’t available" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to fighters" })).toHaveAttribute(
      "href",
      "/app/coach/fighters",
    );
    expect(screen.queryByRole("button", { name: "End relationship" })).toBeNull();
  });
});
