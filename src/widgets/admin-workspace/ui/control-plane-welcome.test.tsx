import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { ControlPlaneWelcome } from "./control-plane-welcome";

/*
 * ARW1 (SF-120) with the network mocked at `fetch`: the access list is the
 * backend's permissions, only Skip, Finish and Skip tour are recorded
 * (ADR 0018 `control_plane_web_tour`), and a recorded visit is never offered again.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));
const push = vi.fn();
vi.mock("@/shared/i18n/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const operator = (permissions: string[]) => ({
  status: 200,
  body: {
    operator: {
      id: "o",
      status: "active",
      permissions,
      security_keys: { registered: 2, required: 2 },
      step_up: {
        verified_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 1_800_000).toISOString(),
        fresh_seconds_remaining: 300,
      },
      enrollment_expires_at: null,
      activated_at: null,
    },
  },
});
const firstRun = (status: string) => ({
  status: 200,
  body: {
    experiences: [
      { experience: "fighter_web_tour", status: "unavailable", recorded_at: null },
      { experience: "control_plane_web_tour", status, recorded_at: null },
    ],
  },
});
const kept = (status: string) => ({
  status: 200,
  body: {
    experience: {
      experience: "control_plane_web_tour",
      status,
      recorded_at: "2026-11-10T12:00:00Z",
    },
  },
});

type Answer = { status: number; body?: unknown };

function api(routes: Record<string, Answer[]>) {
  const calls: { key: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      const key = `${init.method ?? "GET"} ${new URL(url).pathname}`;
      calls.push({ key, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const queue = routes[key];
      if (!queue) throw new Error(`unexpected ${key}`);
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      return Promise.resolve(jsonResponse(answer.body, { status: answer.status }));
    }),
  );
  return calls;
}

const ME = "GET /api/v1/admin/me";
const RUN = "GET /api/v1/me/first-run";
const RECORD = "PUT /api/v1/me/first-run/control_plane_web_tour";

const user = userEvent.setup();
afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

describe("ARW1 Control Plane first visit (SF-120)", () => {
  it("shows exactly the granted sections and nothing as granted that isn't", async () => {
    api({ [ME]: [operator(["audit.read"])], [RUN]: [firstRun("pending")] });
    renderWithProviders(<ControlPlaneWelcome />);
    expect(
      await screen.findByRole("heading", { name: "Welcome to the Control Plane" }),
    ).toBeVisible();
    const rows = screen.getAllByRole("listitem").filter((row) => row.dataset.accessRow);
    expect(rows.map((row) => [row.dataset.accessRow, row.dataset.granted])).toEqual([
      ["sponsorOrganizations", "false"],
      ["sponsorApplications", "false"],
      ["audit", "true"],
      ["operators", "false"],
    ]);
    expect(screen.getByText(/never adds access/)).toBeVisible();
    expect(screen.getByText(/aren’t part of the Control Plane yet/)).toBeVisible();
  });

  it("tours three real steps, records completion once, then goes to the overview", async () => {
    const calls = api({
      [ME]: [operator(["audit.read"])],
      [RUN]: [firstRun("pending")],
      [RECORD]: [kept("completed")],
    });
    renderWithProviders(<ControlPlaneWelcome />);
    await user.click(await screen.findByRole("button", { name: "Take the tour" }));

    const tour = await screen.findByRole("dialog");
    expect(within(tour).getByText("Tour · 1 of 3")).toBeVisible();
    expect(within(tour).getByRole("heading", { name: "What this is" })).toBeVisible();
    await user.click(within(tour).getByRole("button", { name: "Next" }));
    expect(within(tour).getByRole("heading", { name: "Sensitive actions" })).toBeVisible();
    await user.click(within(tour).getByRole("button", { name: "Next" }));
    expect(within(tour).getByRole("heading", { name: "Your key check and leaving" })).toBeVisible();
    expect(calls.filter((call) => call.key === RECORD)).toEqual([]);

    await user.click(within(tour).getByRole("button", { name: "Finish" }));
    expect(await within(tour).findByRole("heading", { name: "You’re ready" })).toBeVisible();
    expect(calls.filter((call) => call.key === RECORD).map((call) => call.body)).toEqual([
      { outcome: "completed" },
    ]);

    await user.click(within(tour).getByRole("button", { name: "Go to overview" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"));
  });

  it("Skip records the dismissal and goes to the overview", async () => {
    const calls = api({
      [ME]: [operator([])],
      [RUN]: [firstRun("pending")],
      [RECORD]: [kept("dismissed")],
    });
    renderWithProviders(<ControlPlaneWelcome />);
    await user.click(await screen.findByRole("button", { name: "Skip" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"));
    expect(calls.filter((call) => call.key === RECORD).map((call) => call.body)).toEqual([
      { outcome: "dismissed" },
    ]);
  });

  it("a failed save says nothing changed and stays", async () => {
    api({
      [ME]: [operator([])],
      [RUN]: [firstRun("pending")],
      [RECORD]: [
        { status: 500, body: { error: { code: "internal_error", message: "x", details: {} } } },
      ],
    });
    renderWithProviders(<ControlPlaneWelcome />);
    await user.click(await screen.findByRole("button", { name: "Skip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nothing changed");
    expect(push).not.toHaveBeenCalled();
  });

  it("a recorded visit is a reference page without the offer", async () => {
    api({ [ME]: [operator([])], [RUN]: [firstRun("completed")] });
    renderWithProviders(<ControlPlaneWelcome />);
    expect(
      await screen.findByRole("heading", { name: "Welcome to the Control Plane" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Take the tour" })).toBeNull();
    expect(screen.queryByText("First visit")).toBeNull();
  });

  it("a failed first-run read can be retried", async () => {
    api({
      [ME]: [operator([])],
      [RUN]: [
        { status: 500, body: { error: { code: "internal_error", message: "x", details: {} } } },
        firstRun("pending"),
      ],
    });
    renderWithProviders(<ControlPlaneWelcome />);
    expect(
      await screen.findByRole("heading", { name: "We couldn’t load your access" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Take the tour" })).toBeVisible();
  });
});
