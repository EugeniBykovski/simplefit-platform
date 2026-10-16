import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { FighterCoaches } from "./fighter-coaches";

/*
 * WFC1 My coaches (SF-60) on the SF-56 fighter endpoints, with the network
 * mocked at `fetch`: only the list projection is shown, unavailable (404) is
 * never an empty list, and a relationship is reported ended only on the
 * backend's 204.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));
const replace = vi.fn();
vi.mock("@/shared/i18n/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const COACHES = "/api/v1/me/coaches";
const active = (id: string, display: string | null, brand: string | null) => ({
  relationship_id: id,
  status: "active",
  started_at: "2026-09-01T10:00:00Z",
  ended_at: null,
  ended_by: null,
  disclosure_version: "v1",
  disclosed_fields: ["display_name", "stance"],
  // Privacy canaries: never part of the DTO; must never render even if sent.
  coach: { display_name: display, brand_name: brand, email: "coach@private.example" },
  coach_display_name_at_end: null,
});
const MAREK = active("rel-1", "Coach Marek", "Marek Boxing");
const ALEX = active("rel-2", "Alex Novak", null);
const ENDED = {
  ...active("rel-9", null, null),
  status: "ended",
  ended_at: "2026-10-02T10:00:00Z",
  ended_by: "coach",
  disclosed_fields: [],
  coach: null,
  coach_display_name_at_end: "Sam R.",
};

type Call = { method: string; path: string; query: URLSearchParams };
type Reply = Response | ((call: Call) => Response | Promise<Response>);

function server(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), "http://localhost");
      const call = {
        method: (init.method ?? "GET").toUpperCase(),
        path: url.pathname,
        query: url.searchParams,
      };
      calls.push(call);
      const reply = routes[`${call.method} ${call.path}`];
      if (reply === undefined)
        return Promise.reject(new Error(`unexpected ${call.method} ${call.path}`));
      return Promise.resolve(typeof reply === "function" ? reply(call) : reply.clone());
    }),
  );
  return calls;
}
const page = (relationships: unknown[], next_cursor: string | null = null) =>
  jsonResponse({ relationships, next_cursor });
const error = (status: number, code: string) =>
  jsonResponse({ error: { code, message: "x", details: {}, request_id: "r" } }, { status });

beforeEach(() => {
  replace.mockReset();
  toast.mockReset();
  toast.success.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("My coaches (WFC1)", () => {
  it("lists several active coaches with their public identity only", async () => {
    const calls = server({ [`GET ${COACHES}`]: page([MAREK, ALEX]) });
    await renderWithProviders(<FighterCoaches />);
    expect(await screen.findByText("Coach Marek")).toBeVisible();
    expect(screen.getByText("Alex Novak")).toBeVisible();
    expect(screen.getByText(/Marek Boxing · since/)).toBeVisible();
    expect(screen.queryByText(/coach@private/)).toBeNull();
    expect(calls[0]?.query.get("status")).toBe("active");
    expect(calls.every((call) => call.path === COACHES)).toBe(true);
  });

  it("tells an empty list apart from unavailable and from a failure", async () => {
    server({ [`GET ${COACHES}`]: page([]) });
    const one = await renderWithProviders(<FighterCoaches />);
    expect(await screen.findByText("No coaches yet")).toBeVisible();
    one.unmount();

    server({ [`GET ${COACHES}`]: error(404, "not_found") });
    const two = await renderWithProviders(<FighterCoaches />);
    expect(await screen.findByText("Coaches aren’t available")).toBeVisible();
    expect(screen.queryByText("No coaches yet")).toBeNull();
    two.unmount();

    let fail = true;
    server({ [`GET ${COACHES}`]: () => (fail ? error(500, "internal_error") : page([MAREK])) });
    await renderWithProviders(<FighterCoaches />);
    expect(await screen.findByText("We couldn’t load your coaches.")).toBeVisible();
    expect(screen.queryByText("No coaches yet")).toBeNull();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Coach Marek")).toBeVisible();
  });

  it("lists ended relationships with the name at the end and the dates only", async () => {
    const calls = server({ [`GET ${COACHES}`]: page([ENDED]) });
    await renderWithProviders(<FighterCoaches view="ended" />);
    expect(await screen.findByText("Sam R.")).toBeVisible();
    expect(screen.getByText(/Ended .* · by the coach/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "What they see" })).toBeNull();
    expect(calls[0]?.query.get("status")).toBe("ended");
    await userEvent.click(screen.getByRole("button", { name: "Active" }));
    expect(replace).toHaveBeenCalledWith("/app/coaches");
  });

  it("pages with the backend cursor", async () => {
    const calls = server({
      [`GET ${COACHES}`]: ({ query }) =>
        query.get("cursor") === "c2" ? page([ALEX]) : page([MAREK], "c2"),
    });
    await renderWithProviders(<FighterCoaches />);
    await userEvent.click(await screen.findByRole("button", { name: "Show more" }));
    expect(await screen.findByText("Alex Novak")).toBeVisible();
    expect(calls.map((call) => call.query.get("cursor"))).toEqual([null, "c2"]);
  });

  it("shows what a coach sees inline and ends only that relationship on the backend's 204", async () => {
    let ended = false;
    const calls = server({
      [`GET ${COACHES}`]: () => page(ended ? [ALEX] : [MAREK, ALEX]),
      [`POST ${COACHES}/rel-1/end`]: () => {
        ended = true;
        return new Response(null, { status: 204 });
      },
    });
    await renderWithProviders(<FighterCoaches />);
    const row = (await screen.findByText("Coach Marek")).closest("li");
    if (!row) throw new Error("no row");
    await userEvent.click(within(row).getByRole("button", { name: "What they see" }));
    expect(screen.getByText("What Coach Marek sees")).toBeVisible();
    expect(screen.getByText("Stance")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "End relationship" }));
    const dialog = screen.getByRole("alertdialog", {
      name: "End your relationship with Coach Marek?",
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep" }));
    expect(calls.some((call) => call.method === "POST")).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "End relationship" }));
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "End relationship" }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Coach Marek no longer sees your profile."),
    );
    await waitFor(() => expect(screen.queryByText("Coach Marek")).toBeNull());
    expect(screen.getByText("Alex Novak")).toBeVisible();
    expect(calls.filter((call) => call.method === "POST").map((call) => call.path)).toEqual([
      `${COACHES}/rel-1/end`,
    ]);
  });

  it("never reports an end the backend did not confirm (404)", async () => {
    server({
      [`GET ${COACHES}`]: page([MAREK]),
      [`POST ${COACHES}/rel-1/end`]: error(404, "not_found"),
    });
    await renderWithProviders(<FighterCoaches />);
    await userEvent.click(await screen.findByRole("button", { name: "What they see" }));
    await userEvent.click(screen.getByRole("button", { name: "End relationship" }));
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "End relationship" }),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        "This relationship is no longer available. Your coaches list is up to date.",
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});
